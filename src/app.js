/* ============================================================
   SinghoClock — core logic (runs in the browser *and* in node)
   Every function below is pure / dependency-injected so it can be
   exercised by test/app.test.mjs without a DOM.
   ============================================================ */

/* ---------------- formatting ---------------- */

export const pad = (n, len = 2) => {
  const s = String(Math.floor(Math.abs(n)));
  return s.length >= len ? s.slice(-len) : '0'.repeat(len - s.length) + s;
};

/* Intl formatters are expensive to build and cheap to reuse — one per key. */
const dtfCache = new Map();
const cachedDTF = (key, make) => {
  let f = dtfCache.get(key);
  if (!f) { f = make(); dtfCache.set(key, f); }
  return f;
};

export const timeFormatter = (timeZone) => cachedDTF(`t|${timeZone}`, () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', fractionalSecondDigits: 3,
  }));

/** Split a millisecond timestamp into the parts the display needs.
    With a timeZone, hours/minutes/seconds come from that zone; the
    millisecond-within-the-second is the same instant everywhere. */
export function toSegments(date, timeZone) {
  const ms = pad(date.getMilliseconds(), 3);
  if (!timeZone) {
    return { hh: pad(date.getHours()), mm: pad(date.getMinutes()), ss: pad(date.getSeconds()), ms };
  }
  const parts = timeFormatter(timeZone).formatToParts(date);
  const get = (t) => {
    const p = parts.find((x) => x.type === t);
    return p ? p.value : '00';
  };
  const hh = get('hour') === '24' ? '00' : get('hour');
  return { hh, mm: get('minute'), ss: get('second'), ms: get('fractionalSecond').slice(0, 3).padEnd(3, '0') };
}

/** "14:05:09:007" — HH:MM:SS:mmm */
export function formatClock(date, timeZone) {
  const s = toSegments(date, timeZone);
  return `${s.hh}:${s.mm}:${s.ss}:${s.ms}`;
}

/* The big display is built from these alternating runs:
   hh : mm : ss : mmm                                         */
export const SEGMENT_SHAPE = [
  ['hh', 2, 'digit'],
  ['sep', 1, 'sep'],
  ['mm', 2, 'digit'],
  ['sep', 1, 'sep'],
  ['ss', 2, 'digit'],
  ['sep', 1, 'sep'],
  ['ms', 3, 'ms'],
];

/** ['1','4',':','0','5',':','0','9',':','0','0','7'] */
/** hh/mm/ss/ms parts of a countdown duration, clamped at 99:59:59.999. */
export function timerSegments(ms) {
  const t = Math.max(0, Math.floor(ms));
  return {
    hh: pad(Math.min(Math.floor(t / 3600000), 99)),
    mm: pad(Math.floor(t / 60000) % 60),
    ss: pad(Math.floor(t / 1000) % 60),
    ms: pad(t % 1000, 3),
  };
}

const segDigits = (s) => {
  const out = [];
  for (const [key, len] of SEGMENT_SHAPE) {
    const v = key === 'sep' ? ':' : s[key];
    for (let i = 0; i < len; i++) out.push(v[i]);
  }
  return out;
};

export function toDigits(date, timeZone) {
  return segDigits(toSegments(date, timeZone));
}

export const DIGIT_KIND = SEGMENT_SHAPE.flatMap(([, len, kind]) =>
  Array.from({ length: len }, () => kind),
);

/**
 * In Saans with MONO=100 every glyph we render — digits, colon and period —
 * advances exactly 600/1000 em (verified against the font's hmtx table), so the
 * whole HH:MM:SS:mmm string is 12 × 0.6 em wide. That makes the clock fit any
 * viewport with one multiplication instead of a measurement round trip.
 */
export const MONO_ADVANCE = 0.6;
export const LETTER_SPACE_EM = 0.02; // mirrors .clock { letter-spacing: -.02em } in styles.css
export const CLOCK_GLYPHS = SEGMENT_SHAPE.reduce((n, [, len]) => n + len, 0); // 12
// effective width of the whole string in em: 12 × (0.6 advance − 0.02 letter-spacing)
export const CLOCK_EMS = 6.96;

/* ---------------- header line (date + time above the clock) ---------------- */

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatDateLong(date, opts = {}) {
  const locale = opts.locale || 'en-GB';
  try {
    return cachedDTF(`d|${locale}|${opts.timeZone || ''}`, () => new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: opts.timeZone,
    })).format(date);
  } catch {
    return `${WD[date.getDay()]} ${date.getDate()} ${MO[date.getMonth()]} ${date.getFullYear()}`;
  }
}

export function formatTimeShort(date, opts = {}) {
  const locale = opts.locale || 'en-GB';
  try {
    return cachedDTF(`s|${locale}|${opts.timeZone || ''}`, () => new Intl.DateTimeFormat(locale, {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: opts.timeZone,
    })).format(date);
  } catch {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

export function zoneInfo(date = new Date(), timeZone) {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let abbr = '';
  try {
    abbr = cachedDTF(`a|${tz}`, () => new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    })).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch { /* ignore */ }
  let minutes = null;
  try {
    const gmt = cachedDTF(`o|${tz}`, () => new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'longOffset',
    })).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = gmt.match(/GMT([+-])(\d{2}):(\d{2})/);
    minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  } catch { /* ignore */ }
  if (minutes === null) minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const utc = `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return { tz, abbr, utc, minutes };
}

/* ---------------- timezone catalogue + flags ---------------- */

const FALLBACK_ZONES = [
  'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago', 'America/Denver',
  'America/Lima', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
  'America/Santiago', 'America/Sao_Paulo', 'America/Toronto', 'America/Vancouver',
  'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Manila', 'Asia/Seoul', 'Asia/Shanghai',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Melbourne', 'Australia/Perth',
  'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin',
  'Europe/Brussels', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London',
  'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome',
  'Europe/Stockholm', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Honolulu',
];

/** Every IANA zone the runtime knows about (400+), with a sane fallback. */
export function allTimeZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const list = [...Intl.supportedValuesOf('timeZone')];
      // ICU lists Etc/UTC but not the plain "UTC" alias — a clock must offer it
      if (!list.includes('UTC')) list.unshift('UTC');
      if (Array.isArray(list) && list.length) return list;
    }
  } catch { /* ignore */ }
  return FALLBACK_ZONES;
}

export const cityOf = (z) =>
  z.indexOf('/') === -1 ? z : z.slice(z.indexOf('/') + 1).replace(/_/g, ' ');

export const regionOf = (z) =>
  z.indexOf('/') === -1 ? 'UTC' : z.slice(0, z.indexOf('/'));

/* flags.js (generated by build_flags.py) puts the IANA zone→country table and
   the flag SVG data URIs on globalThis.__SINGHOAH_FLAGS. */

export const GLOBE_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 15"><rect width="20" height="15" rx="2" fill="#898a90"/><circle cx="10" cy="7.5" r="5.2" fill="none" stroke="#fff" stroke-width="1.1"/><path d="M4.8 7.5h10.4M10 2.3c2.2 1.7 2.2 8.7 0 10.4c-2.2-1.7-2.2-8.7 0-10.4" fill="none" stroke="#fff" stroke-width="1"/></svg>',
)}`;

/** ISO 3166-1 alpha-2 for a zone, or null (unknown zones). */
export function zoneCountry(tz) {
  const m = globalThis.__SINGHOAH_FLAGS;
  return (m && m.zoneCc && m.zoneCc[tz]) || null;
}

/** Flag image for an ISO country code; the globe only for unknown codes. */
export function ccFlag(cc) {
  const m = globalThis.__SINGHOAH_FLAGS;
  return (m && cc && m.png[cc]) || GLOBE_SVG;
}

/** Flag image for a zone, via its country. */
export function flagSrc(tz) {
  return ccFlag(zoneCountry(tz));
}

/* ---------------- languages ---------------- */

/* Twenty-five languages; the Chinese entry is Traditional Chinese, as
   flown by TW. Arabic and Urdu run RTL; Serbian ships in Latin script. */
export const LANGS = [
  /* conventional order: Latin-script languages first, alphabetical by
     English name; every other script follows, also alphabetical. The
     fallback language stays English regardless of position. */
  { id: 'da', locale: 'da-DK', flag: 'DK', name: 'Dansk', dir: 'ltr' },
  { id: 'nl', locale: 'nl-NL', flag: 'NL', name: 'Nederlands', dir: 'ltr' },
  { id: 'nl-BE', locale: 'nl-BE', flag: 'BE', name: 'Nederlands (België)', dir: 'ltr' },
  { id: 'en', locale: 'en-GB', flag: 'GB', name: 'English', dir: 'ltr' },
  { id: 'fi', locale: 'fi-FI', flag: 'FI', name: 'Suomi', dir: 'ltr' },
  { id: 'fr', locale: 'fr-FR', flag: 'FR', name: 'Français', dir: 'ltr' },
  { id: 'de', locale: 'de-DE', flag: 'DE', name: 'Deutsch', dir: 'ltr' },
  { id: 'id', locale: 'id-ID', flag: 'ID', name: 'Bahasa Indonesia', dir: 'ltr' },
  { id: 'it', locale: 'it-IT', flag: 'IT', name: 'Italiano', dir: 'ltr' },
  { id: 'ms', locale: 'ms-MY', flag: 'MY', name: 'Bahasa Melayu', dir: 'ltr' },
  { id: 'nb', locale: 'nb-NO', flag: 'NO', name: 'Norsk', dir: 'ltr' },
  { id: 'pl', locale: 'pl-PL', flag: 'PL', name: 'Polski', dir: 'ltr' },
  { id: 'pt', locale: 'pt-BR', flag: 'BR', name: 'Português', dir: 'ltr' },
  { id: 'sr', locale: 'sr-Latn-RS', flag: 'RS', name: 'Srpski', dir: 'ltr' },
  { id: 'es', locale: 'es-ES', flag: 'ES', name: 'Español', dir: 'ltr' },
  { id: 'sv', locale: 'sv-SE', flag: 'SE', name: 'Svenska', dir: 'ltr' },
  /* other scripts, alphabetical by English name */
  { id: 'ar', locale: 'ar', flag: 'SA', name: 'العربية', dir: 'rtl' },
  { id: 'bn', locale: 'bn', flag: 'BD', name: 'বাংলা', dir: 'ltr' },
  { id: 'zh-Hant', locale: 'zh-Hant-TW', flag: 'TW', name: '中文（繁體）', dir: 'ltr' },
  { id: 'el', locale: 'el-GR', flag: 'GR', name: 'Ελληνικά', dir: 'ltr' },
  { id: 'hi', locale: 'hi-IN', flag: 'IN', name: 'हिन्दी', dir: 'ltr' },
  { id: 'ja', locale: 'ja-JP', flag: 'JP', name: '日本語', dir: 'ltr' },
  { id: 'ko', locale: 'ko-KR', flag: 'KR', name: '한국어', dir: 'ltr' },
  { id: 'ru', locale: 'ru-RU', flag: 'RU', name: 'Русский', dir: 'ltr' },
  { id: 'ur', locale: 'ur', flag: 'PK', name: 'اردو', dir: 'rtl' },
];

export const STRINGS = {
  en: {
    fareXsys: 'different systems — fares are computed within one system',
    wallet: 'Wallet', walBalance: 'Balance', walExpense: 'Expense', walIncome: 'Income',
    walAmount: 'Amount', walNote: 'Note', walAdd: 'Add', mAdd: 'Add', mCode: 'Code', mCodePh: 'your code…', mLang: 'Language', mSetup: 'Preparing {name} — the first run downloads it once', mBusy: 'Running…', mMs: 'done in {ms} ms', mNetErr: '{name} could not load — check your internet connection', mStopped: 'Stopped — took too long', zoomIn: 'Zoom in', zoomOut: 'Zoom out', walDays: 'Days', walReports: 'Reports', walCash: 'Cash', lpModule:'Module',lpModuleSub:'Visual automation, n8n style',flFiles:'Files',flNew:'New',flOpen:'Open',flRename:'Rename',flDuplicate:'Duplicate',flDelete:'Delete',flExport:'Export',flImport:'Import',flUpdated:'Edited',flEmpty:'No documents yet',flSearch:'Search',flConfirm:'Delete for good?',flUntitledNote:'Untitled note',flUntitledFlow:'Untitled flow',mRun:'Run',mGrid:'Grid',mText:'Text',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'the text your code reads…', mFeedHint:'the program is asking for input — type it into the I/O node and run again',mResult:'Result',encPlain:'Plain',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'HTML entities',encRot:'ROT13',
    walSpent: 'Spent', walMonth: 'This month', walAvg: 'Daily average', walWeek: 'Last 7 days',
    walTop: 'Largest expense', pDay: 'Day', pWeek: 'Week', pMonth: 'Month', pSem: 'Semester', pYear: 'Year', pDec: 'Decade', walNet: 'Net', walEmpty: 'No transactions yet', walCurrency: 'Currency symbol', walDelete: 'Delete entry', walCurSearch: 'Search currencies…', launchpad: 'Launchpad', lpClock: 'Clock', lpClockSub: 'Drift-corrected world clock', lpWalletSub: 'Balance, daily spending & reports',
    date: 'Date', time: 'Time', window: 'Window', light: 'Light', night: 'Night Shift',
    resync: 'Re-sync', search: 'Search city or country…', signin: 'Sign in', signout: 'Sign out', account: 'Account', settings: 'Settings', appearance: 'Appearance', homeCity: 'Clock city', currency: 'Currency', data: 'Data', resetData: 'Reset local data', resetQ: 'Clear language, theme, city, currency and account snapshots on this device? Wallet transactions are kept.', portalNote: 'Sign in and your language, theme, city, currency and wallet follow your Google account on any device.', lpSettingsSub: 'Language, theme, city & currency', scribeIn: 'Spoken language', scribeOut: 'Transcript language', scribeStart: 'Start', scribeStop: 'Stop', scribeListening: 'Listening', scribeClear: 'Clear', scribeCopy: 'Copy', scribeDownload: 'Download', scribeSaved: 'All changes saved', scribeSaving: 'Saving…', scribeWords: 'words', scribeHint: 'Press Start and speak — the transcript appears here and stays editable.', scribeNo: 'Speech recognition is not supported in this browser.', scribeUndo: 'Undo', scribeRedo: 'Redo', scribeFind: 'Find', scribeReplace: 'Replace', scribeReplaceAll: 'Replace all', scribePrint: 'Print', scribeImport: 'Import text file', scribeStamps: 'Timestamps', scribeChars: 'characters', scribeNoHits: 'No matches', lpScribeSub: 'Live lecture transcription', lpScribe: 'Scribe', language: 'Language', local: 'Local',
    addZone: 'Add zone', single: 'Single', side: 'Side by side', quad: '2 × 2', grid16: '4 × 4', clearAll: 'Clear all', aiTip: 'On-device AI (WebGPU) for loose commands and light questions', aiLoad: 'AI is waking up — the on-device model downloads once on first use. Ask again in a moment.', aiNoGpu: 'This browser has no WebGPU, so the on-device AI can’t run here — every command still works when typed.', timeIn: 'It is {t} in {c}.', remindSet: 'Reminder in {n} min', remindNow: 'Time’s up', clearChat: 'clear chat', voiceTip: 'Speak replies aloud',
    winTitle: 'Window layout', winAdd: 'Add to this window',
    analog: 'Analog', digital: 'Digital',
    timer: 'Timer', start: 'Start', pause: 'Pause', resume: 'Resume', done: 'Done', running: 'running', paused: 'paused', minutes: 'Minutes', clear: 'Clear',
    stopwatch: 'Stopwatch', reset: 'Reset', ipTitle: 'IP locator', ipAddr: 'IP address', mac: 'MAC', location: 'Location', coords: 'Coordinates', useTz: 'Use this time zone', macNA: 'hidden by the browser', locating: 'locating…',
    map: 'Map',
    synced: 'Synced · {src}', corrected: 'Corrected · {src}',
    drift: 'device drift {mag} — corrected{res}',
    offLabel: 'System clock — reference unavailable', offDetail: 'no drift correction applied',
    lastCheck: 'last check {t}', syncing: 'syncing…', secondRes: ' · second resolution', checking: 'checking…',
    nightTitle: 'Toggle night shift (N)', tzTitle: 'Time zone', modeTitle: 'Analog / digital (A)', resyncTitle: 'Re-check the reference time (R)', fullTitle: 'Full screen (F)', full: 'Full screen', tzSearchPh: 'Search time zones…', tzListAria: 'Time zones', prevMatch: 'Previous match', nextMatch: 'Next match', closeFind: 'Close find bar', scrDocAria: 'Transcript document', docTitle: 'Document title', untitled: 'Untitled document', smatePh: 'Type a command…', smateTip: 'SMate assistant', smateSend: 'Send', smateOnline: 'Online', smateTyping: 'typing…', smateUnavailable: 'unavailable', smateVoice: 'Voice input', smateHi: 'Hi, I’m SMate. Try “timer 5”, “zone Taipei”, “open wallet”, “night shift” or “help”.', smateUnknown: 'Sorry, I didn’t catch that. Type “help” to see what I can do.',
    mHint: 'Tap a station, then another — the fare appears here.', mFrom: 'From', mTo: 'To', mFare: 'Fare', mStations: 'stations', mTransfers: 'transfers', mMin: 'min', mSwap: 'Swap', mClear: 'Clear', mTRTC: 'Taipei Metro', mTY: 'Airport MRT', mKS: 'Kaohsiung Metro', mTC: 'Taichung Metro',lpMetro: 'Metro',  lpMetroSub: 'Tap-tap fare calculator', lpWelcomeT: 'Welcome to SinghoLaunch', lpWelcomeS: 'One launchpad for your world clock, metro fares, wallet, notes and settings — private, offline and yours.', lpStart: 'Get started', lpWorld: 'Around the world', lpToday: 'Today',
    mCard: 'Card', mCardTap: 'Hold the card against the back of the phone…', mCardNone: 'No card reader here — scanning needs a phone with NFC.', mCardSeen: 'Card recognized', mCardBal: 'Balance (NT$)', mCardNote: 'The balance lives on this device only. No website can read it from the card.',
  },
  'zh-Hant': {
    fareXsys: '不同系統——票價僅在同一系統內計算',
    wallet: '錢包', walBalance: '餘額', walExpense: '支出', walIncome: '收入',
    walAmount: '金額', walNote: '備註', walAdd: '新增', mAdd: '新增', mCode: '程式', mCodePh: '你的程式碼…', mLang: '語言', mSetup: '正在準備 {name} — 首次執行會下載一次', mBusy: '執行中…', mMs: '{ms} 毫秒內完成', mNetErr: '無法載入 {name} — 請檢查網路連線', mStopped: '已停止 — 執行太久', zoomIn: '放大', zoomOut: '縮小', walDays: '每日', walReports: '報表', walCash: '現金', lpModule:'模組',lpModuleSub:'視覺化自動化流程',flFiles:'檔案',flNew:'新增',flOpen:'開啟',flRename:'重新命名',flDuplicate:'建立副本',flDelete:'刪除',flExport:'匯出',flImport:'匯入',flUpdated:'已編輯',flEmpty:'還沒有任何文件',flSearch:'搜尋',flConfirm:'確定要刪除嗎？',flUntitledNote:'未命名筆記',flUntitledFlow:'未命名流程',mRun:'執行',mGrid:'網格',mText:'文字',mMarkdown:'標記',mIO:'I/O', mIOPh:'程式讀取的文字…', mFeedHint:'程式正在等待輸入 — 請在 I/O 節點輸入文字後再執行一次',mResult:'結果',encPlain:'純文字',encB64:'Base64',encUrl:'URL',encHex:'十六進位',encUni:'Unicode',encEnt:'HTML 實體',encRot:'ROT13',
    walSpent: '已花費', walMonth: '本月', walAvg: '日均', walWeek: '最近 7 天',
    walTop: '最大支出', pDay: '日', pWeek: '週', pMonth: '月', pSem: '學期', pYear: '年', pDec: '十年', walNet: '淨額', walEmpty: '尚無交易', walCurrency: '貨幣符號', walDelete: '刪除項目', walCurSearch: '搜尋貨幣…', launchpad: '啟動台', lpClock: '時鐘', lpClockSub: '漂移校正世界時鐘', lpWalletSub: '餘額、每日花費與報表',
    date: '日期', time: '時間', window: '視窗', light: '淺色', night: '夜間模式',
    resync: '重新同步', search: '搜尋城市或國家…', signin: '登入', signout: '登出', account: '帳戶', settings: '設定', appearance: '外觀', homeCity: '時鐘城市', currency: '貨幣', data: '資料', resetData: '重設本地資料', resetQ: '清除此裝置上的語言、外觀、城市、貨幣與帳戶快照？錢包交易會保留。', portalNote: '登入後，您的語言、外觀、城市、貨幣與錢包將隨 Google 帳戶在任何裝置上同步。', lpSettingsSub: '語言、外觀、城市與貨幣', scribeIn: '語音語言', scribeOut: '轉寫語言', scribeStart: '開始', scribeStop: '停止', scribeListening: '聆聽中', scribeClear: '清除', scribeCopy: '複製', scribeDownload: '下載', scribeSaved: '所有變更已儲存', scribeSaving: '儲存中…', scribeWords: '字', scribeHint: '按下「開始」並說話——轉寫會出現在這裡，並可隨時編輯。', scribeNo: '此瀏覽器不支援語音辨識。', scribeUndo: '復原', scribeRedo: '重做', scribeFind: '尋找', scribeReplace: '取代', scribeReplaceAll: '全部取代', scribePrint: '列印', scribeImport: '匯入文字檔', scribeStamps: '時間戳記', scribeChars: '字元', scribeNoHits: '沒有符合的結果', lpScribeSub: '即時課堂轉寫', lpScribe: '聽寫', language: '語言', local: '本地',
    addZone: '新增時區', single: '單一', side: '並排', quad: '2 × 2', grid16: '4 × 4', clearAll: '全部清除', aiTip: '本機 AI（WebGPU）：隨意說法與輕鬆問答', aiLoad: 'AI 正在醒來——本機模型首次使用時下載一次，請稍候再問。', aiNoGpu: '此瀏覽器沒有 WebGPU，本機 AI 無法運行——所有指令仍可輸入使用。', timeIn: '{c} 現在是 {t}。', remindSet: '{n} 分鐘後提醒您', remindNow: '時間到了', clearChat: '清除對話', voiceTip: '朗讀回覆',
    winTitle: '視窗格式', winAdd: '加入此視窗',
    analog: '類比', digital: '數位',
    timer: '計時器', start: '開始', pause: '暫停', resume: '繼續', done: '完成', running: '運行中', paused: '已暫停', minutes: '分鐘', clear: '清除',
    stopwatch: '碼表', reset: '重置', ipTitle: 'IP 定位', ipAddr: 'IP 位址', mac: 'MAC', location: '位置', coords: '座標', useTz: '使用此時區', macNA: '瀏覽器不公開', locating: '定位中…',
    map: '地圖',
    synced: '已同步 · {src}', corrected: '已校正 · {src}',
    drift: '裝置漂移 {mag} — 已校正{res}',
    offLabel: '系統時鐘 — 無可用時間來源', offDetail: '未套用漂移校正',
    lastCheck: '上次檢查 {t}', syncing: '同步中…', secondRes: ' · 秒級解析度', checking: '檢查中…',
    nightTitle: '切換夜間模式（N）', tzTitle: '時區', modeTitle: '類比／數位（A）', resyncTitle: '重新檢查參考時間（R）', fullTitle: '全螢幕（F）', full: '全螢幕', tzSearchPh: '搜尋時區…', tzListAria: '時區', prevMatch: '上一個符合項', nextMatch: '下一個符合項', closeFind: '關閉尋找列', scrDocAria: '轉寫文件', docTitle: '文件標題', untitled: '未命名文件', smatePh: '輸入指令…', smateTip: 'SMate 助理', smateSend: '傳送', smateOnline: '線上', smateTyping: '輸入中…', smateUnavailable: '無法使用', smateVoice: '語音輸入', smateHi: '嗨，我是 SMate。試試「計時器 5」、「時區 台北」、「開啟錢包」、「夜間模式」或「help」。', smateUnknown: '抱歉，我沒聽懂。輸入「help」看看我能做什麼。',
    mHint: '點一個車站，再點另一個——票價就顯示在這裡。', mFrom: '從', mTo: '到', mFare: '票價', mStations: '站', mTransfers: '轉乘', mMin: '分', mSwap: '交換', mClear: '清除', mTRTC: '台北捷運', mTY: '機場捷運', mKS: '高雄捷運', mTC: '臺中捷運',lpMetro: '捷運',  lpMetroSub: '點兩站算票價', lpWelcomeT: '歡迎使用 SinghoLaunch', lpWelcomeS: '一個啟動台，集合世界時鐘、捷運票價、錢包、筆記與設定——私密、離線、屬於你。', lpStart: '開始使用', lpWorld: '世界各地', lpToday: '今天',
    mCard: '卡片', mCardTap: '將卡片貼近手機背面…', mCardNone: '此裝置沒有讀卡功能——需要具 NFC 的手機。', mCardSeen: '已辨識卡片', mCardBal: '餘額（NT$）', mCardNote: '餘額只存在此裝置。任何網站都無法從卡片讀取。',
  },
  hi: {
    fareXsys: 'अलग-अलग सिस्टम — किराया एक ही सिस्टम में तय होता है',
    wallet: 'वॉलेट', walBalance: 'बैलेंस', walExpense: 'ख़र्च', walIncome: 'आय',
    walAmount: 'राशि', walNote: 'नोट', walAdd: 'जोड़ें', mAdd: 'जोड़ें', mCode: 'कोड', mCodePh: 'अपना कोड…', mLang: 'भाषा', mSetup: '{name} तैयार हो रहा है — पहली बार एक बार डाउनलोड होगा', mBusy: 'चल रहा है…', mMs: '{ms} मि॰से॰ में पूर्ण', mNetErr: '{name} लोड नहीं हुआ — इंटरनेट जाँचें', mStopped: 'रुक गया — बहुत समय लगा', zoomIn: 'ज़ूम इन', zoomOut: 'ज़ूम आउट', walDays: 'दिन', walReports: 'रिपोर्ट', walCash: 'नकद', lpModule:'मॉड्यूल',lpModuleSub:'विज़ुअल ऑटोमेशन फ़्लो',flFiles:'फ़ाइलें',flNew:'नया',flOpen:'खोलें',flRename:'नाम बदलें',flDuplicate:'प्रतिलिपि',flDelete:'हटाएँ',flExport:'निर्यात',flImport:'आयात',flUpdated:'संपादित',flEmpty:'अभी कोई दस्तावेज़ नहीं',flSearch:'खोजें',flConfirm:'हमेशा के लिए हटाएँ?',flUntitledNote:'शीर्षकहीन नोट',flUntitledFlow:'शीर्षकहीन फ़्लो',mRun:'चलाएँ',mGrid:'ग्रिड',mText:'पाठ',mMarkdown:'मार्कडाउन',mIO:'I/O', mIOPh:'वह पाठ जो आपका कोड पढ़ेगा…', mFeedHint:'प्रोग्राम इनपुट माँग रहा है — I/O नोड में टाइप करके फिर चलाएँ',mResult:'परिणाम',encPlain:'सादा',encB64:'Base64',encUrl:'URL',encHex:'हेक्स',encUni:'यूनिकोड',encEnt:'HTML एंटिटी',encRot:'ROT13',
    walSpent: 'ख़र्च हुआ', walMonth: 'इस माह', walAvg: 'दैनिक औसत', walWeek: 'पिछले 7 दिन',
    walTop: 'सबसे बड़ा ख़र्च', pDay: 'दिन', pWeek: 'सप्ताह', pMonth: 'महीना', pSem: 'सेमेस्टर', pYear: 'वर्ष', pDec: 'दशक', walNet: 'शुद्ध', walEmpty: 'अभी कोई लेन-देन नहीं', walCurrency: 'मुद्रा चिन्ह', walDelete: 'हटाएँ', walCurSearch: 'मुद्राएँ खोजें…', launchpad: 'लॉन्चपैड', lpClock: 'घड़ी', lpClockSub: 'ड्रिफ्ट-सुधारी विश्व घड़ी', lpWalletSub: 'बैलेंस, दैनिक ख़र्च और रिपोर्ट',
    date: 'तिथि', time: 'समय', window: 'विंडो', light: 'लाइट', night: 'नाइट शिफ्ट',
    resync: 'री-सिंक', search: 'शहर या देश खोजें…', signin: 'साइन इन', signout: 'साइन आउट', account: 'खाता', settings: 'सेटिंग्स', appearance: 'दिखावट', homeCity: 'घड़ी शहर', currency: 'मुद्रा', data: 'डेटा', resetData: 'स्थानीय डेटा रीसेट करें', resetQ: 'इस डिवाइस पर भाषा, थीम, शहर, मुद्रा और खाता स्नैपशॉट साफ़ करें? वॉलेट लेन-देन बने रहेंगे।', portalNote: 'साइन इन करें और आपकी भाषा, थीम, शहर, मुद्रा और वॉलेट किसी भी डिवाइस पर आपके Google खाते के साथ चलेंगे।', lpSettingsSub: 'भाषा, थीम, शहर और मुद्रा', scribeIn: 'बोली भाषा', scribeOut: 'लेख भाषा', scribeStart: 'शुरू', scribeStop: 'रोकें', scribeListening: 'सुन रहा है', scribeClear: 'साफ़', scribeCopy: 'कॉपी', scribeDownload: 'डाउनलोड', scribeSaved: 'सभी परिवर्तन सहेजे गए', scribeSaving: 'सहेजा जा रहा…', scribeWords: 'शब्द', scribeHint: 'स्टार्ट दबाएँ और बोलिए — लेख यहाँ दिखेगा और संपादनीय रहेगा।', scribeNo: 'इस ब्राउज़र में वाक् पहचान समर्थित नहीं है।', scribeUndo: 'पूर्ववत करें', scribeRedo: 'फिर करें', scribeFind: 'खोजें', scribeReplace: 'बदलें', scribeReplaceAll: 'सभी बदलें', scribePrint: 'प्रिंट करें', scribeImport: 'टेक्स्ट फ़ाइल आयात करें', scribeStamps: 'टाइमस्टैम्प', scribeChars: 'वर्ण', scribeNoHits: 'कोई मिलान नहीं', lpScribeSub: 'लाइव व्याख्यान प्रतिलेखन', lpScribe: 'स्क्राइब', language: 'भाषा', local: 'स्थानीय',
    addZone: 'ज़ोन जोड़ें', single: 'एकल', side: 'साथ-साथ', quad: '2 × 2', grid16: '4 × 4', clearAll: 'सभी साफ़ करें', aiTip: 'ढीले कमांड और हल्के सवालों के लिए डिवाइस पर AI (WebGPU)', aiLoad: 'AI जाग रहा है — पहली बार मॉडल डाउनलोड होता है। थोड़ी देर में फिर पूछें।', aiNoGpu: 'इस ब्राउज़र में WebGPU नहीं है, इसलिए on-device AI नहीं चलेगा — कमांड टाइप करके चलेंगी।', timeIn: '{c} में अभी {t} बजे हैं।', remindSet: '{n} मिनट में याद दिलाऊँगा', remindNow: 'समय हो गया', clearChat: 'चैट साफ़ करें', voiceTip: 'जवाब बोलकर सुनाएँ',
    winTitle: 'विंडो लेआउट', winAdd: 'इस विंडो में जोड़ें',
    analog: 'एनालॉग', digital: 'डिजिटल',
    timer: 'टाइमर', start: 'शुरू', pause: 'रोकें', resume: 'जारी', done: 'हो गया', running: 'चल रहा', paused: 'रुका', minutes: 'मिनट', clear: 'हटाएँ',
    stopwatch: 'स्टॉपवॉच', reset: 'रीसेट', ipTitle: 'IP लोकेटर', ipAddr: 'IP पता', mac: 'MAC', location: 'स्थान', coords: 'निर्देशांक', useTz: 'यह समयक्षेत्र उपयोग करें', macNA: 'ब्राउज़र नहीं बताता', locating: 'पता लगा रहे हैं…',
    map: 'नक्शा',
    synced: 'सिंक हुआ · {src}', corrected: 'समायोजित · {src}',
    drift: 'डिवाइस ड्रिफ्ट {mag} — समायोजित{res}',
    offLabel: 'सिस्टम घड़ी — संदर्भ अनुपलब्ध', offDetail: 'कोई ड्रिफ्ट सुधार लागू नहीं',
    lastCheck: 'अंतिम जाँच {t}', syncing: 'सिंक हो रहा है…', secondRes: ' · सेकंड रिज़ॉल्यूशन', checking: 'जाँच हो रही है…',
    nightTitle: 'नाइट शिफ्ट चालू/बंद करें (N)', tzTitle: 'समय क्षेत्र', modeTitle: 'एनालॉग / डिजिटल (A)', resyncTitle: 'संदर्भ समय दोबारा जाँचें (R)', fullTitle: 'फ़ुल स्क्रीन (F)', full: 'फ़ुल स्क्रीन', tzSearchPh: 'समय क्षेत्र खोजें…', tzListAria: 'समय क्षेत्र', prevMatch: 'पिछला मिलान', nextMatch: 'अगला मिलान', closeFind: 'खोज पट्टी बंद करें', scrDocAria: 'लेख दस्तावेज़', docTitle: 'दस्तावेज़ शीर्षक', untitled: 'बिना शीर्षक दस्तावेज़', smatePh: 'कमांड लिखें…', smateTip: 'SMate सहायक', smateSend: 'भेजें', smateOnline: 'ऑनलाइन', smateTyping: 'टाइप कर रहा है…', smateUnavailable: 'अनुपलब्ध', smateVoice: 'बोलकर लिखें', smateHi: 'नमस्ते, मैं SMate हूँ। "टाइमर 5", "ज़ोन ताइपे", "वॉलेट खोलें", "नाइट शिफ्ट" या "help" आज़माएँ।', smateUnknown: 'क्षमा करें, समझ नहीं आया। "help" लिखें।',
    mHint: 'एक स्टेशन छूएँ, फिर दूसरा — किराया यहाँ दिखेगा।', mFrom: 'से', mTo: 'तक', mFare: 'किराया', mStations: 'स्टेशन', mTransfers: 'ट्रांसफ़र', mMin: 'मिनट', mSwap: 'बदलें', mClear: 'साफ़ करें', mTRTC: 'ताइपे मेट्रो', mTY: 'एयरपोर्ट MRT', mKS: 'काओशियुंग मेट्रो', mTC: 'ताइचुंग मेट्रो',lpMetro: 'मेट्रो',  lpMetroSub: 'दो स्टेशन छूकर किराया', lpWelcomeT: 'SinghoLaunch में स्वागत है', lpWelcomeS: 'एक ही लॉन्चपैड — विश्व घड़ी, मेट्रो किराया, वॉलेट, नोट्स और सेटिंग्स — निजी, ऑफ़लाइन और आपका।', lpStart: 'शुरू करें', lpWorld: 'दुनिया भर में', lpToday: 'आज',
    mCard: 'कार्ड', mCardTap: 'कार्ड फ़ोन की पीठ से छुएँ…', mCardNone: 'यहाँ कार्ड रीडर नहीं — स्कैन के लिए NFC वाला फ़ोन चाहिए।', mCardSeen: 'कार्ड पहचाना गया', mCardBal: 'बैलेंस (NT$)', mCardNote: 'बैलेंस सिर्फ़ इस डिवाइस पर रहता है। कोई वेबसाइट इसे कार्ड से नहीं पढ़ सकती।',
  },
  es: {
    fareXsys: 'sistemas distintos: la tarifa se calcula dentro de un mismo sistema',
    wallet: 'Cartera', walBalance: 'Saldo', walExpense: 'Gasto', walIncome: 'Ingreso',
    walAmount: 'Importe', walNote: 'Nota', walAdd: 'Añadir', mAdd: 'Añadir', mCode: 'Código', mCodePh: 'tu código…', mLang: 'Idioma', mSetup: 'Preparando {name} — la primera ejecución lo descarga una vez', mBusy: 'Ejecutando…', mMs: 'hecho en {ms} ms', mNetErr: 'No se pudo cargar {name} — revisa tu conexión', mStopped: 'Detenido — tardó demasiado', zoomIn: 'Acercar', zoomOut: 'Alejar', walDays: 'Días', walReports: 'Informes', walCash: 'Efectivo', lpModule:'Módulo',lpModuleSub:'Automatización visual estilo n8n',flFiles:'Archivos',flNew:'Nuevo',flOpen:'Abrir',flRename:'Cambiar nombre',flDuplicate:'Duplicar',flDelete:'Eliminar',flExport:'Exportar',flImport:'Importar',flUpdated:'Editado',flEmpty:'Aún no hay documentos',flSearch:'Buscar',flConfirm:'¿Eliminar para siempre?',flUntitledNote:'Nota sin título',flUntitledFlow:'Flujo sin título',mRun:'Ejecutar',mGrid:'Cuadrícula',mText:'Texto',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'el texto que leerá tu código…', mFeedHint:'el programa pide una entrada — escríbela en el nodo I/O y vuelve a ejecutar',mResult:'Resultado',encPlain:'Sin formato',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'Entidades HTML',encRot:'ROT13',
    walSpent: 'Gastado', walMonth: 'Este mes', walAvg: 'Media diaria', walWeek: 'Últimos 7 días',
    walTop: 'Mayor gasto', pDay: 'Día', pWeek: 'Semana', pMonth: 'Mes', pSem: 'Semestre', pYear: 'Año', pDec: 'Década', walNet: 'Neto', walEmpty: 'Sin movimientos aún', walCurrency: 'Símbolo de moneda', walDelete: 'Eliminar entrada', walCurSearch: 'Buscar divisas…', launchpad: 'Launchpad', lpClock: 'Reloj', lpClockSub: 'Reloj mundial con deriva corregida', lpWalletSub: 'Saldo, gasto diario e informes',
    date: 'Fecha', time: 'Hora', window: 'Ventana', light: 'Claro', night: 'Turno de noche',
    resync: 'Resincronizar', search: 'Buscar ciudad o país…', signin: 'Iniciar sesión', signout: 'Cerrar sesión', account: 'Cuenta', settings: 'Ajustes', appearance: 'Apariencia', homeCity: 'Ciudad del reloj', currency: 'Moneda', data: 'Datos', resetData: 'Restablecer datos locales', resetQ: '¿Borrar idioma, tema, ciudad, moneda y capturas de cuenta en este dispositivo? Las transacciones se conservan.', portalNote: 'Inicia sesión y tu idioma, tema, ciudad, moneda y cartera seguirán tu cuenta de Google en cualquier dispositivo.', lpSettingsSub: 'Idioma, tema, ciudad y moneda', scribeIn: 'Idioma hablado', scribeOut: 'Idioma del texto', scribeStart: 'Iniciar', scribeStop: 'Detener', scribeListening: 'Escuchando', scribeClear: 'Limpiar', scribeCopy: 'Copiar', scribeDownload: 'Descargar', scribeSaved: 'Todos los cambios guardados', scribeSaving: 'Guardando…', scribeWords: 'palabras', scribeHint: 'Pulsa Iniciar y habla: la transcripción aparece aquí y sigue editable.', scribeNo: 'Este navegador no admite reconocimiento de voz.', scribeUndo: 'Deshacer', scribeRedo: 'Rehacer', scribeFind: 'Buscar', scribeReplace: 'Reemplazar', scribeReplaceAll: 'Reemplazar todo', scribePrint: 'Imprimir', scribeImport: 'Importar archivo de texto', scribeStamps: 'Marcas de tiempo', scribeChars: 'caracteres', scribeNoHits: 'Sin coincidencias', lpScribeSub: 'Transcripción de clases en vivo', lpScribe: 'Scribe', language: 'Idioma', local: 'Local',
    addZone: 'Añadir zona', single: 'Único', side: 'Lado a lado', quad: '2 × 2', grid16: '4 × 4', clearAll: 'Borrar todo', aiTip: 'IA en tu dispositivo (WebGPU) para órdenes libres y preguntas ligeras', aiLoad: 'La IA está despertando: el modelo local se descarga una vez. Pregunta de nuevo en un momento.', aiNoGpu: 'Este navegador no tiene WebGPU, así que la IA local no puede ejecutarse; los comandos escritos siguen funcionando.', timeIn: 'Son las {t} en {c}.', remindSet: 'Aviso en {n} min', remindNow: 'Se acabó el tiempo', clearChat: 'borrar chat', voiceTip: 'Leer respuestas en voz alta',
    winTitle: 'Formato de ventana', winAdd: 'Añadir a esta ventana',
    analog: 'Analógico', digital: 'Digital',
    timer: 'Temporizador', start: 'Iniciar', pause: 'Pausa', resume: 'Seguir', done: 'Listo', running: 'en marcha', paused: 'en pausa', minutes: 'Minutos', clear: 'Quitar',
    stopwatch: 'Cronómetro', reset: 'Reiniciar', ipTitle: 'Localizador IP', ipAddr: 'Dirección IP', mac: 'MAC', location: 'Ubicación', coords: 'Coordenadas', useTz: 'Usar esta zona', macNA: 'oculta por el navegador', locating: 'localizando…',
    map: 'Mapa',
    synced: 'Sincronizado · {src}', corrected: 'Corregido · {src}',
    drift: 'deriva del dispositivo {mag} — corregida{res}',
    offLabel: 'Reloj del sistema — referencia no disponible', offDetail: 'sin corrección de deriva',
    lastCheck: 'última comprobación {t}', syncing: 'sincronizando…', secondRes: ' · resolución de segundos', checking: 'comprobando…',
    nightTitle: 'Alternar turno de noche (N)', tzTitle: 'Zona horaria', modeTitle: 'Analógico / digital (A)', resyncTitle: 'Volver a comprobar la hora de referencia (R)', fullTitle: 'Pantalla completa (F)', full: 'Pantalla completa', tzSearchPh: 'Buscar zonas horarias…', tzListAria: 'Zonas horarias', prevMatch: 'Coincidencia anterior', nextMatch: 'Siguiente coincidencia', closeFind: 'Cerrar barra de búsqueda', scrDocAria: 'Documento de transcripción', docTitle: 'Título del documento', untitled: 'Documento sin título', smatePh: 'Escribe una orden…', smateTip: 'Asistente SMate', smateSend: 'Enviar', smateOnline: 'en línea', smateTyping: 'escribiendo…', smateUnavailable: 'no disponible', smateVoice: 'Entrada de voz', smateHi: 'Hola, soy SMate. Prueba "temporizador 5", "zona Taipéi", "abrir cartera", "turno de noche" o "help".', smateUnknown: 'No te entendí. Escribe "help" para ver qué puedo hacer.',
    mHint: 'Toca una estación y luego otra: la tarifa aparece aquí.', mFrom: 'Desde', mTo: 'Hasta', mFare: 'Tarifa', mStations: 'estaciones', mTransfers: 'transbordos', mMin: 'min', mSwap: 'Invertir', mClear: 'Borrar', mTRTC: 'Metro de Taipéi', mTY: 'MRT del aeropuerto', mKS: 'Metro de Kaohsiung', mTC: 'Metro de Taichung',lpMetro: 'Metro',  lpMetroSub: 'Calculadora de tarifas', lpWelcomeT: 'Bienvenido a SinghoLaunch', lpWelcomeS: 'Un lanzador para tu reloj mundial, tarifas de metro, billetera, notas y ajustes: privado, sin conexión y tuyo.', lpStart: 'Comenzar', lpWorld: 'Por el mundo', lpToday: 'Hoy',
    mCard: 'Tarjeta', mCardTap: 'Acerca la tarjeta al dorso del teléfono…', mCardNone: 'Aquí no hay lector: escanear requiere un teléfono con NFC.', mCardSeen: 'Tarjeta reconocida', mCardBal: 'Saldo (NT$)', mCardNote: 'El saldo vive solo en este dispositivo; ningún sitio puede leerlo de la tarjeta.',
  },
  fr: {
    fareXsys: 'systèmes différents — le tarif se calcule dans un même système',
    wallet: 'Portefeuille', walBalance: 'Solde', walExpense: 'Dépense', walIncome: 'Revenu',
    walAmount: 'Montant', walNote: 'Note', walAdd: 'Ajouter', mAdd: 'Ajouter', mCode: 'Code', mCodePh: 'votre code…', mLang: 'Langage', mSetup: 'Préparation de {name} — le premier lancement le télécharge une fois', mBusy: 'Exécution…', mMs: 'terminé en {ms} ms', mNetErr: 'Impossible de charger {name} — vérifiez votre connexion', mStopped: 'Arrêté — trop long', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', walDays: 'Jours', walReports: 'Rapports', walCash: 'Espèces', lpModule:'Module',lpModuleSub:'Automatisation visuelle style n8n',flFiles:'Fichiers',flNew:'Nouveau',flOpen:'Ouvrir',flRename:'Renommer',flDuplicate:'Dupliquer',flDelete:'Supprimer',flExport:'Exporter',flImport:'Importer',flUpdated:'Modifié',flEmpty:'Aucun document pour le moment',flSearch:'Rechercher',flConfirm:'Supprimer définitivement ?',flUntitledNote:'Note sans titre',flUntitledFlow:'Flux sans titre',mRun:'Exécuter',mGrid:'Grille',mText:'Texte',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'le texte que lira votre code…', mFeedHint:'le programme attend une entrée — tapez-la dans le nœud I/O puis relancez',mResult:'Résultat',encPlain:'Brut',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'Entités HTML',encRot:'ROT13',
    walSpent: 'Dépensé', walMonth: 'Ce mois-ci', walAvg: 'Moyenne quotidienne', walWeek: '7 derniers jours',
    walTop: 'Plus grosse dépense', pDay: 'Jour', pWeek: 'Semaine', pMonth: 'Mois', pSem: 'Semestre', pYear: 'Année', pDec: 'Décennie', walNet: 'Net', walEmpty: 'Aucune transaction', walCurrency: 'Symbole de devise', walDelete: 'Supprimer l’entrée', walCurSearch: 'Rechercher une devise…', launchpad: 'Launchpad', lpClock: 'Horloge', lpClockSub: 'Horloge mondiale corrigée de la dérive', lpWalletSub: 'Solde, dépenses du jour et rapports',
    date: 'Date', time: 'Heure', window: 'Fenêtre', light: 'Clair', night: 'Mode nuit',
    resync: 'Resynchroniser', search: 'Rechercher une ville ou un pays…', signin: 'Connexion', signout: 'Déconnexion', account: 'Compte', settings: 'Paramètres', appearance: 'Apparence', homeCity: 'Ville de l’horloge', currency: 'Devise', data: 'Données', resetData: 'Réinitialiser les données locales', resetQ: 'Effacer langue, thème, ville, devise et instantanés de compte sur cet appareil ? Les transactions sont conservées.', portalNote: 'Connectez-vous et votre langue, thème, ville, devise et portefeuille suivront votre compte Google sur tous vos appareils.', lpSettingsSub: 'Langue, thème, ville et devise', scribeIn: 'Langue parlée', scribeOut: 'Langue du texte', scribeStart: 'Démarrer', scribeStop: 'Arrêter', scribeListening: 'Écoute', scribeClear: 'Effacer', scribeCopy: 'Copier', scribeDownload: 'Télécharger', scribeSaved: 'Toutes les modifications sont enregistrées', scribeSaving: 'Enregistrement…', scribeWords: 'mots', scribeHint: 'Appuyez sur Démarrer et parlez : la transcription s’affiche ici et reste modifiable.', scribeNo: 'Ce navigateur ne prend pas en charge la reconnaissance vocale.', scribeUndo: 'Annuler', scribeRedo: 'Rétablir', scribeFind: 'Rechercher', scribeReplace: 'Remplacer', scribeReplaceAll: 'Tout remplacer', scribePrint: 'Imprimer', scribeImport: 'Importer un fichier texte', scribeStamps: 'Horodatage', scribeChars: 'caractères', scribeNoHits: 'Aucun résultat', lpScribeSub: 'Transcription de cours en direct', lpScribe: 'Scribe', language: 'Langue', local: 'Local',
    addZone: 'Ajouter un fuseau', single: 'Seul', side: 'Côte à côte', quad: '2 × 2', grid16: '4 × 4', clearAll: 'Tout effacer', aiTip: 'IA locale (WebGPU) pour des ordres libres et des questions légères', aiLoad: 'L’IA se réveille — le modèle local se télécharge une fois. Repose dans un instant.', aiNoGpu: 'Ce navigateur n’a pas WebGPU, l’IA locale ne peut pas tourner — les commandes tapées fonctionnent.', timeIn: 'Il est {t} à {c}.', remindSet: 'Rappel dans {n} min', remindNow: 'C’est l’heure', clearChat: 'effacer la conversation', voiceTip: 'Lire les réponses à voix haute',
    winTitle: 'Format de fenêtre', winAdd: 'Ajouter à cette fenêtre',
    analog: 'Analogique', digital: 'Numérique',
    timer: 'Minuteur', start: 'Démarrer', pause: 'Pause', resume: 'Reprendre', done: 'Terminé', running: 'en cours', paused: 'en pause', minutes: 'Minutes', clear: 'Retirer',
    stopwatch: 'Chrono', reset: 'Réinitialiser', ipTitle: 'Localisation IP', ipAddr: 'Adresse IP', mac: 'MAC', location: 'Position', coords: 'Coordonnées', useTz: 'Utiliser ce fuseau', macNA: 'masquée par le navigateur', locating: 'localisation…',
    map: 'Carte',
    synced: 'Synchronisé · {src}', corrected: 'Corrigé · {src}',
    drift: 'dérive de l’appareil {mag} — corrigée{res}',
    offLabel: 'Horloge système — référence indisponible', offDetail: 'aucune correction de dérive',
    lastCheck: 'dernier contrôle {t}', syncing: 'synchronisation…', secondRes: ' · résolution à la seconde', checking: 'contrôle…',
    nightTitle: 'Basculer le mode nuit (N)', tzTitle: 'Fuseau horaire', modeTitle: 'Analogique / numérique (A)', resyncTitle: 'Revérifier l’heure de référence (R)', fullTitle: 'Plein écran (F)', full: 'Plein écran', tzSearchPh: 'Rechercher un fuseau…', tzListAria: 'Fuseaux horaires', prevMatch: 'Occurrence précédente', nextMatch: 'Occurrence suivante', closeFind: 'Fermer la barre de recherche', scrDocAria: 'Document de transcription', docTitle: 'Titre du document', untitled: 'Document sans titre', smatePh: 'Écrivez une commande…', smateTip: 'Assistant SMate', smateSend: 'Envoyer', smateOnline: 'en ligne', smateTyping: 'écrit…', smateUnavailable: 'indisponible', smateVoice: 'Saisie vocale', smateHi: 'Bonjour, je suis SMate. Essayez « minuteur 5 », « fuseau Taipei », « ouvrir portefeuille », « mode nuit » ou « help ».', smateUnknown: 'Désolé, je n’ai pas compris. Tapez « help ».',
    mHint: 'Touche une station puis une autre — le tarif s’affiche ici.', mFrom: 'De', mTo: 'À', mFare: 'Tarif', mStations: 'stations', mTransfers: 'correspondances', mMin: 'min', mSwap: 'Inverser', mClear: 'Effacer', mTRTC: 'Métro de Taipei', mTY: 'MRT de l’aéroport', mKS: 'Métro de Kaohsiung', mTC: 'Métro de Taichung',lpMetro: 'Métro',  lpMetroSub: 'Calculateur de tarif', lpWelcomeT: 'Bienvenue sur SinghoLaunch', lpWelcomeS: 'Un lanceur pour votre horloge mondiale, vos tarifs de métro, votre portefeuille, vos notes et vos réglages — privé, hors ligne et à vous.', lpStart: 'Commencer', lpWorld: 'Autour du monde', lpToday: 'Aujourd’hui',
    mCard: 'Carte', mCardTap: 'Colle la carte au dos du téléphone…', mCardNone: 'Pas de lecteur ici — il faut un téléphone avec NFC.', mCardSeen: 'Carte reconnue', mCardBal: 'Solde (NT$)', mCardNote: 'Le solde reste sur cet appareil; aucun site ne peut le lire depuis la carte.',
  },
  ar: {
    fareXsys: 'نظامان مختلفان — تُحسب الأجرة داخل نظام واحد',
    wallet: 'المحفظة', walBalance: 'الرصيد', walExpense: 'مصروف', walIncome: 'دخل',
    walAmount: 'المبلغ', walNote: 'ملاحظة', walAdd: 'أضف', mAdd: 'أضف', mCode: 'شيفرة', mCodePh: 'الكود الخاص بك…', mLang: 'اللغة', mSetup: 'جارٍ تجهيز {name} — يُنزَّل مرة واحدة عند أول تشغيل', mBusy: 'قيد التشغيل…', mMs: 'اكتمل في {ms} م‌ث', mNetErr: 'تعذّر تحميل {name} — تحقّق من اتصالك', mStopped: 'توقّف — استغرق وقتًا طويلاً', zoomIn: 'تكبير', zoomOut: 'تصغير', walDays: 'الأيام', walReports: 'التقارير', walCash: 'نقد', lpModule:'الوحدة',lpModuleSub:'أتمتة مرئية بأسلوب n8n',flFiles:'الملفات',flNew:'جديد',flOpen:'فتح',flRename:'إعادة تسمية',flDuplicate:'تكرار',flDelete:'حذف',flExport:'تصدير',flImport:'استيراد',flUpdated:'تم التحرير',flEmpty:'لا مستندات بعد',flSearch:'بحث',flConfirm:'حذف نهائيًا؟',flUntitledNote:'ملاحظة بدون عنوان',flUntitledFlow:'تدفق بدون عنوان',mRun:'تشغيل',mGrid:'الشبكة',mText:'نص',mMarkdown:'ماركداون',mIO:'I/O', mIOPh:'النص الذي سيقرؤه الكود…', mFeedHint:'البرنامج يطلب إدخالًا — اكتبه في عقدة I/O ثم شغّل مرة أخرى',mResult:'النتيجة',encPlain:'عادي',encB64:'Base64',encUrl:'URL',encHex:'سداسي',encUni:'يونيكود',encEnt:'كيانات HTML',encRot:'ROT13',
    walSpent: 'أُنفق', walMonth: 'هذا الشهر', walAvg: 'المتوسط اليومي', walWeek: 'آخر 7 أيام',
    walTop: 'أكبر مصروف', pDay: 'يوم', pWeek: 'أسبوع', pMonth: 'شهر', pSem: 'فصل دراسي', pYear: 'سنة', pDec: 'عقد', walNet: 'الصافي', walEmpty: 'لا معاملات بعد', walCurrency: 'رمز العملة', walDelete: 'حذف الإدخال', walCurSearch: 'ابحث عن العملات…', launchpad: 'منصة الإطلاق', lpClock: 'الساعة', lpClockSub: 'ساعة عالمية مصحَّحة الانحراف', lpWalletSub: 'الرصيد والمصروفات اليومية والتقارير',
    date: 'التاريخ', time: 'الوقت', window: 'نافذة', light: 'فاتح', night: 'الوضع الليلي',
    resync: 'إعادة المزامنة', search: 'ابحث عن مدينة أو دولة…', signin: 'تسجيل الدخول', signout: 'تسجيل الخروج', account: 'الحساب', settings: 'الإعدادات', appearance: 'المظهر', homeCity: 'مدينة الساعة', currency: 'العملة', data: 'البيانات', resetData: 'إعادة تعيين البيانات المحلية', resetQ: 'مسح اللغة والسمة والمدينة والعملة ولقطات الحساب على هذا الجهاز؟ سيتم الاحتفاظ بالمعاملات.', portalNote: 'سجّل الدخول وستتبع لغتك وسمتك ومدينتك وعملتك ومحفظتك حساب Google على أي جهاز.', lpSettingsSub: 'اللغة والسمة والمدينة والعملة', scribeIn: 'لغة الكلام', scribeOut: 'لغة النص', scribeStart: 'بدء', scribeStop: 'إيقاف', scribeListening: 'يستمع', scribeClear: 'مسح', scribeCopy: 'نسخ', scribeDownload: 'تنزيل', scribeSaved: 'تم حفظ جميع التغييرات', scribeSaving: 'جارٍ الحفظ…', scribeWords: 'كلمة', scribeHint: 'اضغط «بدء» وتحدّث — يظهر النص هنا ويبقى قابلًا للتحرير.', scribeNo: 'هذا المتصفح لا يدعم التعرف على الكلام.', scribeUndo: 'تراجع', scribeRedo: 'إعادة', scribeFind: 'بحث', scribeReplace: 'استبدال', scribeReplaceAll: 'استبدال الكل', scribePrint: 'طباعة', scribeImport: 'استيراد ملف نصي', scribeStamps: 'طوابع زمنية', scribeChars: 'أحرف', scribeNoHits: 'لا نتائج', lpScribeSub: 'نسخ المحاضرات مباشرة', lpScribe: 'الكاتب', language: 'اللغة', local: 'محلي',
    addZone: 'أضف منطقة', single: 'واحدة', side: 'جنباً إلى جنب', quad: '2 × 2', grid16: '4 × 4', clearAll: 'مسح الكل', aiTip: 'ذكاء اصطناعي على جهازك (WebGPU) للأوامر الحرة والأسئلة الخفيفة', aiLoad: 'الذكاء الاصطناعي يستيقظ — يُنزَّل النموذج المحلي مرة واحدة. أعد السؤال بعد لحظات.', aiNoGpu: 'هذا المتصفح بلا WebGPU لذا لا يعمل الذكاء المحلي — الأوامر المكتوبة تعمل.', timeIn: 'الساعة {t} في {c}.', remindSet: 'تذكير بعد {n} د', remindNow: 'انتهى الوقت', clearChat: 'مسح المحادثة', voiceTip: 'انطق الردود',
    winTitle: 'تنسيق النافذة', winAdd: 'أضف إلى هذه النافذة',
    analog: 'تناظري', digital: 'رقمي',
    timer: 'مؤقت', start: 'ابدأ', pause: 'إيقاف مؤقت', resume: 'استئناف', done: 'انتهى', running: 'جارٍ', paused: 'متوقف مؤقتاً', minutes: 'دقائق', clear: 'إزالة',
    stopwatch: 'ساعة إيقاف', reset: 'تصفير', ipTitle: 'محدد IP', ipAddr: 'عنوان IP', mac: 'MAC', location: 'الموقع', coords: 'الإحداثيات', useTz: 'استخدم هذه المنطقة', macNA: 'يخفيها المتصفح', locating: 'جارٍ التحديد…',
    map: 'خريطة',
    synced: 'متزامن · {src}', corrected: 'مصَحَّح · {src}',
    drift: 'انحراف الجهاز {mag} — مصحَّح{res}',
    offLabel: 'ساعة النظام — لا مرجع متاح', offDetail: 'دون تصحيح للانحراف',
    lastCheck: 'آخر فحص {t}', syncing: 'جارٍ المزامنة…', secondRes: ' · دقة بالثواني', checking: 'جارٍ الفحص…',
    nightTitle: 'تبديل الوضع الليلي (N)', tzTitle: 'المنطقة الزمنية', modeTitle: 'تناظري / رقمي (A)', resyncTitle: 'إعادة فحص الوقت المرجعي (R)', fullTitle: 'ملء الشاشة (F)', full: 'ملء الشاشة', tzSearchPh: 'ابحث عن المناطق الزمنية…', tzListAria: 'المناطق الزمنية', prevMatch: 'التطابق السابق', nextMatch: 'التطابق التالي', closeFind: 'إغلاق شريط البحث', scrDocAria: 'مستند النص', docTitle: 'عنوان المستند', untitled: 'مستند بدون عنوان', smatePh: 'اكتب أمراً…', smateTip: 'مساعد SMate', smateSend: 'إرسال', smateOnline: 'متصل', smateTyping: 'يكتب…', smateUnavailable: 'غير متاح', smateVoice: 'إدخال صوتي', smateHi: 'مرحباً، أنا SMate. جرّب "مؤقت 5" أو "المنطقة تايبيه" أو "افتح المحفظة" أو "الوضع الليلي" أو "help".', smateUnknown: 'عذراً، لم أفهم. اكتب "help".',
    mHint: 'انقر محطة ثم أخرى — يظهر السعر هنا.', mFrom: 'من', mTo: 'إلى', mFare: 'الأجرة', mStations: 'محطات', mTransfers: 'تبدلات', mMin: 'د', mSwap: 'تبديل', mClear: 'مسح', mTRTC: 'مترو تايبيه', mTY: 'قطار المطار MRT', mKS: 'مترو كاوهسيونغ', mTC: 'مترو تايتشونغ',lpMetro: 'المترو',  lpMetroSub: 'حاسبة الأجرة بنقرتين', lpWelcomeT: 'مرحبًا بك في SinghoLaunch', lpWelcomeS: 'منصة واحدة لساعتك العالمية وأجور المترو والمحفظَة والملاحظات والإعدادات — خاصة وبدون اتصال ولك وحدك.', lpStart: 'ابدأ', lpWorld: 'حول العالم', lpToday: 'اليوم',
    mCard: 'بطاقة', mCardTap: 'قرّب البطاقة من ظهر الهاتف…', mCardNone: 'لا قارئ هنا — المسح يتطلب هاتفاً فيه NFC.', mCardSeen: 'تم التعرف على البطاقة', mCardBal: 'الرصيد (NT$)', mCardNote: 'الرصيد يُحفظ على هذا الجهاز فقط؛ لا يستطيع أي موقع قراءته من البطاقة.',
  },
  bn: {
    fareXsys: 'ভিন্ন সিস্টেম — ভাড়া একই সিস্টেমের মধ্যে হিসাব হয়',
    wallet: 'ওয়ালেট', walBalance: 'ব্যালেন্স', walExpense: 'খরচ', walIncome: 'আয়',
    walAmount: 'পরিমাণ', walNote: 'নোট', walAdd: 'যোগ', mAdd: 'যোগ', mCode: 'কোড', mCodePh: 'আপনার কোড…', mLang: 'ভাষা', mSetup: '{name} প্রস্তুত হচ্ছে — প্রথমবার একবার ডাউনলোড হবে', mBusy: 'চলছে…', mMs: '{ms} মিলিসেকেন্ডে সম্পন্ন', mNetErr: '{name} লোড করা যায়নি — ইন্টারনেট দেখুন', mStopped: 'থেমে গেছে — অনেক সময় লেগেছে', zoomIn: 'জুম ইন', zoomOut: 'জুম আউট', walDays: 'দিন', walReports: 'রিপোর্ট', walCash: 'নগদ', lpModule:'মডিউল',lpModuleSub:'n8n-স্টাইল ভিজ্যুয়াল অটোমেশন',flFiles:'ফাইল',flNew:'নতুন',flOpen:'খুলুন',flRename:'নাম বদলান',flDuplicate:'ডুপ্লিকেট',flDelete:'মুছুন',flExport:'এক্সপোর্ট',flImport:'ইমপোর্ট',flUpdated:'সম্পাদিত',flEmpty:'এখনও কোনো ডকুমেন্ট নেই',flSearch:'খুঁজুন',flConfirm:'চিরতরে মুছবেন?',flUntitledNote:'শিরোনামহীন নোট',flUntitledFlow:'শিরোনামহীন ফ্লো',mRun:'চালান',mGrid:'গ্রিড',mText:'টেক্সট',mMarkdown:'মার্কডাউন',mIO:'I/O', mIOPh:'আপনার কোড যে লেখাটি পড়বে…', mFeedHint:'প্রোগ্রাম ইনপুট চাইছে — I/O নোডে লিখে আবার চালান',mResult:'ফলাফল',encPlain:'সাধারণ',encB64:'Base64',encUrl:'URL',encHex:'হেক্স',encUni:'ইউনিকোড',encEnt:'HTML এনটিটি',encRot:'ROT13',
    walSpent: 'খরচ হয়েছে', walMonth: 'এই মাস', walAvg: 'দৈনিক গড়', walWeek: 'শেষ ৭ দিন',
    walTop: 'সবচেয়ে বড় খরচ', pDay: 'দিন', pWeek: 'সপ্তাহ', pMonth: 'মাস', pSem: 'সেমিস্টার', pYear: 'বছর', pDec: 'দশক', walNet: 'নিট', walEmpty: 'এখনও কোনো লেনদেন নেই', walCurrency: 'মুদ্রা চিহ্ন', walDelete: 'মুছুন', walCurSearch: 'মুদ্রা খুঁজুন…', launchpad: 'লঞ্চপ্যাড', lpClock: 'ঘড়ি', lpClockSub: 'ড্রিফট-সংশোধিত বিশ্বঘড়ি', lpWalletSub: 'ব্যালেন্স, দৈনিক খরচ ও রিপোর্ট',
    date: 'তারিখ', time: 'সময়', window: 'উইন্ডো', light: 'লাইট', night: 'নাইট শিফ্ট',
    resync: 'রি-সিঙ্ক', search: 'শহর বা দেশ খুঁজুন…', signin: 'সাইন ইন', signout: 'সাইন আউট', account: 'অ্যাকাউন্ট', settings: 'সেটিংস', appearance: 'চেহারা', homeCity: 'ঘড়ির শহর', currency: 'মুদ্রা', data: 'ডেটা', resetData: 'স্থানীয় ডেটা রিসেট', resetQ: 'এই ডিভাইসে ভাষা, থিম, শহর, মুদ্রা ও অ্যাকাউন্ট স্ন্যাপশট মুছবেন? ওয়ালেটের লেনদেন থাকবে।', portalNote: 'সাইন ইন করলে আপনার ভাষা, থিম, শহর, মুদ্রা ও ওয়ালেট যেকোনো ডিভাইসে আপনার Google অ্যাকাউন্ট অনুসরণ করবে।', lpSettingsSub: 'ভাষা, থিম, শহর ও মুদ্রা', scribeIn: 'কথ্য ভাষা', scribeOut: 'লিপির ভাষা', scribeStart: 'শুরু', scribeStop: 'থামুন', scribeListening: 'শুনছে', scribeClear: 'মুছুন', scribeCopy: 'কপি', scribeDownload: 'ডাউনলোড', scribeSaved: 'সব পরিবর্তন সংরক্ষিত', scribeSaving: 'সংরক্ষণ হচ্ছে…', scribeWords: 'শব্দ', scribeHint: 'শুরু চাপুন ও বলুন — লিপি এখানে আসবে ও সম্পাদনাযোগ্য থাকবে।', scribeNo: 'এই ব্রাউজারে স্পিচ রিকগনিশন নেই।', scribeUndo: 'আনডু', scribeRedo: 'রিডু', scribeFind: 'খুঁজুন', scribeReplace: 'প্রতিস্থাপন', scribeReplaceAll: 'সব প্রতিস্থাপন', scribePrint: 'প্রিন্ট', scribeImport: 'টেক্সট ফাইল আমদানি', scribeStamps: 'টাইমস্ট্যাম্প', scribeChars: 'অক্ষর', scribeNoHits: 'কোনো মিল নেই', lpScribeSub: 'লাইভ লেকচার ট্রান্সক্রিপশন', lpScribe: 'স্ক্রাইব', language: 'ভাষা', local: 'স্থানীয়',
    addZone: 'অঞ্চল যোগ করুন', single: 'একক', side: 'পাশাপাশি', quad: '2 × 2', grid16: '4 × 4', clearAll: 'সব মুছুন', aiTip: 'ঢিলা কমান্ড ও হালকা প্রশ্নের জন্য ডিভাইসে AI (WebGPU)', aiLoad: 'AI জাগছে — প্রথমবার মডেল ডাউনলোড হয়। একটু পরে আবার জিজ্ঞেস করুন।', aiNoGpu: 'এই ব্রাউজারে WebGPU নেই, অন-ডিভাইস AI চলবে না — টাইপ করা কমান্ড কাজ করবে।', timeIn: '{c}-এ এখন {t}টা।', remindSet: '{n} মিনিটে মনে করাব', remindNow: 'সময় শেষ', clearChat: 'চ্যাট মুছুন', voiceTip: 'উত্তর পড়ে শোনান',
    winTitle: 'উইন্ডো বিন্যাস', winAdd: 'এই উইন্ডোতে যোগ করুন',
    analog: 'অ্যানালগ', digital: 'ডিজিটল',
    timer: 'টাইমার', start: 'শুরু', pause: 'বিরতি', resume: 'চালু', done: 'হয়ে গেছে', running: 'চলছে', paused: 'বিরাম', minutes: 'মিনিট', clear: 'সরান',
    stopwatch: 'স্টপওয়াচ', reset: 'রিসেট', ipTitle: 'IP লোকেটর', ipAddr: 'IP ঠিকানা', mac: 'MAC', location: 'অবস্থান', coords: 'স্থানাঙ্ক', useTz: 'এই টাইমজোন ব্যবহার করুন', macNA: 'ব্রাউজার লুকিয়ে রাখে', locating: 'খোঁজা হচ্ছে…',
    map: 'মানচিত্র',
    synced: 'সিঙ্ক হয়েছে · {src}', corrected: 'সংশোধিত · {src}',
    drift: 'ডিভাইস ড্রিফ্ট {mag} — সংশোধিত{res}',
    offLabel: 'সিস্টেম ঘড়ি — রেফারেন্স নেই', offDetail: 'ড্রিফ্ট সংশোধন প্রযোজ্য নয়',
    lastCheck: 'সর্বশেষ যাচাই {t}', syncing: 'সিঙ্ক হচ্ছে…', secondRes: ' · সেকেন্ড রেজোলিউশন', checking: 'যাচাই হচ্ছে…',
    nightTitle: 'নাইট শিফ্ট টগল করুন (N)', tzTitle: 'টাইমজোন', modeTitle: 'অ্যানালগ / ডিজিটাল (A)', resyncTitle: 'রেফারেন্স সময় আবার যাচাই করুন (R)', fullTitle: 'ফুল স্ক্রিন (F)', full: 'ফুল স্ক্রিন', tzSearchPh: 'টাইমজোন খুঁজুন…', tzListAria: 'টাইমজোন', prevMatch: 'আগের মিল', nextMatch: 'পরের মিল', closeFind: 'ফাইন্ড বার বন্ধ করুন', scrDocAria: 'লিপি নথি', docTitle: 'নথির শিরোনাম', untitled: 'শিরোনামহীন নথি', smatePh: 'কমান্ড লিখুন…', smateTip: 'SMate সহায়ক', smateSend: 'পাঠান', smateOnline: 'অনলাইন', smateTyping: 'লিখছে…', smateUnavailable: 'অনুপলব্ধ', smateVoice: 'ভয়েস ইনপুট', smateHi: 'হ্যালো, আমি SMate। "টাইমার 5", "টাইমজোন তাইপেই", "ওয়ালেট খুলুন", "নাইট শিফট" বা "help" লিখে দেখুন।', smateUnknown: 'দুঃখিত, বুঝিনি। "help" লিখুন।',
    mHint: 'একটি স্টেশন ছুঁয়ে আরেকটি ছুঁলে — ভাড়া এখানে দেখা যাবে।', mFrom: 'থেকে', mTo: 'পর্যন্ত', mFare: 'ভাড়া', mStations: 'স্টেশন', mTransfers: 'ট্রান্সফার', mMin: 'মিনিট', mSwap: 'অদলবদল', mClear: 'মুছুন', mTRTC: 'তাইপে মেট্রো', mTY: 'এয়ারপোর্ট MRT', mKS: 'কাওশিউং মেট্রো', mTC: 'তাইচুং মেট্রো',lpMetro: 'মেট্রো',  lpMetroSub: 'দুই স্টেশনে ভাড়া', lpWelcomeT: 'SinghoLaunch-এ স্বাগতম', lpWelcomeS: 'একটি লঞ্চপ্যাড — বিশ্ব ঘড়ি, মেট্রো ভাড়া, ওয়ালেট, নোট ও সেটিংস — ব্যক্তিগত, অফলাইন এবং আপনার।', lpStart: 'শুরু করুন', lpWorld: 'বিশ্বজুড়ে', lpToday: 'আজ',
    mCard: 'কার্ড', mCardTap: 'কার্ডটি ফোনের পেছনে ধরুন…', mCardNone: 'এখানে কার্ড রিডার নেই — স্ক্যানের জন্য NFC ফোন লাগবে।', mCardSeen: 'কার্ড শনাক্ত হয়েছে', mCardBal: 'ব্যালেন্স (NT$)', mCardNote: 'ব্যালেন্স শুধু এই ডিভাইসে থাকে; কোনো ওয়েবসাইট কার্ড থেকে এটি পড়তে পারে না।',
  },
  ru: {
    fareXsys: 'разные системы — тариф считается внутри одной системы',
    wallet: 'Кошелёк', walBalance: 'Баланс', walExpense: 'Расход', walIncome: 'Доход',
    walAmount: 'Сумма', walNote: 'Заметка', walAdd: 'Добавить', mAdd: 'Добавить', mCode: 'Код', mCodePh: 'ваш код…', mLang: 'Язык', mSetup: 'Подготовка {name} — при первом запуске скачается один раз', mBusy: 'Выполняется…', mMs: 'готово за {ms} мс', mNetErr: 'Не удалось загрузить {name} — проверьте интернет', mStopped: 'Остановлено — слишком долго', zoomIn: 'Приблизить', zoomOut: 'Отдалить', walDays: 'Дни', walReports: 'Отчёты', walCash: 'Наличные', lpModule:'Модуль',lpModuleSub:'Визуальная автоматизация в стиле n8n',flFiles:'Файлы',flNew:'Создать',flOpen:'Открыть',flRename:'Переименовать',flDuplicate:'Дублировать',flDelete:'Удалить',flExport:'Экспорт',flImport:'Импорт',flUpdated:'Изменён',flEmpty:'Документов пока нет',flSearch:'Поиск',flConfirm:'Удалить навсегда?',flUntitledNote:'Безымянная заметка',flUntitledFlow:'Безымянный поток',mRun:'Запустить',mGrid:'Сетка',mText:'Текст',mMarkdown:'Маркдаун',mIO:'I/O', mIOPh:'текст, который прочитает код…', mFeedHint:'программа ждёт ввода — введите текст в узел I/O и запустите снова',mResult:'Результат',encPlain:'Как есть',encB64:'Base64',encUrl:'URL',encHex:'Хекс',encUni:'Юникод',encEnt:'HTML-сущности',encRot:'ROT13',
    walSpent: 'Потрачено', walMonth: 'В этом месяце', walAvg: 'Среднее в день', walWeek: 'Последние 7 дней',
    walTop: 'Крупнейшая трата', pDay: 'День', pWeek: 'Неделя', pMonth: 'Месяц', pSem: 'Семестр', pYear: 'Год', pDec: 'Десятилетие', walNet: 'Нетто', walEmpty: 'Пока нет операций', walCurrency: 'Символ валюты', walDelete: 'Удалить запись', walCurSearch: 'Поиск валюты…', launchpad: 'Лаунчпад', lpClock: 'Часы', lpClockSub: 'Всемирные часы с коррекцией дрейфа', lpWalletSub: 'Баланс, расходы по дням и отчёты',
    date: 'Дата', time: 'Время', window: 'Окно', light: 'Светлая', night: 'Ночной режим',
    resync: 'Синхронизировать', search: 'Поиск города или страны…', signin: 'Войти', signout: 'Выйти', account: 'Аккаунт', settings: 'Настройки', appearance: 'Оформление', homeCity: 'Город часов', currency: 'Валюта', data: 'Данные', resetData: 'Сбросить локальные данные', resetQ: 'Стереть язык, тему, город, валюту и снимки аккаунта на этом устройстве? Операции кошелька сохранятся.', portalNote: 'Войдите — и язык, тема, город, валюта и кошелёк будут следовать за вашим аккаунтом Google на любом устройстве.', lpSettingsSub: 'Язык, тема, город и валюта', scribeIn: 'Язык речи', scribeOut: 'Язык текста', scribeStart: 'Старт', scribeStop: 'Стоп', scribeListening: 'Слушаю', scribeClear: 'Очистить', scribeCopy: 'Копировать', scribeDownload: 'Скачать', scribeSaved: 'Все изменения сохранены', scribeSaving: 'Сохранение…', scribeWords: 'слов', scribeHint: 'Нажмите Старт и говорите — текст появится здесь и останется редактируемым.', scribeNo: 'Этот браузер не поддерживает распознавание речи.', scribeUndo: 'Отменить', scribeRedo: 'Вернуть', scribeFind: 'Найти', scribeReplace: 'Заменить', scribeReplaceAll: 'Заменить все', scribePrint: 'Печать', scribeImport: 'Импорт файла', scribeStamps: 'Метки времени', scribeChars: 'символов', scribeNoHits: 'Нет совпадений', lpScribeSub: 'Живая транскрипция лекций', lpScribe: 'Скрайб', language: 'Язык', local: 'Местное',
    addZone: 'Добавить пояс', single: 'Один', side: 'Рядом', quad: '2 × 2', grid16: '4 × 4', clearAll: 'Очистить всё', aiTip: 'ИИ на устройстве (WebGPU) для свободных команд и лёгких вопросов', aiLoad: 'ИИ просыпается — локальная модель скачивается один раз. Повторите через минуту.', aiNoGpu: 'В этом браузере нет WebGPU, локальный ИИ не запустится — команды всё равно работают.', timeIn: 'В {c} сейчас {t}.', remindSet: 'Напомню через {n} мин', remindNow: 'Время вышло', clearChat: 'очистить чат', voiceTip: 'Озвучивать ответы',
    winTitle: 'Формат окна', winAdd: 'Добавить в это окно',
    analog: 'Аналоговый', digital: 'Цифровой',
    timer: 'Таймер', start: 'Старт', pause: 'Пауза', resume: 'Продолжить', done: 'Готово', running: 'идёт', paused: 'пауза', minutes: 'Минуты', clear: 'Убрать',
    stopwatch: 'Секундомер', reset: 'Сброс', ipTitle: 'IP-локатор', ipAddr: 'IP-адрес', mac: 'MAC', location: 'Местоположение', coords: 'Координаты', useTz: 'Этот часовой пояс', macNA: 'скрыт браузером', locating: 'определение…',
    map: 'Карта',
    synced: 'Синхронизировано · {src}', corrected: 'Скорректировано · {src}',
    drift: 'дрейф устройства {mag} — скорректировано{res}',
    offLabel: 'Системные часы — эталон недоступен', offDetail: 'коррекция дрейфа не применяется',
    lastCheck: 'последняя проверка {t}', syncing: 'синхронизация…', secondRes: ' · точность до секунды', checking: 'проверка…',
    nightTitle: 'Переключить ночной режим (N)', tzTitle: 'Часовой пояс', modeTitle: 'Аналоговый / цифровой (A)', resyncTitle: 'Проверить эталонное время (R)', fullTitle: 'Полный экран (F)', full: 'Полный экран', tzSearchPh: 'Поиск часового пояса…', tzListAria: 'Часовые пояса', prevMatch: 'Предыдущее совпадение', nextMatch: 'Следующее совпадение', closeFind: 'Закрыть панель поиска', scrDocAria: 'Документ транскрипции', docTitle: 'Название документа', untitled: 'Документ без названия', smatePh: 'Введите команду…', smateTip: 'Ассистент SMate', smateSend: 'Отправить', smateOnline: 'в сети', smateTyping: 'печатает…', smateUnavailable: 'недоступно', smateVoice: 'Голосовой ввод', smateHi: 'Привет, я SMate. Попробуйте «таймер 5», «пояс Тайбэй», «открыть кошелёк», «ночной режим» или "help".', smateUnknown: 'Не понял. Наберите "help".',
    mHint: 'Коснитесь станции, затем другой — здесь появится цена.', mFrom: 'Откуда', mTo: 'Куда', mFare: 'Проезд', mStations: 'станций', mTransfers: 'пересадки', mMin: 'мин', mSwap: 'Поменять', mClear: 'Очистить', mTRTC: 'Тайбэйское метро', mTY: 'Аэроэкспресс MRT', mKS: 'Метро Каосюна', mTC: 'Метро Тайчжуна',lpMetro: 'Метро',  lpMetroSub: 'Калькулятор проезда', lpWelcomeT: 'Добро пожаловать в SinghoLaunch', lpWelcomeS: 'Одна панель для мировых часов, тарифов метро, кошелька, заметок и настроек — приватно, офлайн и только ваше.', lpStart: 'Начать', lpWorld: 'По миру', lpToday: 'Сегодня',
    mCard: 'Карта', mCardTap: 'Приложите карту к спинке телефона…', mCardNone: 'Здесь нет считывателя — для скана нужен телефон с NFC.', mCardSeen: 'Карта распознана', mCardBal: 'Баланс (NT$)', mCardNote: 'Баланс хранится только на этом устройстве; сайты не могут читать его с карты.',
  },
  pt: {
    fareXsys: 'sistemas diferentes — a tarifa é calculada dentro de um mesmo sistema',
    wallet: 'Carteira', walBalance: 'Saldo', walExpense: 'Despesa', walIncome: 'Receita',
    walAmount: 'Valor', walNote: 'Nota', walAdd: 'Adicionar', mAdd: 'Adicionar', mCode: 'Código', mCodePh: 'o seu código…', mLang: 'Linguagem', mSetup: 'A preparar {name} — a primeira execução descarrega-o uma vez', mBusy: 'A executar…', mMs: 'concluído em {ms} ms', mNetErr: 'Não foi possível carregar {name} — verifique a ligação', mStopped: 'Parado — demorou demasiado', zoomIn: 'Aproximar', zoomOut: 'Afastar', walDays: 'Dias', walReports: 'Relatórios', walCash: 'Dinheiro', lpModule:'Módulo',lpModuleSub:'Automação visual estilo n8n',flFiles:'Arquivos',flNew:'Novo',flOpen:'Abrir',flRename:'Renomear',flDuplicate:'Duplicar',flDelete:'Excluir',flExport:'Exportar',flImport:'Importar',flUpdated:'Editado',flEmpty:'Ainda sem documentos',flSearch:'Pesquisar',flConfirm:'Excluir para sempre?',flUntitledNote:'Nota sem título',flUntitledFlow:'Fluxo sem título',mRun:'Executar',mGrid:'Grade',mText:'Texto',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'o texto que o seu código vai ler…', mFeedHint:'o programa pede uma entrada — escreva-a no nó I/O e execute novamente',mResult:'Resultado',encPlain:'Simples',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'Entidades HTML',encRot:'ROT13',
    walSpent: 'Gasto', walMonth: 'Este mês', walAvg: 'Média diária', walWeek: 'Últimos 7 dias',
    walTop: 'Maior gasto', pDay: 'Dia', pWeek: 'Semana', pMonth: 'Mês', pSem: 'Semestre', pYear: 'Ano', pDec: 'Década', walNet: 'Líquido', walEmpty: 'Sem transações ainda', walCurrency: 'Símbolo de moeda', walDelete: 'Excluir entrada', walCurSearch: 'Buscar moedas…', launchpad: 'Launchpad', lpClock: 'Relógio', lpClockSub: 'Relógio mundial com deriva corrigida', lpWalletSub: 'Saldo, gastos diários e relatórios',
    date: 'Data', time: 'Hora', window: 'Janela', light: 'Claro', night: 'Modo noturno',
    resync: 'Ressincronizar', search: 'Buscar cidade ou país…', signin: 'Entrar', signout: 'Sair', account: 'Conta', settings: 'Configurações', appearance: 'Aparência', homeCity: 'Cidade do relógio', currency: 'Moeda', data: 'Dados', resetData: 'Redefinir dados locais', resetQ: 'Apagar idioma, tema, cidade, moeda e snapshots de conta neste dispositivo? As transações são mantidas.', portalNote: 'Entre e seu idioma, tema, cidade, moeda e carteira seguirão sua conta Google em qualquer dispositivo.', lpSettingsSub: 'Idioma, tema, cidade e moeda', scribeIn: 'Idioma falado', scribeOut: 'Idioma do texto', scribeStart: 'Iniciar', scribeStop: 'Parar', scribeListening: 'Ouvindo', scribeClear: 'Limpar', scribeCopy: 'Copiar', scribeDownload: 'Baixar', scribeSaved: 'Todas as alterações salvas', scribeSaving: 'Salvando…', scribeWords: 'palavras', scribeHint: 'Toque em Iniciar e fale: a transcrição aparece aqui e continua editável.', scribeNo: 'Este navegador não oferece reconhecimento de voz.', scribeUndo: 'Desfazer', scribeRedo: 'Refazer', scribeFind: 'Buscar', scribeReplace: 'Substituir', scribeReplaceAll: 'Substituir tudo', scribePrint: 'Imprimir', scribeImport: 'Importar arquivo', scribeStamps: 'Marcas de tempo', scribeChars: 'caracteres', scribeNoHits: 'Nenhuma ocorrência', lpScribeSub: 'Transcrição de aulas ao vivo', lpScribe: 'Scribe', language: 'Idioma', local: 'Local',
    addZone: 'Adicionar fuso', single: 'Único', side: 'Lado a lado', quad: '2 × 2', grid16: '4 × 4', clearAll: 'Limpar tudo', aiTip: 'IA no dispositivo (WebGPU) para comandos livres e perguntas leves', aiLoad: 'A IA está acordando — o modelo local baixa uma vez. Pergunte de novo em instantes.', aiNoGpu: 'Este navegador não tem WebGPU, a IA local não roda — os comandos digitados funcionam.', timeIn: 'São {t} em {c}.', remindSet: 'Lembrete em {n} min', remindNow: 'Hora certa', clearChat: 'limpar conversa', voiceTip: 'Falar as respostas',
    winTitle: 'Formato da janela', winAdd: 'Adicionar a esta janela',
    analog: 'Analógico', digital: 'Digital',
    timer: 'Timer', start: 'Iniciar', pause: 'Pausa', resume: 'Retomar', done: 'Pronto', running: 'correndo', paused: 'pausado', minutes: 'Minutos', clear: 'Remover',
    stopwatch: 'Cronômetro', reset: 'Reiniciar', ipTitle: 'Localizador IP', ipAddr: 'Endereço IP', mac: 'MAC', location: 'Localização', coords: 'Coordenadas', useTz: 'Usar este fuso', macNA: 'oculto pelo navegador', locating: 'localizando…',
    map: 'Mapa',
    synced: 'Sincronizado · {src}', corrected: 'Corrigido · {src}',
    drift: 'deriva do dispositivo {mag} — corrigida{res}',
    offLabel: 'Relógio do sistema — referência indisponível', offDetail: 'sem correção de deriva',
    lastCheck: 'última verificação {t}', syncing: 'sincronizando…', secondRes: ' · resolução de segundos', checking: 'verificando…',
    nightTitle: 'Alternar modo noturno (N)', tzTitle: 'Fuso horário', modeTitle: 'Analógico / digital (A)', resyncTitle: 'Verificar novamente a hora de referência (R)', fullTitle: 'Tela cheia (F)', full: 'Tela cheia', tzSearchPh: 'Buscar fusos horários…', tzListAria: 'Fusos horários', prevMatch: 'Ocorrência anterior', nextMatch: 'Próxima ocorrência', closeFind: 'Fechar barra de localizar', scrDocAria: 'Documento de transcrição', docTitle: 'Título do documento', untitled: 'Documento sem título', smatePh: 'Digite um comando…', smateTip: 'Assistente SMate', smateSend: 'Enviar', smateOnline: 'on-line', smateTyping: 'digitando…', smateUnavailable: 'indisponível', smateVoice: 'Entrada de voz', smateHi: 'Oi, eu sou o SMate. Experimente "timer 5", "fuso Taipei", "abrir carteira", "modo noturno" ou "help".', smateUnknown: 'Não entendi. Digite "help".',
    mHint: 'Toque numa estação e depois noutra — a tarifa aparece aqui.', mFrom: 'De', mTo: 'Para', mFare: 'Tarifa', mStations: 'estações', mTransfers: 'transferências', mMin: 'min', mSwap: 'Inverter', mClear: 'Limpar', mTRTC: 'Metrô de Taipé', mTY: 'MRT do aeroporto', mKS: 'Metrô de Kaohsiung', mTC: 'Metrô de Taichung',lpMetro: 'Metrô',  lpMetroSub: 'Calculadora de tarifas', lpWelcomeT: 'Bem-vindo ao SinghoLaunch', lpWelcomeS: 'Um launchpad para seu relógio mundial, tarifas de metrô, carteira, notas e configurações — privado, offline e seu.', lpStart: 'Começar', lpWorld: 'Pelo mundo', lpToday: 'Hoje',
    mCard: 'Cartão', mCardTap: 'Encoste o cartão na traseira do telefone…', mCardNone: 'Sem leitor aqui — a leitura exige um telefone com NFC.', mCardSeen: 'Cartão reconhecido', mCardBal: 'Saldo (NT$)', mCardNote: 'O saldo fica só neste aparelho; nenhum site consegue lê-lo do cartão.',
  },
  ur: {
    fareXsys: 'مختلف نظام — کرایہ ایک ہی نظام کے اندر ہوتا ہے',
    wallet: 'والٹ', walBalance: 'بیلنس', walExpense: 'خرچ', walIncome: 'آمدنی',
    walAmount: 'رقم', walNote: 'نوٹ', walAdd: 'شامل کریں', mAdd: 'شامل کریں', mCode: 'کوڈ', mCodePh: 'آپ کوڈ…', mLang: 'زبان', mSetup: '{name} تیار ہو رہا ہے — پہلی بار ایک بار ڈاؤن لوڈ ہوگا', mBusy: 'چل رہا ہے…', mMs: '{ms} ملی سیکنڈ میں مکمل', mNetErr: '{name} لوڈ نہیں ہوا — انٹرنیٹ چیک کریں', mStopped: 'رک گیا — بہت دیر لگی', zoomIn: 'زوم اِن', zoomOut: 'زوم آؤٹ', walDays: 'دن', walReports: 'رپورٹس', walCash: 'نقد', lpModule:'ماڈیول',lpModuleSub:'n8n طرز کی بصری آٹومیشن',flFiles:'فائلیں',flNew:'نیا',flOpen:'کھولیں',flRename:'نام بدلیں',flDuplicate:'نقل',flDelete:'حذف کریں',flExport:'برآمد',flImport:'درآمد',flUpdated:'ترمیم شدہ',flEmpty:'ابھی کوئی دستاویز نہیں',flSearch:'تلاش',flConfirm:'ہمیشہ کے لیے حذف؟',flUntitledNote:'بلا عنوان نوٹ',flUntitledFlow:'بلا عنوان فلو',mRun:'چلائیں',mGrid:'گرڈ',mText:'متن',mMarkdown:'مارک ڈاؤن',mIO:'I/O', mIOPh:'وہ متن جو آپ کا کوڈ پڑھے گا…', mFeedHint:'پروگرام ان پٹ مانگ رہا ہے — I/O نوڈ میں لکھ کر دوبارہ چلائیں',mResult:'نتیجہ',encPlain:'سادہ',encB64:'Base64',encUrl:'URL',encHex:'ہیکس',encUni:'یونی کوڈ',encEnt:'HTML انٹیٹی',encRot:'ROT13',
    walSpent: 'خرچ ہوا', walMonth: 'اس مہینے', walAvg: 'یومیہ اوسط', walWeek: 'پچھلے 7 دن',
    walTop: 'سب سے بڑا خرچ', pDay: 'دن', pWeek: 'ہفتہ', pMonth: 'مہینہ', pSem: 'سیمسٹر', pYear: 'سال', pDec: 'دہائی', walNet: 'خالص', walEmpty: 'ابھی کوئی لین دین نہیں', walCurrency: 'کرنسی کا نشان', walDelete: 'اندراج حذف کریں', walCurSearch: 'کرنسی تلاش کریں…', launchpad: 'لائنچ پیڈ', lpClock: 'گھڑی', lpClockSub: 'ڈرفٹ درست شدہ عالمی گھڑی', lpWalletSub: 'بیلنس، یومیہ خرچ اور رپورٹس',
    date: 'تاریخ', time: 'وقت', window: 'ونڈو', light: 'ہلکا', night: 'نائٹ موڈ',
    resync: 'دوبارہ سنک', search: 'شہر یا ملک تلاش کریں…', signin: 'سائن ان', signout: 'سائن آؤٹ', account: 'اکاؤنٹ', settings: 'ترتیبات', appearance: 'ظاہری شکل', homeCity: 'گھڑی کا شہر', currency: 'کرنسی', data: 'ڈیٹا', resetData: 'مقامی ڈیٹا ری سیٹ', resetQ: 'اس آلے پر زبان، تھیم، شہر، کرنسی اور اکاؤنٹ اسنیپ شاٹس صاف کریں؟ والٹ کے لین دین محفوظ رہیں گے۔', portalNote: 'سائن ان کریں تو آپ کی زبان، تھیم، شہر، کرنسی اور والٹ کسی بھی آلے پر آپ کے Google اکاؤنٹ کے ساتھ چلیں گے۔', lpSettingsSub: 'زبان، تھیم، شہر اور کرنسی', scribeIn: 'بولی جانے والی زبان', scribeOut: 'متن کی زبان', scribeStart: 'شروع', scribeStop: 'روکیں', scribeListening: 'سن رہا ہے', scribeClear: 'صاف', scribeCopy: 'کاپی', scribeDownload: 'ڈاؤن لوڈ', scribeSaved: 'تمام تبدیلیاں محفوظ', scribeSaving: 'محفوظ ہو رہا ہے…', scribeWords: 'الفاظ', scribeHint: 'اسٹارت دبائیں اور بولیں — نقل یہاں ظاہر ہوگا اور قابلِ ترمیم رہے گا۔', scribeNo: 'یہ براؤزر آواز کی پہچان سپورٹ نہیں کرتا۔', scribeUndo: 'واپس', scribeRedo: 'دوبارہ', scribeFind: 'تلاش', scribeReplace: 'بدلیں', scribeReplaceAll: 'سب بدلیں', scribePrint: 'پرنٹ', scribeImport: 'فائل درآمد', scribeStamps: 'ٹائم اسٹامپ', scribeChars: 'حروف', scribeNoHits: 'کوئی میل نہیں', lpScribeSub: 'لائیو لیکچر نقل', lpScribe: 'اسکرائب', language: 'زبان', local: 'مقامی',
    addZone: 'زون شامل کریں', single: 'واحد', side: 'بہ پہلو', quad: '2 × 2', grid16: '4 × 4', clearAll: 'سب صاف کریں', aiTip: 'ڈھیلے کمانڈز اور ہلکے سوالات کے لیے ڈیوائس پر AI (WebGPU)', aiLoad: 'AI جاگ رہا ہے — پہلی بار ماڈل ڈاؤن لوڈ ہوتا ہے۔ تھوڑی دیر میں دوبارہ پوچھیں۔', aiNoGpu: 'اس براؤزر میں WebGPU نہیں، آن ڈیوائس AI نہیں چلے گا — ٹائپ کی گئی کمانڈز چلتی رہیں گی۔', timeIn: '{c} میں ابھی {t} بجے ہیں۔', remindSet: '{n} منٹ میں یاد دہانی', remindNow: 'وقت ہو گیا', clearChat: 'چیٹ صاف کریں', voiceTip: 'جواب بول کر سنائیں',
    winTitle: 'ونڈو فارمیٹ', winAdd: 'اس ونڈو میں شامل کریں',
    analog: 'انالاگ', digital: 'ڈیجیٹل',
    timer: 'ٹائمر', start: 'شروع', pause: 'روکیں', resume: 'جاری', done: 'ہو گیا', running: 'جاری ہے', paused: 'موقوف', minutes: 'منٹ', clear: 'ہٹائیں',
    stopwatch: 'اسٹاپ واچ', reset: 'ری سیٹ', ipTitle: 'IP لوکیٹر', ipAddr: 'IP پتہ', mac: 'MAC', location: 'مقام', coords: 'کوآرڈینیٹس', useTz: 'یہ ٹائم زون استعمال کریں', macNA: 'براؤزر چھپاتا ہے', locating: 'تلاش جاری…',
    map: 'نقشہ',
    synced: 'ہم آہنگ · {src}', corrected: 'درست · {src}',
    drift: 'ڈیوائس ڈرفٹ {mag} — درست{res}',
    offLabel: 'سسٹم گھڑی — ماخذ دستیاب نہیں', offDetail: 'کوئی ڈرفٹ اصلاح لاگو نہیں',
    lastCheck: 'آخری معائنہ {t}', syncing: 'سنک ہو رہا ہے…', secondRes: ' · سیکنڈ ریزولیوشن', checking: 'معائنہ ہو رہا ہے…',
    nightTitle: 'نائٹ موڈ تبدیل کریں (N)', tzTitle: 'ٹائم زون', modeTitle: 'انالاگ / ڈیجیٹل (A)', resyncTitle: 'حوالہ وقت دوبارہ جانچیں (R)', fullTitle: 'فل اسکرین (F)', full: 'فل اسکرین', tzSearchPh: 'ٹائم زون تلاش کریں…', tzListAria: 'ٹائم زون', prevMatch: 'پچھلا میل', nextMatch: 'اگلا میل', closeFind: 'تلاش بار بند کریں', scrDocAria: 'نقل کی دستاویز', docTitle: 'دستاویز کا عنوان', untitled: 'بے عنوان دستاویز', smatePh: 'کمانڈ لکھیں…', smateTip: 'SMate معاون', smateSend: 'بھیجیں', smateOnline: 'آن لائن', smateTyping: 'تحریر کر رہا ہے…', smateUnavailable: 'دستیاب نہیں', smateVoice: 'صوتی ان پٹ', smateHi: 'ہیلو، میں SMate ہوں۔ "ٹائمر 5"، "ٹائم زون تائپے"، "والٹ کھولیں"، "نائٹ موڈ" یا "help" آزمائیں۔', smateUnknown: 'معذرت، سمجھ نہیں آیا۔ "help" لکھیں۔',
    mHint: 'اسٹیشن چھوئیں پھر دوسرا — کرایہ یہاں دکھے گا۔', mFrom: 'سے', mTo: 'تک', mFare: 'کرایہ', mStations: 'اسٹیشن', mTransfers: 'تبدیلیاں', mMin: 'منٹ', mSwap: 'الٹیں', mClear: 'صاف کریں', mTRTC: 'تائپے میٹرو', mTY: 'ایئرپورٹ MRT', mKS: 'کائوشیونگ میٹرو', mTC: 'تائچونگ میٹرو',lpMetro: 'میٹرو',  lpMetroSub: 'دو اسٹیشن، کرایہ', lpWelcomeT: 'SinghoLaunch میں خوش آمدید', lpWelcomeS: 'ایک لانچ پیڈ — ورلڈ گھڑی، میٹرو کرایہ، والٹ، نوٹس اور ترتیبات — نجی، آف لائن اور آپ کا۔', lpStart: 'شروع کریں', lpWorld: 'دنیا بھر میں', lpToday: 'آج',
    mCard: 'کارڈ', mCardTap: 'کارڈ فون کی پشت سے لگائیں…', mCardNone: 'یہاں کوئی ریڈر نہیں — اسکین کے لیے NFC والا فون چاہیے۔', mCardSeen: 'کارڈ پہچان لیا گیا', mCardBal: 'بیلنس (NT$)', mCardNote: 'بیلنس صرف اسی ڈیوائس پر رہتا ہے؛ کوئی ویب سائٹ اسے کارڈ سے نہیں پڑھ سکتی۔',
  },
  it: {
    fareXsys: 'sistemi diversi — la tariffa si calcola dentro lo stesso sistema',
    wallet: 'Portafoglio', walBalance: 'Saldo', walExpense: 'Spesa', walIncome: 'Entrata',
    walAmount: 'Importo', walNote: 'Nota', walAdd: 'Aggiungi', mAdd: 'Aggiungi', mCode: 'Codice', mCodePh: 'il tuo codice…', mLang: 'Linguaggio', mSetup: 'Preparo {name} — al primo avvio viene scaricato una volta', mBusy: 'Esecuzione…', mMs: 'fatto in {ms} ms', mNetErr: 'Impossibile caricare {name} — controlla la connessione', mStopped: 'Fermato — troppo lento', zoomIn: 'Ingrandisci', zoomOut: 'Riduci', walDays: 'Giorni', walReports: 'Report', walCash: 'Contanti', lpModule:'Modulo',lpModuleSub:'Automazione visuale stile n8n',flFiles:'File',flNew:'Nuovo',flOpen:'Apri',flRename:'Rinomina',flDuplicate:'Duplica',flDelete:'Elimina',flExport:'Esporta',flImport:'Importa',flUpdated:'Modificato',flEmpty:'Ancora nessun documento',flSearch:'Cerca',flConfirm:'Eliminare per sempre?',flUntitledNote:'Nota senza titolo',flUntitledFlow:'Flusso senza titolo',mRun:'Esegui',mGrid:'Griglia',mText:'Testo',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'il testo che leggerà il codice…', mFeedHint:'il programma chiede un input — scrivilo nel nodo I/O ed esegui di nuovo',mResult:'Risultato',encPlain:'Normale',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'Entità HTML',encRot:'ROT13',
    walSpent: 'Speso', walMonth: 'Questo mese', walAvg: 'Media giornaliera', walWeek: 'Ultimi 7 giorni',
    walTop: 'Spesa maggiore', pDay: 'Giorno', pWeek: 'Settimana', pMonth: 'Mese', pSem: 'Semestre', pYear: 'Anno', pDec: 'Decennio', walNet: 'Netto', walEmpty: 'Nessuna transazione', walCurrency: 'Simbolo valuta', walDelete: 'Elimina voce', walCurSearch: 'Cerca valute…', launchpad: 'Launchpad', lpClock: 'Orologio', lpClockSub: 'Orologio mondiale corretto dalla deriva', lpWalletSub: 'Saldo, spese giornaliere e report',
    date: 'Data', time: 'Ora', window: 'Finestra', light: 'Chiaro', night: 'Notte',
    resync: 'Risincronizza', search: 'Cerca città o paese…', signin: 'Accedi', signout: 'Esci',
    account: 'Account', settings: 'Impostazioni', appearance: 'Aspetto', homeCity: 'Città dell’orologio', currency: 'Valuta', data: 'Dati', resetData: 'Reimposta dati locali',
    resetQ: 'Cancellare lingua, tema, città, valuta e snapshot dell’account su questo dispositivo? Le transazioni del portafoglio restano.',
    portalNote: 'Accedi e lingua, tema, città, valuta e portafoglio seguiranno il tuo account Google su qualsiasi dispositivo.',
    lpSettingsSub: 'Lingua, tema, città e valuta',
    scribeIn: 'Lingua parlata', scribeOut: 'Lingua della trascrizione', scribeStart: 'Avvia', scribeStop: 'Ferma', scribeListening: 'In ascolto',
    scribeClear: 'Cancella', scribeCopy: 'Copia', scribeDownload: 'Scarica', scribeSaved: 'Modifiche salvate', scribeSaving: 'Salvataggio…', scribeWords: 'parole',
    scribeHint: 'Premi Avvia e parla: la trascrizione appare qui e resta modificabile.',
    scribeNo: 'Il riconoscimento vocale non è supportato in questo browser.',
    scribeUndo: 'Annulla', scribeRedo: 'Ripeti', scribeFind: 'Trova', scribeReplace: 'Sostituisci', scribeReplaceAll: 'Sostituisci tutto', scribePrint: 'Stampa', scribeImport: 'Importa file di testo', scribeStamps: 'Timestamp', scribeChars: 'caratteri', scribeNoHits: 'Nessun risultato',
    lpScribeSub: 'Trascrizione live delle lezioni', lpScribe: 'Scribe', language: 'Lingua', local: 'Locale', addZone: 'Aggiungi fuso', single: 'Singola', side: 'Affiancate', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Cancella tutto', aiTip: 'AI sul dispositivo (WebGPU) per comandi liberi e domande leggere',
    aiLoad: 'L’IA si sta svegliando: il modello sul dispositivo si scarica una volta al primo uso. Riprova tra poco.',
    aiNoGpu: 'Questo browser non ha WebGPU, quindi l’IA sul dispositivo non può funzionare qui; i comandi scritti funzionano comunque.',
    timeIn: 'Sono le {t} a {c}.', remindSet: 'Promemoria tra {n} min', remindNow: 'Tempo scaduto', clearChat: 'pulisci chat', voiceTip: 'Leggi le risposte ad alta voce', winTitle: 'Layout finestra', winAdd: 'Aggiungi a questa finestra', analog: 'Analogico', digital: 'Digitale', timer: 'Timer',
    start: 'Avvia', pause: 'Pausa', resume: 'Riprendi', done: 'Fatto', running: 'in esecuzione', paused: 'in pausa', minutes: 'Minuti', clear: 'Cancella', stopwatch: 'Cronometro', reset: 'Azzera',
    ipTitle: 'Localizzatore IP', ipAddr: 'Indirizzo IP', mac: 'MAC', location: 'Posizione', coords: 'Coordinate', useTz: 'Usa questo fuso', macNA: 'nascosto dal browser', locating: 'localizzazione…',
    map: 'Mappa', synced: 'Sincronizzato · {src}', corrected: 'Corretto · {src}', drift: 'deriva del dispositivo {mag} — corretta{res}', offLabel: 'Orologio di sistema — riferimento non disponibile', offDetail: 'nessuna correzione della deriva applicata', lastCheck: 'ultimo controllo {t}', syncing: 'sincronizzazione…', secondRes: ' · risoluzione al secondo', checking: 'controllo…',
    nightTitle: 'Attiva/disattiva notte (N)', tzTitle: 'Fuso orario', modeTitle: 'Analogico / digitale (A)', resyncTitle: 'Ricontrolla l’ora di riferimento (R)', fullTitle: 'Schermo intero (F)', full: 'Schermo intero',
    tzSearchPh: 'Cerca fusi orari…', tzListAria: 'Fusi orari', prevMatch: 'Corrispondenza precedente', nextMatch: 'Corrispondenza successiva', closeFind: 'Chiudi barra di ricerca', scrDocAria: 'Documento di trascrizione', docTitle: 'Titolo del documento', untitled: 'Documento senza titolo',
    smatePh: 'Scrivi un comando…', smateTip: 'Assistente SMate', smateSend: 'Invia', smateOnline: 'Online', smateTyping: 'sta scrivendo…', smateUnavailable: 'non disponibile', smateVoice: 'Input vocale',
    smateHi: 'Ciao, sono SMate. Prova “timer 5”, “zona Taipei”, “apri portafoglio”, “notte” o “help”.',
    smateUnknown: 'Scusa, non ho capito. Scrivi “help” per vedere cosa so fare.',
    mHint: 'Tocca una stazione e poi un’altra: la tariffa appare qui.', mFrom: 'Da', mTo: 'A', mFare: 'Tariffa', mStations: 'stazioni', mTransfers: 'cambi', mMin: 'min', mSwap: 'Inverti', mClear: 'Cancella', mTRTC: 'Metropolitana di Taipei', mTY: 'MRT dell’aeroporto', mKS: 'Metropolitana di Kaohsiung', mTC: 'Metropolitana di Taichung',lpMetro: 'Metro',  lpMetroSub: 'Calcolatore di tariffa', lpWelcomeT: 'Benvenuto in SinghoLaunch', lpWelcomeS: 'Un launchpad per orologio mondiale, tariffe metro, portafoglio, note e impostazioni — privato, offline e tuo.', lpStart: 'Inizia', lpWorld: 'Per il mondo', lpToday: 'Oggi',
    mCard: 'Carta', mCardTap: 'Avvicina la carta al retro del telefono…', mCardNone: 'Niente lettore qui — serve un telefono con NFC.', mCardSeen: 'Carta riconosciuta', mCardBal: 'Saldo (NT$)', mCardNote: 'Il saldo resta su questo dispositivo; nessun sito può leggerlo dalla carta.',
  },
  id: {
    fareXsys: 'sistem berbeda — tarif dihitung dalam satu sistem',
    wallet: 'Dompet', walBalance: 'Saldo', walExpense: 'Pengeluaran', walIncome: 'Pemasukan',
    walAmount: 'Jumlah', walNote: 'Catatan', walAdd: 'Tambah', mAdd: 'Tambah', mCode: 'Kode', mCodePh: 'kodemu…', mLang: 'Bahasa', mSetup: 'Menyiapkan {name} — diunduh sekali saat pertama kali', mBusy: 'Menjalankan…', mMs: 'selesai dalam {ms} ms', mNetErr: '{name} gagal dimuat — periksa koneksi', mStopped: 'Dihentikan — terlalu lama', zoomIn: 'Perbesar', zoomOut: 'Perkecil', walDays: 'Hari', walReports: 'Laporan', walCash: 'Tunai', lpModule:'Modul',lpModuleSub:'Otomasi visual gaya n8n',flFiles:'Berkas',flNew:'Baru',flOpen:'Buka',flRename:'Ganti nama',flDuplicate:'Duplikat',flDelete:'Hapus',flExport:'Ekspor',flImport:'Impor',flUpdated:'Diedit',flEmpty:'Belum ada dokumen',flSearch:'Cari',flConfirm:'Hapus permanen?',flUntitledNote:'Catatan tanpa judul',flUntitledFlow:'Alur tanpa judul',mRun:'Jalankan',mGrid:'Kisi',mText:'Teks',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'teks yang dibaca kode Anda…', mFeedHint:'program meminta input — ketik di node I/O lalu jalankan lagi',mResult:'Hasil',encPlain:'Polos',encB64:'Base64',encUrl:'URL',encHex:'Heks',encUni:'Unicode',encEnt:'Entitas HTML',encRot:'ROT13',
    walSpent: 'Terpakai', walMonth: 'Bulan ini', walAvg: 'Rata-rata harian', walWeek: '7 hari terakhir',
    walTop: 'Pengeluaran terbesar', pDay: 'Hari', pWeek: 'Minggu', pMonth: 'Bulan', pSem: 'Semester', pYear: 'Tahun', pDec: 'Dasawarsa', walNet: 'Bersih', walEmpty: 'Belum ada transaksi', walCurrency: 'Simbol mata uang', walDelete: 'Hapus entri', walCurSearch: 'Cari mata uang…', launchpad: 'Launchpad', lpClock: 'Jam', lpClockSub: 'Jam dunia terkoreksi drift', lpWalletSub: 'Saldo, pengeluaran harian & laporan',
    date: 'Tanggal', time: 'Waktu', window: 'Jendela', light: 'Terang', night: 'Mode Malam',
    resync: 'Sinkron ulang', search: 'Cari kota atau negara…', signin: 'Masuk', signout: 'Keluar',
    account: 'Akun', settings: 'Setelan', appearance: 'Tampilan', homeCity: 'Kota jam', currency: 'Mata uang', data: 'Data', resetData: 'Setel ulang data lokal',
    resetQ: 'Hapus bahasa, tema, kota, mata uang, dan snapshot akun di perangkat ini? Transaksi dompet tetap tersimpan.',
    portalNote: 'Masuk dan bahasa, tema, kota, mata uang, serta dompet Anda akan mengikuti akun Google di perangkat mana pun.',
    lpSettingsSub: 'Bahasa, tema, kota & mata uang',
    scribeIn: 'Bahasa lisan', scribeOut: 'Bahasa transkrip', scribeStart: 'Mulai', scribeStop: 'Berhenti', scribeListening: 'Mendengarkan',
    scribeClear: 'Bersihkan', scribeCopy: 'Salin', scribeDownload: 'Unduh', scribeSaved: 'Semua perubahan tersimpan', scribeSaving: 'Menyimpan…', scribeWords: 'kata',
    scribeHint: 'Tekan Mulai dan berbicaralah — transkrip muncul di sini dan tetap bisa diedit.',
    scribeNo: 'Pengenalan ucapan tidak didukung di browser ini.',
    scribeUndo: 'Urungkan', scribeRedo: 'Ulangi', scribeFind: 'Cari', scribeReplace: 'Ganti', scribeReplaceAll: 'Ganti semua', scribePrint: 'Cetak', scribeImport: 'Impor file teks', scribeStamps: 'Stempel waktu', scribeChars: 'karakter', scribeNoHits: 'Tidak ada kecocokan',
    lpScribeSub: 'Transkripsi kuliah langsung', lpScribe: 'Scribe', language: 'Bahasa', local: 'Lokal', addZone: 'Tambah zona', single: 'Tunggal', side: 'Berdampingan', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Hapus semua', aiTip: 'AI di perangkat (WebGPU) untuk perintah bebas dan pertanyaan ringan',
    aiLoad: 'AI sedang bangun — model di perangkat diunduh sekali pada pemakaian pertama. Tanyakan lagi sebentar lagi.',
    aiNoGpu: 'Browser ini tidak punya WebGPU, jadi AI di perangkat tidak dapat berjalan di sini — semua perintah tetap berfungsi saat diketik.',
    timeIn: 'Sekarang {t} di {c}.', remindSet: 'Pengingat dalam {n} mnt', remindNow: 'Waktu habis', clearChat: 'bersihkan obrolan', voiceTip: 'Bacakan balasan', winTitle: 'Tata letak jendela', winAdd: 'Tambah ke jendela ini', analog: 'Analog', digital: 'Digital', timer: 'Timer',
    start: 'Mulai', pause: 'Jeda', resume: 'Lanjut', done: 'Selesai', running: 'berjalan', paused: 'dijeda', minutes: 'Menit', clear: 'Bersihkan', stopwatch: 'Stopwatch', reset: 'Atur ulang',
    ipTitle: 'Pelacak IP', ipAddr: 'Alamat IP', mac: 'MAC', location: 'Lokasi', coords: 'Koordinat', useTz: 'Gunakan zona waktu ini', macNA: 'disembunyikan oleh browser', locating: 'melacak…',
    map: 'Peta', synced: 'Tersinkron · {src}', corrected: 'Terkoreksi · {src}', drift: 'drift perangkat {mag} — terkoreksi{res}', offLabel: 'Jam sistem — referensi tidak tersedia', offDetail: 'tidak ada koreksi drift', lastCheck: 'cek terakhir {t}', syncing: 'menyinkron…', secondRes: ' · resolusi detik', checking: 'memeriksa…',
    nightTitle: 'Alihkan mode malam (N)', tzTitle: 'Zona waktu', modeTitle: 'Analog / digital (A)', resyncTitle: 'Periksa ulang waktu referensi (R)', fullTitle: 'Layar penuh (F)', full: 'Layar penuh',
    tzSearchPh: 'Cari zona waktu…', tzListAria: 'Zona waktu', prevMatch: 'Kecocokan sebelumnya', nextMatch: 'Kecocokan berikutnya', closeFind: 'Tutup bilah cari', scrDocAria: 'Dokumen transkrip', docTitle: 'Judul dokumen', untitled: 'Dokumen tanpa judul',
    smatePh: 'Ketik perintah…', smateTip: 'Asisten SMate', smateSend: 'Kirim', smateOnline: 'Daring', smateTyping: 'mengetik…', smateUnavailable: 'tidak tersedia', smateVoice: 'Input suara',
    smateHi: 'Hai, saya SMate. Coba “timer 5”, “zona Taipei”, “buka dompet”, “mode malam”, atau “help”.',
    smateUnknown: 'Maaf, saya tidak mengerti. Ketik “help” untuk melihat kemampuan saya.',
    mHint: 'Ketuk satu stasiun lalu stasiun lain — tarif muncul di sini.', mFrom: 'Dari', mTo: 'Ke', mFare: 'Tarif', mStations: 'stasiun', mTransfers: 'transit', mMin: 'mnt', mSwap: 'Tukar', mClear: 'Bersihkan', mTRTC: 'MRT Taipei', mTY: 'MRT Bandara', mKS: 'MRT Kaohsiung', mTC: 'MRT Taichung',lpMetro: 'Metro',  lpMetroSub: 'Kalkulator tarif', lpWelcomeT: 'Selamat datang di SinghoLaunch', lpWelcomeS: 'Satu launchpad untuk jam dunia, tarif metro, dompet, catatan, dan pengaturan — privat, offline, dan milik Anda.', lpStart: 'Mulai', lpWorld: 'Keliling dunia', lpToday: 'Hari ini',
    mCard: 'Kartu', mCardTap: 'Tempelkan kartu di belakang ponsel…', mCardNone: 'Tak ada pembaca di sini — pindai butuh ponsel dengan NFC.', mCardSeen: 'Kartu dikenali', mCardBal: 'Saldo (NT$)', mCardNote: 'Saldo hanya di perangkat ini; situs mana pun tak bisa membacanya dari kartu.',
  },
  ko: {
    fareXsys: '서로 다른 노선망 — 운임은 같은 노선망 안에서 계산됩니다',
    wallet: '지갑', walBalance: '잔액', walExpense: '지출', walIncome: '수입',
    walAmount: '금액', walNote: '메모', walAdd: '추가', mAdd: '추가', mCode: '코드', mCodePh: '코드 입력…', mLang: '언어', mSetup: '{name} 준비 중 — 첫 실행 때 한 번 다운로드됩니다', mBusy: '실행 중…', mMs: '{ms} ms 만에 완료', mNetErr: '{name}을(를) 불러올 수 없습니다 — 인터넷 확인', mStopped: '중지됨 — 시간 초과', zoomIn: '확대', zoomOut: '축소', walDays: '일별', walReports: '보고서', walCash: '현금', lpModule:'모듈',lpModuleSub:'n8n 방식의 시각 자동화',flFiles:'파일',flNew:'새로 만들기',flOpen:'열기',flRename:'이름 바꾸기',flDuplicate:'복제',flDelete:'삭제',flExport:'내보내기',flImport:'가져오기',flUpdated:'편집됨',flEmpty:'아직 문서가 없습니다',flSearch:'검색',flConfirm:'영구 삭제할까요?',flUntitledNote:'제목 없는 노트',flUntitledFlow:'제목 없는 흐름',mRun:'실행',mGrid:'격자',mText:'텍스트',mMarkdown:'마크다운',mIO:'I/O', mIOPh:'코드가 읽을 텍스트…', mFeedHint:'프로그램이 입력을 기다리고 있습니다 — I/O 노드에 입력한 후 다시 실행하세요',mResult:'결과',encPlain:'일반 텍스트',encB64:'Base64',encUrl:'URL',encHex:'헥스',encUni:'유니코드',encEnt:'HTML 엔티티',encRot:'ROT13',
    walSpent: '지출액', walMonth: '이번 달', walAvg: '일평균', walWeek: '최근 7일',
    walTop: '최대 지출', pDay: '일', pWeek: '주', pMonth: '월', pSem: '학기', pYear: '년', pDec: '10년', walNet: '순액', walEmpty: '아직 거래가 없어요', walCurrency: '통화 기호', walDelete: '항목 삭제', walCurSearch: '통화 검색…', launchpad: '런치패드', lpClock: '시계', lpClockSub: '오차 보정 월드클락', lpWalletSub: '잔액, 일별 지출 & 보고서',
    date: '날짜', time: '시간', window: '화면', light: '라이트', night: '나이트 시프트',
    resync: '재동기화', search: '도시 또는 국가 검색…', signin: '로그인', signout: '로그아웃',
    account: '계정', settings: '설정', appearance: '모양', homeCity: '시계 도시', currency: '통화', data: '데이터', resetData: '로컬 데이터 초기화',
    resetQ: '이 기기의 언어, 테마, 도시, 통화, 계정 스냅샷을 지울까요? 지갑 거래는 유지됩니다.',
    portalNote: '로그인하면 언어, 테마, 도시, 통화, 지갑이 모든 기기의 Google 계정을 따릅니다.',
    lpSettingsSub: '언어, 테마, 도시 & 통화',
    scribeIn: '음성 언어', scribeOut: '스크립트 언어', scribeStart: '시작', scribeStop: '정지', scribeListening: '듣는 중',
    scribeClear: '지우기', scribeCopy: '복사', scribeDownload: '다운로드', scribeSaved: '모든 변경 사항 저장됨', scribeSaving: '저장 중…', scribeWords: '단어',
    scribeHint: '시작을 누르고 말하세요 — 스크립트가 여기에 표시되며 계속 편집할 수 있습니다.',
    scribeNo: '이 브라우저는 음성 인식을 지원하지 않습니다.',
    scribeUndo: '실행 취소', scribeRedo: '다시 실행', scribeFind: '찾기', scribeReplace: '바꾸기', scribeReplaceAll: '모두 바꾸기', scribePrint: '인쇄', scribeImport: '텍스트 파일 가져오기', scribeStamps: '타임스탬프', scribeChars: '자', scribeNoHits: '일치 없음',
    lpScribeSub: '실시간 강의 문자화', lpScribe: 'Scribe', language: '언어', local: '현지', addZone: '시간대 추가', single: '단일', side: '나란히', quad: '2 × 2', grid16: '4 × 4',
    clearAll: '모두 지우기', aiTip: '자유 명령과 가벼운 질문을 위한 온디바이스 AI(WebGPU)',
    aiLoad: 'AI가 깨어나는 중입니다 — 온디바이스 모델은 처음 사용할 때 한 번 다운로드됩니다. 잠시 후 다시 물어보세요.',
    aiNoGpu: '이 브라우저에는 WebGPU가 없어 온디바이스 AI를 실행할 수 없습니다 — 명령은 입력하면 그대로 작동합니다.',
    timeIn: '{c} 현재 {t}입니다.', remindSet: '{n}분 후 알림', remindNow: '시간이 되었습니다', clearChat: '채팅 지우기', voiceTip: '답장 소리 내어 읽기', winTitle: '창 레이아웃', winAdd: '이 창에 추가', analog: '아날로그', digital: '디지털', timer: '타이머',
    start: '시작', pause: '일시정지', resume: '계속', done: '완료', running: '작동 중', paused: '일시정지됨', minutes: '분', clear: '지우기', stopwatch: '스톱워치', reset: '리셋',
    ipTitle: 'IP 위치 찾기', ipAddr: 'IP 주소', mac: 'MAC', location: '위치', coords: '좌표', useTz: '이 시간대 사용', macNA: '브라우저가 숨김', locating: '위치 찾는 중…',
    map: '지도', synced: '동기화됨 · {src}', corrected: '보정됨 · {src}', drift: '기기 오차 {mag} — 보정됨{res}', offLabel: '시스템 시계 — 기준 시각 사용 불가', offDetail: '오차 보정 없음', lastCheck: '마지막 확인 {t}', syncing: '동기화 중…', secondRes: ' · 초 단위', checking: '확인 중…',
    nightTitle: '나이트 시프트 전환 (N)', tzTitle: '시간대', modeTitle: '아날로그 / 디지털 (A)', resyncTitle: '기준 시각 재확인 (R)', fullTitle: '전체 화면 (F)', full: '전체 화면',
    tzSearchPh: '시간대 검색…', tzListAria: '시간대', prevMatch: '이전 일치', nextMatch: '다음 일치', closeFind: '찾기 표시줄 닫기', scrDocAria: '스크립트 문서', docTitle: '문서 제목', untitled: '제목 없는 문서',
    smatePh: '명령 입력…', smateTip: 'SMate 어시스턴트', smateSend: '보내기', smateOnline: '온라인', smateTyping: '입력 중…', smateUnavailable: '사용 불가', smateVoice: '음성 입력',
    smateHi: '안녕하세요, SMate입니다. “타이머 5”, “시간대 타이베이”, “지갑 열기”, “나이트 시프트” 또는 “help”를 사용해 보세요.',
    smateUnknown: '죄송해요, 이해하지 못했어요. “help”를 입력해 보세요.',
    mHint: '역을 누르고 다른 역을 누르면 요금이 여기에 표시됩니다.', mFrom: '출발', mTo: '도착', mFare: '요금', mStations: '개 역', mTransfers: '환승', mMin: '분', mSwap: '교환', mClear: '지우기', mTRTC: '타이베이 첩운', mTY: '공항 첩운', mKS: '가오슝 첩운', mTC: '타이중 첩운',lpMetro: '지하철',  lpMetroSub: '두 역 요금 계산기', lpWelcomeT: 'SinghoLaunch에 오신 것을 환영합니다', lpWelcomeS: '세계 시계, 지하철 요금, 지갑, 메모, 설정을 하나의 런치패드에서 — 비공개, 오프라인, 당신만의 것.', lpStart: '시작하기', lpWorld: '세계 곳곳', lpToday: '오늘',
    mCard: '카드', mCardTap: '카드를 휴대폰 뒷면에 대세요…', mCardNone: '여긴 리더가 없어요 — NFC가 있는 휴대폰이 필요해요.', mCardSeen: '카드 인식됨', mCardBal: '잔액 (NT$)', mCardNote: '잔액은 이 기기에만 저장돼요. 어느 웹사이트도 카드에서 읽을 수 없어요.',
  },
  ja: {
    fareXsys: '異なるシステム — 運賃は同一システム内で計算されます',
    wallet: 'ウォレット', walBalance: '残高', walExpense: '支出', walIncome: '収入',
    walAmount: '金額', walNote: 'メモ', walAdd: '追加', mAdd: '追加', mCode: 'コード', mCodePh: 'コードを入力…', mLang: '言語', mSetup: '{name} を準備中 — 初回のみダウンロードされます', mBusy: '実行中…', mMs: '{ms} ミリ秒で完了', mNetErr: '{name} を読み込めません — 接続を確認', mStopped: '停止しました — 時間切れ', zoomIn: '拡大', zoomOut: '縮小', walDays: '日別', walReports: 'レポート', walCash: '現金', lpModule:'モジュール',lpModuleSub:'n8nスタイルのビジュアル自動化',flFiles:'ファイル',flNew:'新規',flOpen:'開く',flRename:'名前を変更',flDuplicate:'複製',flDelete:'削除',flExport:'書き出し',flImport:'読み込み',flUpdated:'編集済み',flEmpty:'まだドキュメントがありません',flSearch:'検索',flConfirm:'完全に削除しますか？',flUntitledNote:'無題のノート',flUntitledFlow:'無題のフロー',mRun:'実行',mGrid:'グリッド',mText:'テキスト',mMarkdown:'マークダウン',mIO:'I/O', mIOPh:'コードが読むテキスト…', mFeedHint:'プログラムが入力を待っています — I/Oノードに入力してから再実行してください',mResult:'結果',encPlain:'そのまま',encB64:'Base64',encUrl:'URL',encHex:'16進数',encUni:'Unicode',encEnt:'HTMLエンティティ',encRot:'ROT13',
    walSpent: '使用額', walMonth: '今月', walAvg: '日均値', walWeek: '過去7日間',
    walTop: '最大の支出', pDay: '日', pWeek: '週', pMonth: '月', pSem: '学期', pYear: '年', pDec: '10年', walNet: '純額', walEmpty: 'まだ取引がありません', walCurrency: '通貨記号', walDelete: '項目を削除', walCurSearch: '通貨を検索…', launchpad: 'ランチパッド', lpClock: '時計', lpClockSub: 'ドリフト補正ワールドクロック', lpWalletSub: '残高・日別支出・レポート',
    date: '日付', time: '時刻', window: 'ウィンドウ', light: 'ライト', night: 'ナイトシフト',
    resync: '再同期', search: '都市・国を検索…', signin: 'ログイン', signout: 'ログアウト',
    account: 'アカウント', settings: '設定', appearance: '外観', homeCity: '時計の都市', currency: '通貨', data: 'データ', resetData: 'ローカルデータを初期化',
    resetQ: 'この端末の言語・テーマ・都市・通貨・アカウントのスナップショットを消去しますか？ウォレットの取引は保持されます。',
    portalNote: 'ログインすると、言語・テーマ・都市・通貨・ウォレットがどの端末でもGoogleアカウントに従います。',
    lpSettingsSub: '言語・テーマ・都市・通貨',
    scribeIn: '音声言語', scribeOut: '書き起こし言語', scribeStart: '開始', scribeStop: '停止', scribeListening: '聞き取り中',
    scribeClear: 'クリア', scribeCopy: 'コピー', scribeDownload: 'ダウンロード', scribeSaved: '変更をすべて保存しました', scribeSaving: '保存中…', scribeWords: '語',
    scribeHint: '開始を押して話してください — 書き起こしはここに表示され、編集もできます。',
    scribeNo: 'このブラウザは音声認識に対応していません。',
    scribeUndo: '元に戻す', scribeRedo: 'やり直す', scribeFind: '検索', scribeReplace: '置換', scribeReplaceAll: 'すべて置換', scribePrint: '印刷', scribeImport: 'テキストファイルをインポート', scribeStamps: 'タイムスタンプ', scribeChars: '文字', scribeNoHits: '一致なし',
    lpScribeSub: '講義のライブ書き起こし', lpScribe: 'Scribe', language: '言語', local: '現地', addZone: 'タイムゾーンを追加', single: '単独', side: '並べて', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'すべてクリア', aiTip: 'ゆるい命令と軽い質問のためのオンデバイスAI（WebGPU）',
    aiLoad: 'AIが起動中です — オンデバイスモデルは初回のみダウンロードされます。もう少ししてから聞いてください。',
    aiNoGpu: 'このブラウザにはWebGPUがないため、オンデバイスAIは動作しません — コマンドは入力すれば使えます。',
    timeIn: '{c}は今{t}です。', remindSet: '{n}分後にリマインド', remindNow: '時間です', clearChat: 'チャットをクリア', voiceTip: '返事を読み上げる', winTitle: 'ウィンドウレイアウト', winAdd: 'このウィンドウに追加', analog: 'アナログ', digital: 'デジタル', timer: 'タイマー',
    start: '開始', pause: '一時停止', resume: '再開', done: '完了', running: '動作中', paused: '一時停止中', minutes: '分', clear: 'クリア', stopwatch: 'ストップウォッチ', reset: 'リセット',
    ipTitle: 'IPロケーター', ipAddr: 'IPアドレス', mac: 'MAC', location: '位置', coords: '座標', useTz: 'このタイムゾーンを使う', macNA: 'ブラウザにより非表示', locating: '測位中…',
    map: '地図', synced: '同期済み · {src}', corrected: '補正済み · {src}', drift: '端末ドリフト {mag} — 補正済み{res}', offLabel: 'システム時計 — 基準時刻なし', offDetail: 'ドリフト補正なし', lastCheck: '最終確認 {t}', syncing: '同期中…', secondRes: ' · 秒精度', checking: '確認中…',
    nightTitle: 'ナイトシフト切替 (N)', tzTitle: 'タイムゾーン', modeTitle: 'アナログ／デジタル (A)', resyncTitle: '基準時刻を再確認 (R)', fullTitle: '全画面 (F)', full: '全画面',
    tzSearchPh: 'タイムゾーンを検索…', tzListAria: 'タイムゾーン', prevMatch: '前の一致', nextMatch: '次の一致', closeFind: '検索バーを閉じる', scrDocAria: '書き起こしドキュメント', docTitle: 'ドキュメントタイトル', untitled: '無題のドキュメント',
    smatePh: 'コマンドを入力…', smateTip: 'SMateアシスタント', smateSend: '送信', smateOnline: 'オンライン', smateTyping: '入力中…', smateUnavailable: '利用不可', smateVoice: '音声入力',
    smateHi: 'こんにちは、SMateです。「タイマー 5」「ゾーン 台北」「ウォレットを開く」「ナイトシフト」「help」などを試してください。',
    smateUnknown: 'すみません、聞き取れませんでした。「help」でできることの一覧が出ます。',
    mHint: '駅をタップして、もう一つタップ——運賃がここに表示されます。', mFrom: '出発', mTo: '到着', mFare: '運賃', mStations: '駅', mTransfers: '乗り換え', mMin: '分', mSwap: '入替', mClear: 'クリア', mTRTC: '台北メトロ', mTY: '空港MRT', mKS: '高雄メトロ', mTC: '台中メトロ',lpMetro: 'メトロ',  lpMetroSub: 'タップで運賃計算', lpWelcomeT: 'SinghoLaunch へようこそ', lpWelcomeS: '世界時計・運賃・ウォレット・メモ・設定をひとつのランチパッドに——プライベートでオフライン、あなたのもの。', lpStart: 'はじめる', lpWorld: '世界各地', lpToday: '今日',
    mCard: 'カード', mCardTap: 'カードをスマホの背面に重ねて…', mCardNone: 'ここにはリーダーがありません——NFC対応のスマホが必要です。', mCardSeen: 'カードを認識しました', mCardBal: '残高（NT$）', mCardNote: '残高はこの端末の中にだけ保存されます。ウェブサイトがカードから読むことはできません。',
  },
  ms: {
    fareXsys: 'sistem berbeza — tambang dikira dalam satu sistem',
    wallet: 'Dompet', walBalance: 'Baki', walExpense: 'Perbelanjaan', walIncome: 'Pendapatan',
    walAmount: 'Jumlah', walNote: 'Nota', walAdd: 'Tambah', mAdd: 'Tambah', mCode: 'Kod', mCodePh: 'kod anda…', mLang: 'Bahasa', mSetup: 'Menyediakan {name} — dimuat turun sekali pada kali pertama', mBusy: 'Berjalan…', mMs: 'siap dalam {ms} ms', mNetErr: '{name} gagal dimuat — semak sambungan', mStopped: 'Dihentikan — terlalu lama', zoomIn: 'Zum masuk', zoomOut: 'Zum keluar', walDays: 'Hari', walReports: 'Laporan', walCash: 'Tunai', lpModule:'Modul',lpModuleSub:'Automasi visual gaya n8n',flFiles:'Fail',flNew:'Baru',flOpen:'Buka',flRename:'Namakan semula',flDuplicate:'Pendua',flDelete:'Padam',flExport:'Eksport',flImport:'Import',flUpdated:'Disunting',flEmpty:'Belum ada dokumen',flSearch:'Cari',flConfirm:'Padam kekal?',flUntitledNote:'Nota tanpa tajuk',flUntitledFlow:'Aliran tanpa tajuk',mRun:'Jalankan',mGrid:'Grid',mText:'Teks',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'teks yang dibaca oleh kod anda…', mFeedHint:'aturan meminta input — taip dalam nod I/O kemudian jalankan semula',mResult:'Hasil',encPlain:'Biasa',encB64:'Base64',encUrl:'URL',encHex:'Heks',encUni:'Unicode',encEnt:'Entiti HTML',encRot:'ROT13',
    walSpent: 'Dibelanjakan', walMonth: 'Bulan ini', walAvg: 'Purata harian', walWeek: '7 hari lepas',
    walTop: 'Perbelanjaan terbesar', pDay: 'Hari', pWeek: 'Minggu', pMonth: 'Bulan', pSem: 'Semester', pYear: 'Tahun', pDec: 'Dekad', walNet: 'Bersih', walEmpty: 'Tiada transaksi lagi', walCurrency: 'Simbol mata wang', walDelete: 'Padam entri', walCurSearch: 'Cari mata wang…', launchpad: 'Launchpad', lpClock: 'Jam', lpClockSub: 'Jam dunia diperbetul hanyutan', lpWalletSub: 'Baki, perbelanjaan harian & laporan',
    date: 'Tarikh', time: 'Masa', window: 'Tetingkap', light: 'Cerah', night: 'Syif Malam',
    resync: 'Segerak semula', search: 'Cari bandar atau negara…', signin: 'Log masuk', signout: 'Log keluar',
    account: 'Akaun', settings: 'Tetapan', appearance: 'Penampilan', homeCity: 'Bandar jam', currency: 'Mata wang', data: 'Data', resetData: 'Tetap semula data setempat',
    resetQ: 'Kosongkan bahasa, tema, bandar, mata wang dan snapshot akaun pada peranti ini? Transaksi dompet disimpan.',
    portalNote: 'Log masuk dan bahasa, tema, bandar, mata wang serta dompet anda akan mengikut akaun Google anda di mana-mana peranti.',
    lpSettingsSub: 'Bahasa, tema, bandar & mata wang',
    scribeIn: 'Bahasa pertuturan', scribeOut: 'Bahasa transkrip', scribeStart: 'Mula', scribeStop: 'Berhenti', scribeListening: 'Mendengar',
    scribeClear: 'Kosongkan', scribeCopy: 'Salin', scribeDownload: 'Muat turun', scribeSaved: 'Semua perubahan disimpan', scribeSaving: 'Menyimpan…', scribeWords: 'patah perkataan',
    scribeHint: 'Tekan Mula dan bercakap — transkrip muncul di sini dan kekal boleh diedit.',
    scribeNo: 'Pengecaman pertuturan tidak disokong dalam penyemak imbas ini.',
    scribeUndo: 'Buat asal', scribeRedo: 'Buat semula', scribeFind: 'Cari', scribeReplace: 'Ganti', scribeReplaceAll: 'Ganti semua', scribePrint: 'Cetak', scribeImport: 'Import fail teks', scribeStamps: 'Cap masa', scribeChars: 'aksara', scribeNoHits: 'Tiada padanan',
    lpScribeSub: 'Transkripsi kuliah langsung', lpScribe: 'Scribe', language: 'Bahasa', local: 'Setempat', addZone: 'Tambah zon', single: 'Tunggal', side: 'Sebelah-menyebelah', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Kosongkan semua', aiTip: 'AI atas peranti (WebGPU) untuk arahan longgar dan soalan ringan',
    aiLoad: 'AI sedang bangun — model atas peranti dimuat turun sekali semasa pertama guna. Tanya lagi sebentar lagi.',
    aiNoGpu: 'Penyemak imbas ini tiada WebGPU, jadi AI atas peranti tidak dapat berjalan di sini — semua arahan tetap berfungsi bila ditaip.',
    timeIn: 'Sekarang {t} di {c}.', remindSet: 'Peringatan dalam {n} min', remindNow: 'Masa tamat', clearChat: 'kosongkan sembang', voiceTip: 'Sebutkan balasan', winTitle: 'Susun atur tetingkap', winAdd: 'Tambah ke tetingkap ini', analog: 'Analog', digital: 'Digital', timer: 'Pemasa',
    start: 'Mula', pause: 'Jeda', resume: 'Sambung', done: 'Selesai', running: 'berjalan', paused: 'dijeda', minutes: 'Minit', clear: 'Kosongkan', stopwatch: 'Jam randik', reset: 'Tetap semula',
    ipTitle: 'Pelokasi IP', ipAddr: 'Alamat IP', mac: 'MAC', location: 'Lokasi', coords: 'Koordinat', useTz: 'Guna zon waktu ini', macNA: 'disembunyikan oleh penyemak imbas', locating: 'mengesan lokasi…',
    map: 'Peta', synced: 'Disegerak · {src}', corrected: 'Diperbetul · {src}', drift: 'hanyutan peranti {mag} — diperbetul{res}', offLabel: 'Jam sistem — rujukan tiada', offDetail: 'tiada pembetulan hanyutan', lastCheck: 'semakan terakhir {t}', syncing: 'menyegerak…', secondRes: ' · resolusi saat', checking: 'menyemak…',
    nightTitle: 'Togol syif malam (N)', tzTitle: 'Zon waktu', modeTitle: 'Analog / digital (A)', resyncTitle: 'Semak semula waktu rujukan (R)', fullTitle: 'Skrin penuh (F)', full: 'Skrin penuh',
    tzSearchPh: 'Cari zon waktu…', tzListAria: 'Zon waktu', prevMatch: 'Padanan sebelumnya', nextMatch: 'Padanan seterusnya', closeFind: 'Tutup bar carian', scrDocAria: 'Dokumen transkrip', docTitle: 'Tajuk dokumen', untitled: 'Dokumen tanpa tajuk',
    smatePh: 'Taip arahan…', smateTip: 'Pembantu SMate', smateSend: 'Hantar', smateOnline: 'Dalam talian', smateTyping: 'menaip…', smateUnavailable: 'tiada', smateVoice: 'Input suara',
    smateHi: 'Hai, saya SMate. Cuba “pemasa 5”, “zon Taipei”, “buka dompet”, “syif malam” atau “help”.',
    smateUnknown: 'Maaf, saya tidak faham. Taip “help” untuk melihat kemampuan saya.',
    mHint: 'Ketik satu stesen kemudian stesen lain — tambang muncul di sini.', mFrom: 'Dari', mTo: 'Ke', mFare: 'Tambang', mStations: 'stesen', mTransfers: 'pertukaran', mMin: 'min', mSwap: 'Tukar', mClear: 'Kosongkan', mTRTC: 'Metro Taipei', mTY: 'MRT Lapangan Terbang', mKS: 'Metro Kaohsiung', mTC: 'Metro Taichung',lpMetro: 'Metro',  lpMetroSub: 'Kalkulator tambang', lpWelcomeT: 'Selamat datang ke SinghoLaunch', lpWelcomeS: 'Satu launchpad untuk jam dunia, tambang metro, dompet, nota dan tetapan — peribadi, luar talian dan milik anda.', lpStart: 'Mula', lpWorld: 'Seluruh dunia', lpToday: 'Hari ini',
    mCard: 'Kad', mCardTap: 'Lekapkan kad di belakang telefon…', mCardNone: 'Tiada pembaca di sini — imbasan perlukan telefon dengan NFC.', mCardSeen: 'Kad dikenali', mCardBal: 'Baki (NT$)', mCardNote: 'Baki hanya dalam peranti ini; tiada laman boleh membacanya dari kad.',
  },
  de: {
    fareXsys: 'verschiedene Systeme — der Tarif gilt innerhalb eines Systems',
    wallet: 'Geldbörse', walBalance: 'Guthaben', walExpense: 'Ausgabe', walIncome: 'Einnahme',
    walAmount: 'Betrag', walNote: 'Notiz', walAdd: 'Hinzufügen', mAdd: 'Hinzufügen', mCode: 'Code', mCodePh: 'dein Code…', mLang: 'Sprache', mSetup: '{name} wird vorbereitet — beim ersten Start wird er einmal geladen', mBusy: 'Ausführung…', mMs: 'fertig in {ms} ms', mNetErr: '{name} konnte nicht geladen werden — Internet prüfen', mStopped: 'Angehalten — zu lange', zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', walDays: 'Tage', walReports: 'Berichte', walCash: 'Bargeld', lpModule:'Modul',lpModuleSub:'Visuelle Automatisierung im n8n-Stil',flFiles:'Dateien',flNew:'Neu',flOpen:'Öffnen',flRename:'Umbenennen',flDuplicate:'Duplizieren',flDelete:'Löschen',flExport:'Exportieren',flImport:'Importieren',flUpdated:'Bearbeitet',flEmpty:'Noch keine Dokumente',flSearch:'Suchen',flConfirm:'Endgültig löschen?',flUntitledNote:'Notiz ohne Titel',flUntitledFlow:'Ablauf ohne Titel',mRun:'Ausführen',mGrid:'Raster',mText:'Text',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'der Text, den dein Code liest…', mFeedHint:'das Programm wartet auf eine Eingabe — tippe sie in den I/O-Knoten und führe es erneut aus',mResult:'Ergebnis',encPlain:'Unformatiert',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'HTML-Entitäten',encRot:'ROT13',
    walSpent: 'Ausgegeben', walMonth: 'Dieser Monat', walAvg: 'Tagesdurchschnitt', walWeek: 'Letzte 7 Tage',
    walTop: 'Größte Ausgabe', pDay: 'Tag', pWeek: 'Woche', pMonth: 'Monat', pSem: 'Semester', pYear: 'Jahr', pDec: 'Jahrzehnt', walNet: 'Saldo', walEmpty: 'Noch keine Transaktionen', walCurrency: 'Währungssymbol', walDelete: 'Eintrag löschen', walCurSearch: 'Währungen suchen…', launchpad: 'Launchpad', lpClock: 'Uhr', lpClockSub: 'Drift-korrigierte Weltuhr', lpWalletSub: 'Guthaben, Tagesausgaben & Berichte',
    date: 'Datum', time: 'Zeit', window: 'Fenster', light: 'Hell', night: 'Nachtmodus',
    resync: 'Neu synchronisieren', search: 'Stadt oder Land suchen…', signin: 'Anmelden', signout: 'Abmelden',
    account: 'Konto', settings: 'Einstellungen', appearance: 'Darstellung', homeCity: 'Uhrstadt', currency: 'Währung', data: 'Daten', resetData: 'Lokale Daten zurücksetzen',
    resetQ: 'Sprache, Thema, Stadt, Währung und Konto-Snapshots auf diesem Gerät löschen? Wallet-Transaktionen bleiben erhalten.',
    portalNote: 'Melde dich an und Sprache, Thema, Stadt, Währung und Wallet folgen deinem Google-Konto auf jedem Gerät.',
    lpSettingsSub: 'Sprache, Thema, Stadt & Währung',
    scribeIn: 'Gesprochene Sprache', scribeOut: 'Transkriptsprache', scribeStart: 'Start', scribeStop: 'Stopp', scribeListening: 'Hört zu',
    scribeClear: 'Leeren', scribeCopy: 'Kopieren', scribeDownload: 'Herunterladen', scribeSaved: 'Alle Änderungen gespeichert', scribeSaving: 'Speichert…', scribeWords: 'Wörter',
    scribeHint: 'Drücke Start und sprich — das Transkript erscheint hier und bleibt bearbeitbar.',
    scribeNo: 'Spracherkennung wird in diesem Browser nicht unterstützt.',
    scribeUndo: 'Rückgängig', scribeRedo: 'Wiederholen', scribeFind: 'Suchen', scribeReplace: 'Ersetzen', scribeReplaceAll: 'Alle ersetzen', scribePrint: 'Drucken', scribeImport: 'Textdatei importieren', scribeStamps: 'Zeitstempel', scribeChars: 'Zeichen', scribeNoHits: 'Keine Treffer',
    lpScribeSub: 'Live-Transkription von Vorlesungen', lpScribe: 'Scribe', language: 'Sprache', local: 'Lokal', addZone: 'Zone hinzufügen', single: 'Einzel', side: 'Nebeneinander', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Alles leeren', aiTip: 'On-Device-KI (WebGPU) für lockere Befehle und leichte Fragen',
    aiLoad: 'Die KI wacht auf — das On-Device-Modell wird beim ersten Gebrauch einmal geladen. Frage gleich noch einmal.',
    aiNoGpu: 'Dieser Browser hat kein WebGPU, daher läuft die On-Device-KI hier nicht — Befehle funktionieren weiterhin per Eingabe.',
    timeIn: 'Es ist {t} in {c}.', remindSet: 'Erinnerung in {n} Min.', remindNow: 'Zeit abgelaufen', clearChat: 'Chat leeren', voiceTip: 'Antworten vorlesen', winTitle: 'Fensterlayout', winAdd: 'Zu diesem Fenster hinzufügen', analog: 'Analog', digital: 'Digital', timer: 'Timer',
    start: 'Start', pause: 'Pause', resume: 'Fortsetzen', done: 'Fertig', running: 'läuft', paused: 'pausiert', minutes: 'Minuten', clear: 'Leeren', stopwatch: 'Stoppuhr', reset: 'Zurücksetzen',
    ipTitle: 'IP-Ortung', ipAddr: 'IP-Adresse', mac: 'MAC', location: 'Standort', coords: 'Koordinaten', useTz: 'Diese Zeitzone verwenden', macNA: 'vom Browser verborgen', locating: 'orte…',
    map: 'Karte', synced: 'Synchronisiert · {src}', corrected: 'Korrigiert · {src}', drift: 'Geräte-Drift {mag} — korrigiert{res}', offLabel: 'Systemuhr — Referenz nicht verfügbar', offDetail: 'keine Drift-Korrektur angewendet', lastCheck: 'letzte Prüfung {t}', syncing: 'synchronisiere…', secondRes: ' · Sekundengenauigkeit', checking: 'prüfe…',
    nightTitle: 'Nachtmodus umschalten (N)', tzTitle: 'Zeitzone', modeTitle: 'Analog / digital (A)', resyncTitle: 'Referenzzeit erneut prüfen (R)', fullTitle: 'Vollbild (F)', full: 'Vollbild',
    tzSearchPh: 'Zeitzonen suchen…', tzListAria: 'Zeitzonen', prevMatch: 'Voriger Treffer', nextMatch: 'Nächster Treffer', closeFind: 'Suchleiste schließen', scrDocAria: 'Transkriptdokument', docTitle: 'Dokumenttitel', untitled: 'Unbenanntes Dokument',
    smatePh: 'Befehl eingeben…', smateTip: 'SMate-Assistent', smateSend: 'Senden', smateOnline: 'Online', smateTyping: 'schreibt…', smateUnavailable: 'nicht verfügbar', smateVoice: 'Spracheingabe',
    smateHi: 'Hi, ich bin SMate. Probier „timer 5“, „zone Taipei“, „Wallet öffnen“, „Nachtmodus“ oder „help“.',
    smateUnknown: 'Sorry, das habe ich nicht verstanden. Tippe „help“.',
    mHint: 'Tippe auf eine Station und dann auf eine andere — der Preis erscheint hier.', mFrom: 'Von', mTo: 'Nach', mFare: 'Preis', mStations: 'Stationen', mTransfers: 'Umstiege', mMin: 'Min', mSwap: 'Tauschen', mClear: 'Leeren', mTRTC: 'Taipeh-Metro', mTY: 'Flughafen-MRT', mKS: 'Kaohsiung-Metro', mTC: 'Taichung-Metro',lpMetro: 'Metro',  lpMetroSub: 'Tarifrechner', lpWelcomeT: 'Willkommen bei SinghoLaunch', lpWelcomeS: 'Ein Launchpad für Weltzeituhr, Metro-Preise, Wallet, Notizen und Einstellungen — privat, offline und deins.', lpStart: 'Loslegen', lpWorld: 'Rund um die Welt', lpToday: 'Heute',
    mCard: 'Karte', mCardTap: 'Halte die Karte an die Rückseite des Telefons…', mCardNone: 'Kein Lesegerät hier — zum Scannen braucht es ein Telefon mit NFC.', mCardSeen: 'Karte erkannt', mCardBal: 'Guthaben (NT$)', mCardNote: 'Das Guthaben bleibt auf diesem Gerät; keine Website kann es von der Karte lesen.',
  },
  pl: {
    fareXsys: 'różne systemy — taryfa liczona jest w obrębie jednego systemu',
    wallet: 'Portfel', walBalance: 'Saldo', walExpense: 'Wydatek', walIncome: 'Przychód',
    walAmount: 'Kwota', walNote: 'Notatka', walAdd: 'Dodaj', mAdd: 'Dodaj', mCode: 'Kod', mCodePh: 'twój kod…', mLang: 'Język', mSetup: 'Przygotowuję {name} — przy pierwszym uruchomieniu pobierze się raz', mBusy: 'Uruchamianie…', mMs: 'gotowe w {ms} ms', mNetErr: 'Nie udało się wczytać {name} — sprawdź internet', mStopped: 'Zatrzymano — za długo', zoomIn: 'Powiększ', zoomOut: 'Pomniejsz', walDays: 'Dni', walReports: 'Raporty', walCash: 'Gotówka', lpModule:'Moduł',lpModuleSub:'Automatyzacja wizualna w stylu n8n',flFiles:'Pliki',flNew:'Nowy',flOpen:'Otwórz',flRename:'Zmień nazwę',flDuplicate:'Duplikuj',flDelete:'Usuń',flExport:'Eksportuj',flImport:'Importuj',flUpdated:'Edytowano',flEmpty:'Brak dokumentów',flSearch:'Szukaj',flConfirm:'Usunąć na zawsze?',flUntitledNote:'Notatka bez tytułu',flUntitledFlow:'Przepływ bez tytułu',mRun:'Uruchom',mGrid:'Siatka',mText:'Tekst',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'tekst, który odczyta kod…', mFeedHint:'program czeka na dane wejściowe — wpisz je w węzeł I/O i uruchom ponownie',mResult:'Rezultat',encPlain:'Zwykły',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'Encje HTML',encRot:'ROT13',
    walSpent: 'Wydano', walMonth: 'Ten miesiąc', walAvg: 'Średnia dzienna', walWeek: 'Ostatnie 7 dni',
    walTop: 'Największy wydatek', pDay: 'Dzień', pWeek: 'Tydzień', pMonth: 'Miesiąc', pSem: 'Semestr', pYear: 'Rok', pDec: 'Dekada', walNet: 'Netto', walEmpty: 'Brak transakcji', walCurrency: 'Symbol waluty', walDelete: 'Usuń wpis', walCurSearch: 'Szukaj walut…', launchpad: 'Launchpad', lpClock: 'Zegar', lpClockSub: 'Zegar światowy z korektą dryfu', lpWalletSub: 'Saldo, dzienne wydatki i raporty',
    date: 'Data', time: 'Czas', window: 'Okno', light: 'Jasny', night: 'Tryb nocny',
    resync: 'Synchronizuj ponownie', search: 'Szukaj miasta lub kraju…', signin: 'Zaloguj się', signout: 'Wyloguj się',
    account: 'Konto', settings: 'Ustawienia', appearance: 'Wygląd', homeCity: 'Miasto zegara', currency: 'Waluta', data: 'Dane', resetData: 'Resetuj dane lokalne',
    resetQ: 'Wyczyścić język, motyw, miasto, walutę i migawki konta na tym urządzeniu? Transakcje portfela zostaną zachowane.',
    portalNote: 'Zaloguj się, a język, motyw, miasto, waluta i portfel będą podążać za Twoim kontem Google na każdym urządzeniu.',
    lpSettingsSub: 'Język, motyw, miasto i waluta',
    scribeIn: 'Język mówiony', scribeOut: 'Język transkrypcji', scribeStart: 'Start', scribeStop: 'Stop', scribeListening: 'Słucham',
    scribeClear: 'Wyczyść', scribeCopy: 'Kopiuj', scribeDownload: 'Pobierz', scribeSaved: 'Zapisano wszystkie zmiany', scribeSaving: 'Zapisywanie…', scribeWords: 'słów',
    scribeHint: 'Naciśnij Start i mów — transkrypcja pojawi się tutaj i pozostanie edytowalna.',
    scribeNo: 'Rozpoznawanie mowy nie jest obsługiwane w tej przeglądarce.',
    scribeUndo: 'Cofnij', scribeRedo: 'Ponów', scribeFind: 'Znajdź', scribeReplace: 'Zamień', scribeReplaceAll: 'Zamień wszystko', scribePrint: 'Drukuj', scribeImport: 'Importuj plik tekstowy', scribeStamps: 'Znaczniki czasu', scribeChars: 'znaki', scribeNoHits: 'Brak wyników',
    lpScribeSub: 'Transkrypcja wykładów na żywo', lpScribe: 'Scribe', language: 'Język', local: 'Lokalny', addZone: 'Dodaj strefę', single: 'Pojedynczy', side: 'Obok siebie', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Wyczyść wszystko', aiTip: 'AI na urządzeniu (WebGPU) do swobodnych poleceń i lekkich pytań',
    aiLoad: 'AI się budzi — model na urządzeniu pobiera się raz przy pierwszym użyciu. Zapytaj ponownie za chwilę.',
    aiNoGpu: 'Ta przeglądarka nie ma WebGPU, więc AI na urządzeniu tu nie działa — wpisane polecenia nadal działają.',
    timeIn: 'W {c} jest {t}.', remindSet: 'Przypomnienie za {n} min', remindNow: 'Czas minął', clearChat: 'wyczyść czat', voiceTip: 'Czytaj odpowiedzi na głos', winTitle: 'Układ okna', winAdd: 'Dodaj do tego okna', analog: 'Analogowy', digital: 'Cyfrowy', timer: 'Minutnik',
    start: 'Start', pause: 'Pauza', resume: 'Wznów', done: 'Gotowe', running: 'działa', paused: 'wstrzymany', minutes: 'Minuty', clear: 'Wyczyść', stopwatch: 'Stoper', reset: 'Resetuj',
    ipTitle: 'Lokalizator IP', ipAddr: 'Adres IP', mac: 'MAC', location: 'Lokalizacja', coords: 'Współrzędne', useTz: 'Użyj tej strefy', macNA: 'ukryte przez przeglądarkę', locating: 'lokalizuję…',
    map: 'Mapa', synced: 'Zsynchronizowano · {src}', corrected: 'Skorygowano · {src}', drift: 'dryft urządzenia {mag} — skorygowano{res}', offLabel: 'Zegar systemowy — brak punktu odniesienia', offDetail: 'bez korekty dryfu', lastCheck: 'ostatnie sprawdzenie {t}', syncing: 'synchronizuję…', secondRes: ' · dokładność do sekundy', checking: 'sprawdzam…',
    nightTitle: 'Przełącz tryb nocny (N)', tzTitle: 'Strefa czasowa', modeTitle: 'Analogowy / cyfrowy (A)', resyncTitle: 'Sprawdź ponownie czas wzorcowy (R)', fullTitle: 'Pełny ekran (F)', full: 'Pełny ekran',
    tzSearchPh: 'Szukaj stref czasowych…', tzListAria: 'Strefy czasowe', prevMatch: 'Poprzedni wynik', nextMatch: 'Następny wynik', closeFind: 'Zamknij pasek szukania', scrDocAria: 'Dokument transkrypcji', docTitle: 'Tytuł dokumentu', untitled: 'Dokument bez tytułu',
    smatePh: 'Wpisz polecenie…', smateTip: 'Asystent SMate', smateSend: 'Wyślij', smateOnline: 'Online', smateTyping: 'pisze…', smateUnavailable: 'niedostępny', smateVoice: 'Wprowadzanie głosowe',
    smateHi: 'Cześć, tu SMate. Wypróbuj „timer 5“, „strefa Tajpej“, „otwórz portfel“, „tryb nocny“ lub „help“.',
    smateUnknown: 'Przepraszam, nie zrozumiałem. Wpisz „help“.',
    mHint: 'Dotknij stacji, potem drugiej — tutaj pojawi się cena.', mFrom: 'Z', mTo: 'Do', mFare: 'Opłata', mStations: 'stacji', mTransfers: 'przesiadki', mMin: 'min', mSwap: 'Zamień', mClear: 'Wyczyść', mTRTC: 'Metro w Tajpej', mTY: 'MRT lotniskowe', mKS: 'Metro w Kaohsiungu', mTC: 'Metro w Taichungu',lpMetro: 'Metro',  lpMetroSub: 'Kalkulator opłat', lpWelcomeT: 'Witaj w SinghoLaunch', lpWelcomeS: 'Jeden launchpad: zegar światowy, taryfy metra, portfel, notatki i ustawienia — prywatne, offline i twoje.', lpStart: 'Zacznij', lpWorld: 'Na świecie', lpToday: 'Dziś',
    mCard: 'Karta', mCardTap: 'Przyłóż kartę do tyłu telefonu…', mCardNone: 'Tu nie ma czytnika — skan wymaga telefonu z NFC.', mCardSeen: 'Karta rozpoznana', mCardBal: 'Saldo (NT$)', mCardNote: 'Saldo zostaje na tym urządzeniu; żadna strona nie odczyta go z karty.',
  },
  da: {
    fareXsys: 'forskellige systemer — taksten beregnes inden for ét system',
    wallet: 'Pung', walBalance: 'Saldo', walExpense: 'Udgift', walIncome: 'Indtægt',
    walAmount: 'Beløb', walNote: 'Note', walAdd: 'Tilføj', mAdd: 'Tilføj', mCode: 'Kode', mCodePh: 'din kode…', mLang: 'Sprog', mSetup: 'Forbereder {name} — downloades én gang ved første kørsel', mBusy: 'Kører…', mMs: 'færdig på {ms} ms', mNetErr: '{name} kunne ikke indlæses — tjek internettet', mStopped: 'Stoppet — tog for lang tid', zoomIn: 'Zoom ind', zoomOut: 'Zoom ud', walDays: 'Dage', walReports: 'Rapporter', walCash: 'Kontanter', lpModule:'Modul',lpModuleSub:'Visuel automatisering i n8n-stil',flFiles:'Filer',flNew:'Ny',flOpen:'Åbn',flRename:'Omdøb',flDuplicate:'Duplikér',flDelete:'Slet',flExport:'Eksportér',flImport:'Importér',flUpdated:'Redigeret',flEmpty:'Endnu ingen dokumenter',flSearch:'Søg',flConfirm:'Slet for altid?',flUntitledNote:'Notat uden titel',flUntitledFlow:'Flow uden titel',mRun:'Kør',mGrid:'Gitter',mText:'Tekst',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'teksten din kode læser…', mFeedHint:'programmet venter på input — skriv det i I/O-knuden og kør igen',mResult:'Resultat',encPlain:'Almindelig',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'HTML-entiteter',encRot:'ROT13',
    walSpent: 'Brugt', walMonth: 'Denne måned', walAvg: 'Dagsgennemsnit', walWeek: 'Seneste 7 dage',
    walTop: 'Største udgift', pDay: 'Dag', pWeek: 'Uge', pMonth: 'Måned', pSem: 'Semester', pYear: 'År', pDec: 'Årti', walNet: 'Netto', walEmpty: 'Ingen transaktioner endnu', walCurrency: 'Valutasymbol', walDelete: 'Slet post', walCurSearch: 'Søg valutaer…', launchpad: 'Launchpad', lpClock: 'Ur', lpClockSub: 'Drift-korrigeret verdensur', lpWalletSub: 'Saldo, dagligt forbrug & rapporter',
    date: 'Dato', time: 'Tid', window: 'Vindue', light: 'Lys', night: 'Nattilstand',
    resync: 'Synkronisér igen', search: 'Søg by eller land…', signin: 'Log ind', signout: 'Log ud',
    account: 'Konto', settings: 'Indstillinger', appearance: 'Udseende', homeCity: 'Urets by', currency: 'Valuta', data: 'Data', resetData: 'Nulstil lokale data',
    resetQ: 'Ryd sprog, tema, by, valuta og konto-snapshots på denne enhed? Pungens transaktioner bevares.',
    portalNote: 'Log ind, og sprog, tema, by, valuta og pung følger din Google-konto på alle enheder.',
    lpSettingsSub: 'Sprog, tema, by & valuta',
    scribeIn: 'Talesprog', scribeOut: 'Transskriptionssprog', scribeStart: 'Start', scribeStop: 'Stop', scribeListening: 'Lytter',
    scribeClear: 'Ryd', scribeCopy: 'Kopiér', scribeDownload: 'Download', scribeSaved: 'Alle ændringer gemt', scribeSaving: 'Gemmer…', scribeWords: 'ord',
    scribeHint: 'Tryk Start og tal — transskriptionen vises her og kan stadig redigeres.',
    scribeNo: 'Talegenkendelse understøttes ikke i denne browser.',
    scribeUndo: 'Fortryd', scribeRedo: 'Annullér fortryd', scribeFind: 'Find', scribeReplace: 'Erstat', scribeReplaceAll: 'Erstat alle', scribePrint: 'Udskriv', scribeImport: 'Importér tekstfil', scribeStamps: 'Tidsstempler', scribeChars: 'tegn', scribeNoHits: 'Ingen træffere',
    lpScribeSub: 'Live-transskription af forelæsninger', lpScribe: 'Scribe', language: 'Sprog', local: 'Lokal', addZone: 'Tilføj zone', single: 'Enkelt', side: 'Side om side', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Ryd alt', aiTip: 'AI på enheden (WebGPU) til løse kommandoer og lette spørgsmål',
    aiLoad: 'AI’en vågner — modellen på enheden downloades én gang ved første brug. Spørg igen om et øjeblik.',
    aiNoGpu: 'Denne browser har ingen WebGPU, så AI’en på enheden kan ikke køre her — alle kommandoer virker stadig, når de tastes.',
    timeIn: 'Klokken er {t} i {c}.', remindSet: 'Påmindelse om {n} min.', remindNow: 'Tiden er gået', clearChat: 'ryd chat', voiceTip: 'Læs svar højt', winTitle: 'Vindueslayout', winAdd: 'Føj til dette vindue', analog: 'Analog', digital: 'Digital', timer: 'Timer',
    start: 'Start', pause: 'Pause', resume: 'Genoptag', done: 'Færdig', running: 'kører', paused: 'sat på pause', minutes: 'Minutter', clear: 'Ryd', stopwatch: 'Stopur', reset: 'Nulstil',
    ipTitle: 'IP-lokalisering', ipAddr: 'IP-adresse', mac: 'MAC', location: 'Placering', coords: 'Koordinater', useTz: 'Brug denne tidszone', macNA: 'skjult af browseren', locating: 'lokaliserer…',
    map: 'Kort', synced: 'Synkroniseret · {src}', corrected: 'Korrigeret · {src}', drift: 'enhedsdrift {mag} — korrigeret{res}', offLabel: 'Systemur — reference utilgængelig', offDetail: 'ingen driftkorrektion anvendt', lastCheck: 'seneste tjek {t}', syncing: 'synkroniserer…', secondRes: ' · sekundopløsning', checking: 'tjekker…',
    nightTitle: 'Slå nattilstand til/fra (N)', tzTitle: 'Tidszone', modeTitle: 'Analog / digital (A)', resyncTitle: 'Tjek referencetiden igen (R)', fullTitle: 'Fuld skærm (F)', full: 'Fuld skærm',
    tzSearchPh: 'Søg tidszoner…', tzListAria: 'Tidszoner', prevMatch: 'Forrige træffer', nextMatch: 'Næste træffer', closeFind: 'Luk søgelinjen', scrDocAria: 'Transskriptionsdokument', docTitle: 'Dokumenttitel', untitled: 'Unavngivet dokument',
    smatePh: 'Skriv en kommando…', smateTip: 'SMate-assistent', smateSend: 'Send', smateOnline: 'Online', smateTyping: 'skriver…', smateUnavailable: 'utilgængelig', smateVoice: 'Stemmeinput',
    smateHi: 'Hej, jeg er SMate. Prøv “timer 5”, “zone Taipei”, “åbn pung”, “nattilstand” eller “help”.',
    smateUnknown: 'Beklager, jeg forstod det ikke. Skriv “help”.',
    mHint: 'Tryk på en station og så en anden — prisen vises her.', mFrom: 'Fra', mTo: 'Til', mFare: 'Pris', mStations: 'stationer', mTransfers: 'skift', mMin: 'min.', mSwap: 'Byt', mClear: 'Ryd', mTRTC: 'Taipei Metro', mTY: 'Lufthavns-MRT', mKS: 'Kaohsiung Metro', mTC: 'Taichung Metro',lpMetro: 'Metro',  lpMetroSub: 'Takstberegner', lpWelcomeT: 'Velkommen til SinghoLaunch', lpWelcomeS: 'Én launchpad til verdensur, metropriser, pung, noter og indstillinger — privat, offline og din.', lpStart: 'Kom i gang', lpWorld: 'Verden rundt', lpToday: 'I dag',
    mCard: 'Kort', mCardTap: 'Hold kortet mod bagsiden af telefonen…', mCardNone: 'Ingen læser her — scanning kræver en telefon med NFC.', mCardSeen: 'Kort genkendt', mCardBal: 'Saldo (NT$)', mCardNote: 'Saldoen bor kun på denne enhed; ingen hjemmeside kan læse den fra kortet.',
  },
  nb: {
    fareXsys: 'forskjellige systemer — prisen beregnes innen ett system',
    wallet: 'Lommebok', walBalance: 'Saldo', walExpense: 'Utgift', walIncome: 'Inntekt',
    walAmount: 'Beløp', walNote: 'Notat', walAdd: 'Legg til', mAdd: 'Legg til', mCode: 'Kode', mCodePh: 'koden din…', mLang: 'Språk', mSetup: 'Forbereder {name} — lastes ned én gang første gang', mBusy: 'Kjører…', mMs: 'ferdig på {ms} ms', mNetErr: 'Kunne ikke laste {name} — sjekk internettet', mStopped: 'Stoppet — tok for lang tid', zoomIn: 'Zoom inn', zoomOut: 'Zoom ut', walDays: 'Dager', walReports: 'Rapporter', walCash: 'Kontanter', lpModule:'Modul',lpModuleSub:'Visuell automatisering i n8n-stil',flFiles:'Filer',flNew:'Ny',flOpen:'Åpne',flRename:'Gi nytt navn',flDuplicate:'Dupliser',flDelete:'Slett',flExport:'Eksporter',flImport:'Importer',flUpdated:'Redigert',flEmpty:'Ingen dokumenter ennå',flSearch:'Søk',flConfirm:'Slette for godt?',flUntitledNote:'Notat uten tittel',flUntitledFlow:'Flyt uten tittel',mRun:'Kjør',mGrid:'Rutenett',mText:'Tekst',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'teksten koden din leser…', mFeedHint:'programmet venter på inndata — skriv det inn i I/O-noden og kjør igjen',mResult:'Resultat',encPlain:'Vanlig',encB64:'Base64',encUrl:'URL',encHex:'Heks',encUni:'Unicode',encEnt:'HTML-entiteter',encRot:'ROT13',
    walSpent: 'Brukt', walMonth: 'Denne måneden', walAvg: 'Dagsgjennomsnitt', walWeek: 'Siste 7 dager',
    walTop: 'Største utgift', pDay: 'Dag', pWeek: 'Uke', pMonth: 'Måned', pSem: 'Semester', pYear: 'År', pDec: 'Tiår', walNet: 'Netto', walEmpty: 'Ingen transaksjoner ennå', walCurrency: 'Valutasymbol', walDelete: 'Slett oppføring', walCurSearch: 'Søk valutaer…', launchpad: 'Launchpad', lpClock: 'Klokke', lpClockSub: 'Driftskorrigert verdensur', lpWalletSub: 'Saldo, daglig forbruk & rapporter',
    date: 'Dato', time: 'Tid', window: 'Vindu', light: 'Lys', night: 'Nattmodus',
    resync: 'Synkroniser på nytt', search: 'Søk by eller land…', signin: 'Logg inn', signout: 'Logg ut',
    account: 'Konto', settings: 'Innstillinger', appearance: 'Utseende', homeCity: 'Klokkens by', currency: 'Valuta', data: 'Data', resetData: 'Tilbakestill lokale data',
    resetQ: 'Fjerne språk, tema, by, valuta og konto-øyeblikksbilder på denne enheten? Lommeboktransaksjoner beholdes.',
    portalNote: 'Logg inn, så følger språk, tema, by, valuta og lommebok Google-kontoen din på alle enheter.',
    lpSettingsSub: 'Språk, tema, by & valuta',
    scribeIn: 'Talespråk', scribeOut: 'Transkripsjonsspråk', scribeStart: 'Start', scribeStop: 'Stopp', scribeListening: 'Lytter',
    scribeClear: 'Tøm', scribeCopy: 'Kopiér', scribeDownload: 'Last ned', scribeSaved: 'Alle endringer lagret', scribeSaving: 'Lagrer…', scribeWords: 'ord',
    scribeHint: 'Trykk Start og snakk — transkripsjonen vises her og kan fortsatt redigeres.',
    scribeNo: 'Talegjenkjenning støttes ikke i denne nettleseren.',
    scribeUndo: 'Angre', scribeRedo: 'Gjør om', scribeFind: 'Finn', scribeReplace: 'Erstatt', scribeReplaceAll: 'Erstatt alle', scribePrint: 'Skriv ut', scribeImport: 'Importer tekstfil', scribeStamps: 'Tidsstempler', scribeChars: 'tegn', scribeNoHits: 'Ingen treff',
    lpScribeSub: 'Direktetranskripsjon av forelesninger', lpScribe: 'Scribe', language: 'Språk', local: 'Lokal', addZone: 'Legg til sone', single: 'Enkelt', side: 'Side om side', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Tøm alt', aiTip: 'AI på enheten (WebGPU) for løse kommandoer og lette spørsmål',
    aiLoad: 'AI-en våkner — modellen på enheten lastes ned én gang ved første bruk. Spør igjen om et øyeblikk.',
    aiNoGpu: 'Denne nettleseren har ingen WebGPU, så AI-en på enheten kan ikke kjøre her — alle kommandoer fungerer fortsatt når de tastes.',
    timeIn: 'Klokken er {t} i {c}.', remindSet: 'Påminnelse om {n} min', remindNow: 'Tiden er ute', clearChat: 'tøm chat', voiceTip: 'Les svar høyt', winTitle: 'Vindusutforming', winAdd: 'Legg til i dette vinduet', analog: 'Analog', digital: 'Digital', timer: 'Nedtelling',
    start: 'Start', pause: 'Pause', resume: 'Fortsett', done: 'Ferdig', running: 'kjører', paused: 'satt på pause', minutes: 'Minutter', clear: 'Tøm', stopwatch: 'Stoppeklokke', reset: 'Tilbakestill',
    ipTitle: 'IP-lokalisering', ipAddr: 'IP-adresse', mac: 'MAC', location: 'Sted', coords: 'Koordinater', useTz: 'Bruk denne tidssonen', macNA: 'skjult av nettleseren', locating: 'lokaliserer…',
    map: 'Kart', synced: 'Synkronisert · {src}', corrected: 'Korrigert · {src}', drift: 'enhetsdrift {mag} — korrigert{res}', offLabel: 'Systemklokke — referanse utilgjengelig', offDetail: 'ingen driftskorreksjon brukt', lastCheck: 'siste sjekk {t}', syncing: 'synkroniserer…', secondRes: ' · sekundoppløsning', checking: 'sjekker…',
    nightTitle: 'Slå nattmodus av/på (N)', tzTitle: 'Tidssone', modeTitle: 'Analog / digital (A)', resyncTitle: 'Sjekk referansetiden igjen (R)', fullTitle: 'Fullskjerm (F)', full: 'Fullskjerm',
    tzSearchPh: 'Søk tidssoner…', tzListAria: 'Tidssoner', prevMatch: 'Forrige treff', nextMatch: 'Neste treff', closeFind: 'Lukk søkelinjen', scrDocAria: 'Transkripsjonsdokument', docTitle: 'Dokumenttittel', untitled: 'Dokument uten navn',
    smatePh: 'Skriv en kommando…', smateTip: 'SMate-assistent', smateSend: 'Send', smateOnline: 'Pålogget', smateTyping: 'skriver…', smateUnavailable: 'utilgjengelig', smateVoice: 'Taleinndata',
    smateHi: 'Hei, jeg er SMate. Prøv «timer 5», «sone Taipei», «åpne lommebok», «nattmodus» eller «help».',
    smateUnknown: 'Beklager, jeg forsto ikke. Skriv «help».',
    mHint: 'Trykk på en stasjon og så en annen — prisen vises her.', mFrom: 'Fra', mTo: 'Til', mFare: 'Pris', mStations: 'stasjoner', mTransfers: 'bytter', mMin: 'min', mSwap: 'Bytt', mClear: 'Tøm', mTRTC: 'Taipei-metroen', mTY: 'Flyplass-MRT', mKS: 'Kaohsiung-metroen', mTC: 'Taichung-metroen',lpMetro: 'Metro',  lpMetroSub: 'Priskalkulator', lpWelcomeT: 'Velkommen til SinghoLaunch', lpWelcomeS: 'Én launchpad for verdensur, metropriser, lommebok, notater og innstillinger — privat, frakoblet og ditt.', lpStart: 'Kom i gang', lpWorld: 'Verden rundt', lpToday: 'I dag',
    mCard: 'Kort', mCardTap: 'Hold kortet mot baksiden av telefonen…', mCardNone: 'Ingen leser her — skanning krever en telefon med NFC.', mCardSeen: 'Kort gjenkjent', mCardBal: 'Saldo (NT$)', mCardNote: 'Saldoen bor bare på denne enheten; nettsteder kan ikke lese den fra kortet.',
  },
  sv: {
    fareXsys: 'olika system — priset beräknas inom ett system',
    wallet: 'Plånbok', walBalance: 'Saldo', walExpense: 'Utgift', walIncome: 'Inkomst',
    walAmount: 'Belopp', walNote: 'Anteckning', walAdd: 'Lägg till', mAdd: 'Lägg till', mCode: 'Kod', mCodePh: 'din kod…', mLang: 'Språk', mSetup: 'Förbereder {name} — laddas ner en gång första gången', mBusy: 'Kör…', mMs: 'klar på {ms} ms', mNetErr: 'Kunde inte ladda {name} — kontrollera internet', mStopped: 'Stoppad — tog för lång tid', zoomIn: 'Zooma in', zoomOut: 'Zooma ut', walDays: 'Dagar', walReports: 'Rapporter', walCash: 'Kontanter', lpModule:'Modul',lpModuleSub:'Visuell automatisering i n8n-stil',flFiles:'Filer',flNew:'Ny',flOpen:'Öppna',flRename:'Byt namn',flDuplicate:'Duplicera',flDelete:'Radera',flExport:'Exportera',flImport:'Importera',flUpdated:'Redigerad',flEmpty:'Inga dokument än',flSearch:'Sök',flConfirm:'Radera permanent?',flUntitledNote:'Anteckning utan titel',flUntitledFlow:'Flöde utan titel',mRun:'Kör',mGrid:'Rutnät',mText:'Text',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'texten din kod läser…', mFeedHint:'programmet väntar på inmatning — skriv den i I/O-noden och kör igen',mResult:'Resultat',encPlain:'Vanlig',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'HTML-entiteter',encRot:'ROT13',
    walSpent: 'Spenderat', walMonth: 'Denna månad', walAvg: 'Dagsgenomsnitt', walWeek: 'Senaste 7 dagarna',
    walTop: 'Största utgift', pDay: 'Dag', pWeek: 'Vecka', pMonth: 'Månad', pSem: 'Termin', pYear: 'År', pDec: 'Årtionde', walNet: 'Netto', walEmpty: 'Inga transaktioner ännu', walCurrency: 'Valutasymbol', walDelete: 'Ta bort post', walCurSearch: 'Sök valutor…', launchpad: 'Launchpad', lpClock: 'Klocka', lpClockSub: 'Driftkorrigerad världsklocka', lpWalletSub: 'Saldo, dagsutgifter & rapporter',
    date: 'Datum', time: 'Tid', window: 'Fönster', light: 'Ljus', night: 'Nattläge',
    resync: 'Synkronisera igen', search: 'Sök stad eller land…', signin: 'Logga in', signout: 'Logga ut',
    account: 'Konto', settings: 'Inställningar', appearance: 'Utseende', homeCity: 'Klockans stad', currency: 'Valuta', data: 'Data', resetData: 'Återställ lokala data',
    resetQ: 'Rensa språk, tema, stad, valuta och kontoögonblicksbilder på den här enheten? Plånbokstransaktioner behålls.',
    portalNote: 'Logga in så följer språk, tema, stad, valuta och plånbok ditt Google-konto på alla enheter.',
    lpSettingsSub: 'Språk, tema, stad & valuta',
    scribeIn: 'Talspråk', scribeOut: 'Transkriptionsspråk', scribeStart: 'Starta', scribeStop: 'Stoppa', scribeListening: 'Lyssnar',
    scribeClear: 'Rensa', scribeCopy: 'Kopiera', scribeDownload: 'Ladda ner', scribeSaved: 'Alla ändringar sparade', scribeSaving: 'Sparar…', scribeWords: 'ord',
    scribeHint: 'Tryck Starta och prata — transkriptionen visas här och kan fortfarande redigeras.',
    scribeNo: 'Taligenkänning stöds inte i den här webbläsaren.',
    scribeUndo: 'Ångra', scribeRedo: 'Gör om', scribeFind: 'Sök', scribeReplace: 'Ersätt', scribeReplaceAll: 'Ersätt alla', scribePrint: 'Skriv ut', scribeImport: 'Importera textfil', scribeStamps: 'Tidsstämplar', scribeChars: 'tecken', scribeNoHits: 'Inga träffar',
    lpScribeSub: 'Direkttranskription av föreläsningar', lpScribe: 'Scribe', language: 'Språk', local: 'Lokal', addZone: 'Lägg till zon', single: 'Enkel', side: 'Bredvid varandra', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Rensa allt', aiTip: 'AI på enheten (WebGPU) för fria kommandon och lätta frågor',
    aiLoad: 'AI:n vaknar — modellen på enheten laddas ner en gång vid första användningen. Fråga igen om en stund.',
    aiNoGpu: 'Den här webbläsaren har ingen WebGPU, så AI:n på enheten kan inte köras här — alla kommandon fungerar fortfarande när de skrivs.',
    timeIn: 'Klockan är {t} i {c}.', remindSet: 'Påminnelse om {n} min', remindNow: 'Tiden är ute', clearChat: 'rensa chatten', voiceTip: 'Läs upp svar', winTitle: 'Fönsterlayout', winAdd: 'Lägg till i detta fönster', analog: 'Analog', digital: 'Digital', timer: 'Timer',
    start: 'Starta', pause: 'Pausa', resume: 'Återuppta', done: 'Klart', running: 'körs', paused: 'pausad', minutes: 'Minuter', clear: 'Rensa', stopwatch: 'Stoppur', reset: 'Återställ',
    ipTitle: 'IP-lokalisering', ipAddr: 'IP-adress', mac: 'MAC', location: 'Plats', coords: 'Koordinater', useTz: 'Använd denna tidszon', macNA: 'dold av webbläsaren', locating: 'lokaliserar…',
    map: 'Karta', synced: 'Synkroniserad · {src}', corrected: 'Korrigerad · {src}', drift: 'enhetsdrift {mag} — korrigerad{res}', offLabel: 'Systemklocka — referens saknas', offDetail: 'ingen driftkorrigering tillämpad', lastCheck: 'senaste kontroll {t}', syncing: 'synkroniserar…', secondRes: ' · sekundupplösning', checking: 'kontrollerar…',
    nightTitle: 'Växla nattläge (N)', tzTitle: 'Tidszon', modeTitle: 'Analog / digital (A)', resyncTitle: 'Kontrollera referenstiden igen (R)', fullTitle: 'Helskärm (F)', full: 'Helskärm',
    tzSearchPh: 'Sök tidszoner…', tzListAria: 'Tidszoner', prevMatch: 'Föregående träff', nextMatch: 'Nästa träff', closeFind: 'Stäng sökfältet', scrDocAria: 'Transkriptionsdokument', docTitle: 'Dokumenttitel', untitled: 'Namnlöst dokument',
    smatePh: 'Skriv ett kommando…', smateTip: 'SMate-assistent', smateSend: 'Skicka', smateOnline: 'Online', smateTyping: 'skriver…', smateUnavailable: 'inte tillgänglig', smateVoice: 'Röstinput',
    smateHi: 'Hej, jag är SMate. Prova ”timer 5”, ”zon Taipei”, ”öppna plånbok”, ”nattläge” eller ”help”.',
    smateUnknown: 'Ursäkta, jag fattade inte. Skriv ”help”.',
    mHint: 'Tryck på en station och sedan en annan — priset visas här.', mFrom: 'Från', mTo: 'Till', mFare: 'Pris', mStations: 'stationer', mTransfers: 'byten', mMin: 'min', mSwap: 'Byt', mClear: 'Rensa', mTRTC: 'Taipeis tunnelbana', mTY: 'Flygplats-MRT', mKS: 'Kaohsiungs tunnelbana', mTC: 'Taichungs tunnelbana',lpMetro: 'Metro',  lpMetroSub: 'Priskalkyl', lpWelcomeT: 'Välkommen till SinghoLaunch', lpWelcomeS: 'En launchpad för världsklocka, metropriser, plånbok, anteckningar och inställningar — privat, offline och ditt.', lpStart: 'Kom igång', lpWorld: 'Runt om i världen', lpToday: 'I dag',
    mCard: 'Kort', mCardTap: 'Håll kortet mot baksidan av telefonen…', mCardNone: 'Ingen läsare här — skanning kräver en telefon med NFC.', mCardSeen: 'Kortet kännt igen', mCardBal: 'Saldo (NT$)', mCardNote: 'Saldot bor bara på den här enheten; ingen webbplats kan läsa det från kortet.',
  },
  fi: {
    fareXsys: 'eri järjestelmät — hinta lasketaan saman järjestelmän sisällä',
    wallet: 'Lompakko', walBalance: 'Saldo', walExpense: 'Meno', walIncome: 'Tulo',
    walAmount: 'Summa', walNote: 'Muistiinpano', walAdd: 'Lisää', mAdd: 'Lisää', mCode: 'Koodi', mCodePh: 'koodisi…', mLang: 'Kieli', mSetup: 'Valmistellaan {name} — ladataan kerran ensimmäisellä kerralla', mBusy: 'Suoritetaan…', mMs: 'valmis {ms} ms:ssa', mNetErr: '{name} ei latautunut — tarkista internetyhteys', mStopped: 'Pysäytetty — kesti liian kauan', zoomIn: 'Lähennä', zoomOut: 'Loitonna', walDays: 'Päivät', walReports: 'Raportit', walCash: 'Käteinen', lpModule:'Moduuli',lpModuleSub:'Visuaalinen automatisointi n8n-tyyliin',flFiles:'Tiedostot',flNew:'Uusi',flOpen:'Avaa',flRename:'Nimeä uudelleen',flDuplicate:'Monista',flDelete:'Poista',flExport:'Vie',flImport:'Tuo',flUpdated:'Muokattu',flEmpty:'Ei vielä dokumentteja',flSearch:'Hae',flConfirm:'Poista lopullisesti?',flUntitledNote:'Nimeämätön muistiinpano',flUntitledFlow:'Nimeämätön virtaus',mRun:'Suorita',mGrid:'Ruudukko',mText:'Teksti',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'teksti, jonka koodisi lukee…', mFeedHint:'ohjelma odottaa syötettä — kirjoita se I/O-solmuun ja aja uudelleen',mResult:'Tulos',encPlain:'Tavallinen',encB64:'Base64',encUrl:'URL',encHex:'Heksa',encUni:'Unicode',encEnt:'HTML-entiteetit',encRot:'ROT13',
    walSpent: 'Käytetty', walMonth: 'Tämä kuukausi', walAvg: 'Päiväkeskiarvo', walWeek: 'Viimeiset 7 päivää',
    walTop: 'Suurin meno', pDay: 'Päivä', pWeek: 'Viikko', pMonth: 'Kuukausi', pSem: 'Lukukausi', pYear: 'Vuosi', pDec: 'Vuosikymmen', walNet: 'Netto', walEmpty: 'Ei vielä tapahtumia', walCurrency: 'Valuutan symboli', walDelete: 'Poista merkintä', walCurSearch: 'Hae valuuttoja…', launchpad: 'Launchpad', lpClock: 'Kello', lpClockSub: 'Ajautumakorjattu maailmankello', lpWalletSub: 'Saldo, päivittäiset menot & raportit',
    date: 'Päivä', time: 'Aika', window: 'Ikkuna', light: 'Vaalea', night: 'Yötila',
    resync: 'Synkronoi uudelleen', search: 'Hae kaupunkia tai maata…', signin: 'Kirjaudu sisään', signout: 'Kirjaudu ulos',
    account: 'Tili', settings: 'Asetukset', appearance: 'Ulkoasu', homeCity: 'Kellon kaupunki', currency: 'Valuutta', data: 'Tiedot', resetData: 'Nollaa paikalliset tiedot',
    resetQ: 'Tyhjennä kieli, teema, kaupunki, valuutta ja tilin tilannevedokset tältä laitteelta? Lompakon tapahtumat säilyvät.',
    portalNote: 'Kirjaudu, niin kieli, teema, kaupunki, valuutta ja lompakko seuraavat Google-tiliäsi kaikilla laitteilla.',
    lpSettingsSub: 'Kieli, teema, kaupunki & valuutta',
    scribeIn: 'Puheen kieli', scribeOut: 'Transkription kieli', scribeStart: 'Aloita', scribeStop: 'Lopeta', scribeListening: 'Kuuntelee',
    scribeClear: 'Tyhjennä', scribeCopy: 'Kopioi', scribeDownload: 'Lataa', scribeSaved: 'Kaikki muutokset tallennettu', scribeSaving: 'Tallennetaan…', scribeWords: 'sanaa',
    scribeHint: 'Paina Aloita ja puhu — transkriptio ilmestyy tänne ja pysyy muokattavana.',
    scribeNo: 'Tämä selain ei tue puheentunnistusta.',
    scribeUndo: 'Kumoa', scribeRedo: 'Tee uudelleen', scribeFind: 'Etsi', scribeReplace: 'Korvaa', scribeReplaceAll: 'Korvaa kaikki', scribePrint: 'Tulosta', scribeImport: 'Tuo tekstitiedosto', scribeStamps: 'Aikaleimat', scribeChars: 'merkkiä', scribeNoHits: 'Ei osumia',
    lpScribeSub: 'Luentojen reaaliaikainen transkriptio', lpScribe: 'Scribe', language: 'Kieli', local: 'Paikallinen', addZone: 'Lisää aikavyöhyke', single: 'Yksi', side: 'Rinnakkain', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Tyhjennä kaikki', aiTip: 'Laitteen oma tekoäly (WebGPU) vapaille komennoille ja kevyille kysymyksille',
    aiLoad: 'Tekoäly herää — laitteen malli ladataan kerran ensimmäisellä kerralla. Kysy hetken päästä uudelleen.',
    aiNoGpu: 'Tässä selaimessa ei ole WebGPU:ta, joten laitteen tekoäly ei toimi täällä — kaikki komennot toimivat yhä kirjoitettuna.',
    timeIn: 'Kello on {t} kaupungissa {c}.', remindSet: 'Muistutus {n} min kuluttua', remindNow: 'Aika loppui', clearChat: 'tyhjennä keskustelu', voiceTip: 'Lue vastaukset ääneen', winTitle: 'Ikkunan asettelu', winAdd: 'Lisää tähän ikkunaan', analog: 'Analoginen', digital: 'Digitaalinen', timer: 'Ajastin',
    start: 'Aloita', pause: 'Tauko', resume: 'Jatka', done: 'Valmis', running: 'käynnissä', paused: 'tauolla', minutes: 'Minuutit', clear: 'Tyhjennä', stopwatch: 'Sekuntikello', reset: 'Nollaa',
    ipTitle: 'IP-paikannin', ipAddr: 'IP-osoite', mac: 'MAC', location: 'Sijainti', coords: 'Koordinaatit', useTz: 'Käytä tätä aikavyöhykettä', macNA: 'selaimen piilottama', locating: 'paikannetaan…',
    map: 'Kartta', synced: 'Synkronoitu · {src}', corrected: 'Korjattu · {src}', drift: 'laitteen ajautuma {mag} — korjattu{res}', offLabel: 'Järjestelmän kello — vertailu ei saatavilla', offDetail: 'ei ajautumakorjausta', lastCheck: 'viimeisin tarkistus {t}', syncing: 'synkronoidaan…', secondRes: ' · sekunnin tarkkuus', checking: 'tarkistetaan…',
    nightTitle: 'Vaihda yötila (N)', tzTitle: 'Aikavyöhyke', modeTitle: 'Analoginen / digitaalinen (A)', resyncTitle: 'Tarkista vertailuaika uudelleen (R)', fullTitle: 'Koko näyttö (F)', full: 'Koko näyttö',
    tzSearchPh: 'Hae aikavyöhykkeitä…', tzListAria: 'Aikavyöhykkeet', prevMatch: 'Edellinen osuma', nextMatch: 'Seuraava osuma', closeFind: 'Sulje hakupalkki', scrDocAria: 'Transkriptiodokumentti', docTitle: 'Dokumentin otsikko', untitled: 'Nimetön dokumentti',
    smatePh: 'Kirjoita komento…', smateTip: 'SMate-avustaja', smateSend: 'Lähetä', smateOnline: 'Paikalla', smateTyping: 'kirjoittaa…', smateUnavailable: 'ei käytettävissä', smateVoice: 'Puhesyöte',
    smateHi: 'Hei, olen SMate. Kokeile ”ajastin 5”, ”aikavyöhyke Taipei”, ”avaa lompakko”, ”yötila” tai ”help”.',
    smateUnknown: 'Anteeksi, en ymmärtänyt. Kirjoita ”help”.',
    mHint: 'Napauta asemaa ja sitten toista — hinta ilmestyy tähän.', mFrom: 'Mistä', mTo: 'Mihin', mFare: 'Hinta', mStations: 'asemaa', mTransfers: 'vaihdot', mMin: 'min', mSwap: 'Vaihda', mClear: 'Tyhjennä', mTRTC: 'Taipein metro', mTY: 'Lentokenttä-MRT', mKS: 'Kaohsiungin metro', mTC: 'Taichungin metro',lpMetro: 'Metro',  lpMetroSub: 'Hintalaskuri', lpWelcomeT: 'Tervetuloa SinghoLaunchiin', lpWelcomeS: 'Yksi launchpad: maailmankello, metroliput, lompakko, muistiinpanot ja asetukset — yksityinen, offline ja sinun.', lpStart: 'Aloita', lpWorld: 'Ympäri maailman', lpToday: 'Tänään',
    mCard: 'Kortti', mCardTap: 'Pidä korttia puhelimen takana…', mCardNone: 'Täällä ei ole lukijaa — skannaus vaatii puhelimen, jossa on NFC.', mCardSeen: 'Kortti tunnistettu', mCardBal: 'Saldo (NT$)', mCardNote: 'Saldo on vain tällä laitteella; mikään sivusto ei voi lukea sitä kortilta.',
  },
  sr: {
    fareXsys: 'različiti sistemi — tarifa se računa unutar jednog sistema',
    wallet: 'Novčanik', walBalance: 'Stanje', walExpense: 'Trošak', walIncome: 'Prihod',
    walAmount: 'Iznos', walNote: 'Napomena', walAdd: 'Dodaj', mAdd: 'Dodaj', mCode: 'Код', mCodePh: 'ваш код…', mLang: 'Језик', mSetup: 'Припремам {name} — преузима се једном при првом покретању', mBusy: 'Покреће се…', mMs: 'готово за {ms} ms', mNetErr: '{name} се није учитао — проверите интернет', mStopped: 'Заустављено — предуго трајало', zoomIn: 'Увећај', zoomOut: 'Умањи', walDays: 'Dani', walReports: 'Izveštaji', walCash: 'Кеш', lpModule:'Модул',lpModuleSub:'Визуелна аутоматизација у n8n стилу',flFiles:'Датотеке',flNew:'Ново',flOpen:'Отвори',flRename:'Преименуј',flDuplicate:'Дуплирај',flDelete:'Обриши',flExport:'Извези',flImport:'Увези',flUpdated:'Измењено',flEmpty:'Још нема докумената',flSearch:'Претрага',flConfirm:'Трајно обрисати?',flUntitledNote:'Белешка без наслова',flUntitledFlow:'Ток без наслова',mRun:'Покрени',mGrid:'Мрежа',mText:'Текст',mMarkdown:'Маркдаун',mIO:'I/O', mIOPh:'текст који код чита…', mFeedHint:'програм чека унос — укуцајте га у I/O чвор и покрените поново',mResult:'Резултат',encPlain:'Обично',encB64:'Base64',encUrl:'URL',encHex:'Хекс',encUni:'Уникод',encEnt:'HTML ентитети',encRot:'ROT13',
    walSpent: 'Potrošeno', walMonth: 'Ovaj mesec', walAvg: 'Dnevni prosek', walWeek: 'Poslednjih 7 dana',
    walTop: 'Najveći trošak', pDay: 'Dan', pWeek: 'Nedelja', pMonth: 'Mesec', pSem: 'Semestar', pYear: 'Godina', pDec: 'Decenija', walNet: 'Neto', walEmpty: 'Još nema transakcija', walCurrency: 'Simbol valute', walDelete: 'Obriši stavku', walCurSearch: 'Pretraži valute…', launchpad: 'Launchpad', lpClock: 'Sat', lpClockSub: 'Svetski sat sa korekcijom odmaka', lpWalletSub: 'Stanje, dnevna potrošnja i izveštaji',
    date: 'Datum', time: 'Vreme', window: 'Prozor', light: 'Svetla', night: 'Noćni režim',
    resync: 'Sinhronizuj ponovo', search: 'Pretraži grad ili državu…', signin: 'Prijavi se', signout: 'Odjavi se',
    account: 'Nalog', settings: 'Podešavanja', appearance: 'Izgled', homeCity: 'Grad sata', currency: 'Valuta', data: 'Podaci', resetData: 'Resetuj lokalne podatke',
    resetQ: 'Obrisati jezik, temu, grad, valutu i snimke naloga na ovom uređaju? Transakcije novčanika ostaju.',
    portalNote: 'Prijavi se i jezik, tema, grad, valuta i novčanik prate tvoj Google nalog na svim uređajima.',
    lpSettingsSub: 'Jezik, tema, grad i valuta',
    scribeIn: 'Govorni jezik', scribeOut: 'Jezik transkripta', scribeStart: 'Počni', scribeStop: 'Zaustavi', scribeListening: 'Slušam',
    scribeClear: 'Obriši', scribeCopy: 'Kopiraj', scribeDownload: 'Preuzmi', scribeSaved: 'Sve izmene sačuvane', scribeSaving: 'Čuvam…', scribeWords: 'reči',
    scribeHint: 'Pritisni Počni i govori — transkript se pojavljuje ovde i ostaje urediv.',
    scribeNo: 'Prepoznavanje govora nije podržano u ovom pregledaču.',
    scribeUndo: 'Opozovi', scribeRedo: 'Ponovi', scribeFind: 'Pronađi', scribeReplace: 'Zameni', scribeReplaceAll: 'Zameni sve', scribePrint: 'Štampaj', scribeImport: 'Uvezi tekstualnu datoteku', scribeStamps: 'Vremenske oznake', scribeChars: 'znakova', scribeNoHits: 'Nema pogodaka',
    lpScribeSub: 'Transkripcija predavanja uživo', lpScribe: 'Scribe', language: 'Jezik', local: 'Lokalno', addZone: 'Dodaj zonu', single: 'Jedan', side: 'Jedan pored drugog', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Obriši sve', aiTip: 'AI na uređaju (WebGPU) za slobodne komande i laka pitanja',
    aiLoad: 'AI se budi — model na uređaju preuzima se jednom pri prvoj upotrebi. Pitaj ponovo za koji trenutak.',
    aiNoGpu: 'Ovaj pregledač nema WebGPU, pa AI na uređaju ne može da radi ovde — komande i dalje rade kada se unesu.',
    timeIn: 'U {c} je {t}.', remindSet: 'Podsetnik za {n} min', remindNow: 'Vreme je isteklo', clearChat: 'obriši ćaskanje', voiceTip: 'Čitaj odgovore naglas', winTitle: 'Raspored prozora', winAdd: 'Dodaj u ovaj prozor', analog: 'Analogno', digital: 'Digitalno', timer: 'Tajmer',
    start: 'Počni', pause: 'Pauza', resume: 'Nastavi', done: 'Gotovo', running: 'radi', paused: 'pauzirano', minutes: 'Minuti', clear: 'Obriši', stopwatch: 'Štoperica', reset: 'Resetuj',
    ipTitle: 'IP lokator', ipAddr: 'IP adresa', mac: 'MAC', location: 'Lokacija', coords: 'Koordinate', useTz: 'Koristi ovu vremensku zonu', macNA: 'sakriveno od pregledača', locating: 'lociram…',
    map: 'Mapa', synced: 'Sinhronizovano · {src}', corrected: 'Korigovano · {src}', drift: 'odmak uređaja {mag} — korigovano{res}', offLabel: 'Sistemski sat — referenca nedostupna', offDetail: 'bez korekcije odmaka', lastCheck: 'poslednja provera {t}', syncing: 'sinhronizujem…', secondRes: ' · sekundna rezolucija', checking: 'proveravam…',
    nightTitle: 'Uključi/isključi noćni režim (N)', tzTitle: 'Vremenska zona', modeTitle: 'Analogno / digitalno (A)', resyncTitle: 'Ponovo proveri referentno vreme (R)', fullTitle: 'Ceo ekran (F)', full: 'Ceo ekran',
    tzSearchPh: 'Pretraži vremenske zone…', tzListAria: 'Vremenske zone', prevMatch: 'Prethodni pogodak', nextMatch: 'Sledeći pogodak', closeFind: 'Zatvori traku pretrage', scrDocAria: 'Dokument transkripta', docTitle: 'Naslov dokumenta', untitled: 'Dokument bez naslova',
    smatePh: 'Unesi komandu…', smateTip: 'SMate asistent', smateSend: 'Pošalji', smateOnline: 'Na mreži', smateTyping: 'kuca…', smateUnavailable: 'nedostupno', smateVoice: 'Glasovni unos',
    smateHi: 'Zdravo, ja sam SMate. Probaj „tajmer 5“, „zona Tajpej“, „otvori novčanik“, „noćni režim“ ili „help“.',
    smateUnknown: 'Izvini, nisam razumeo. Unesi „help“.',
    mHint: 'Kucni stanicu pa drugu — cena se pojavljuje ovde.', mFrom: 'Od', mTo: 'Do', mFare: 'Cena', mStations: 'stanica', mTransfers: 'presedanja', mMin: 'min', mSwap: 'Zameni', mClear: 'Obriši', mTRTC: 'Tajpej metro', mTY: 'Aerodromski MRT', mKS: 'Kaosjung metro', mTC: 'Taičung metro',lpMetro: 'Metro',  lpMetroSub: 'Kalkulator cene', lpWelcomeT: 'Dobrodošli u SinghoLaunch', lpWelcomeS: 'Jedan launchpad za svetski sat, metro karte, novčanik, beleške i podešavanja — privatno, offline i tvoje.', lpStart: 'Počni', lpWorld: 'Širom sveta', lpToday: 'Danas',
    mCard: 'Kartica', mCardTap: 'Prisloni karticu na poleđinu telefona…', mCardNone: 'Ovde nema čitača — skeniranje traži telefon sa NFC.', mCardSeen: 'Kartica prepoznata', mCardBal: 'Stanje (NT$)', mCardNote: 'Stanje ostaje samo na ovom uređaju; nijedan sajt ne može da ga pročita sa kartice.',
  },
  nl: {
    fareXsys: 'verschillende systemen — tarief geldt binnen één systeem',
    wallet: 'Portemonnee', walBalance: 'Saldo', walExpense: 'Uitgave', walIncome: 'Inkomst',
    walAmount: 'Bedrag', walNote: 'Notitie', walAdd: 'Toevoegen', mAdd: 'Toevoegen', mCode: 'Code', mCodePh: 'jouw code…', mLang: 'Taal', mSetup: '{name} wordt voorbereid — wordt bij de eerste keer eenmalig gedownload', mBusy: 'Uitvoeren…', mMs: 'klaar in {ms} ms', mNetErr: '{name} kon niet laden — controleer internet', mStopped: 'Gestopt — duurde te lang', zoomIn: 'Inzoomen', zoomOut: 'Uitzoomen', walDays: 'Dagen', walReports: 'Rapporten', walCash: 'Contant', lpModule:'Module',lpModuleSub:'Visuele automatisering in n8n-stijl',flFiles:'Bestanden',flNew:'Nieuw',flOpen:'Openen',flRename:'Naam wijzigen',flDuplicate:'Dupliceren',flDelete:'Verwijderen',flExport:'Exporteren',flImport:'Importeren',flUpdated:'Bewerkt',flEmpty:'Nog geen documenten',flSearch:'Zoeken',flConfirm:'Definitief verwijderen?',flUntitledNote:'Naamloze notitie',flUntitledFlow:'Naamloze flow',mRun:'Uitvoeren',mGrid:'Raster',mText:'Tekst',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'de tekst die je code leest…', mFeedHint:'het programma wacht op invoer — typ deze in het I/O-knooppunt en voer opnieuw uit',mResult:'Resultaat',encPlain:'Gewoon',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'HTML-entiteiten',encRot:'ROT13',
    walSpent: 'Uitgegeven', walMonth: 'Deze maand', walAvg: 'Daggemiddelde', walWeek: 'Laatste 7 dagen',
    walTop: 'Grootste uitgave', pDay: 'Dag', pWeek: 'Week', pMonth: 'Maand', pSem: 'Semester', pYear: 'Jaar', pDec: 'Decennium', walNet: 'Netto', walEmpty: 'Nog geen transacties', walCurrency: 'Valutasymbool', walDelete: 'Item verwijderen', walCurSearch: 'Valuta’s zoeken…', launchpad: 'Launchpad', lpClock: 'Klok', lpClockSub: 'Drift-gecorrigeerde wereldklok', lpWalletSub: 'Saldo, daguitgaven & rapporten',
    date: 'Datum', time: 'Tijd', window: 'Venster', light: 'Licht', night: 'Nachtmodus',
    resync: 'Opnieuw synchroniseren', search: 'Zoek stad of land…', signin: 'Inloggen', signout: 'Uitloggen',
    account: 'Account', settings: 'Instellingen', appearance: 'Uiterlijk', homeCity: 'Klokstad', currency: 'Valuta', data: 'Gegevens', resetData: 'Lokale gegevens resetten',
    resetQ: 'Taal, thema, stad, valuta en accountmomentopnamen op dit apparaat wissen? Portemonnee-transacties blijven bewaard.',
    portalNote: 'Log in en taal, thema, stad, valuta en portemonnee volgen je Google-account op elk apparaat.',
    lpSettingsSub: 'Taal, thema, stad & valuta',
    scribeIn: 'Spreektaal', scribeOut: 'Transcripttaal', scribeStart: 'Start', scribeStop: 'Stop', scribeListening: 'Luistert',
    scribeClear: 'Wissen', scribeCopy: 'Kopiëren', scribeDownload: 'Downloaden', scribeSaved: 'Alle wijzigingen opgeslagen', scribeSaving: 'Opslaan…', scribeWords: 'woorden',
    scribeHint: 'Druk op Start en spreek — het transcript verschijnt hier en blijft bewerkbaar.',
    scribeNo: 'Spraakherkenning wordt niet ondersteund in deze browser.',
    scribeUndo: 'Ongedaan maken', scribeRedo: 'Opnieuw uitvoeren', scribeFind: 'Zoeken', scribeReplace: 'Vervangen', scribeReplaceAll: 'Alles vervangen', scribePrint: 'Afdrukken', scribeImport: 'Tekstbestand importeren', scribeStamps: 'Tijdstempels', scribeChars: 'tekens', scribeNoHits: 'Geen treffers',
    lpScribeSub: 'Live transcriptie van colleges', lpScribe: 'Scribe', language: 'Taal', local: 'Lokaal', addZone: 'Zone toevoegen', single: 'Enkel', side: 'Naast elkaar', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Alles wissen', aiTip: 'AI op het apparaat (WebGPU) voor vrije commando’s en lichte vragen',
    aiLoad: 'De AI wordt wakker — het model op het apparaat wordt één keer gedownload bij eerste gebruik. Vraag het zo opnieuw.',
    aiNoGpu: 'Deze browser heeft geen WebGPU, dus de AI op het apparaat kan hier niet draaien — getypte commando’s werken gewoon.',
    timeIn: 'Het is {t} in {c}.', remindSet: 'Herinnering over {n} min', remindNow: 'Tijd is om', clearChat: 'chat wissen', voiceTip: 'Lees antwoorden voor', winTitle: 'Vensterindeling', winAdd: 'Aan dit venster toevoegen', analog: 'Analoog', digital: 'Digitaal', timer: 'Timer',
    start: 'Start', pause: 'Pauze', resume: 'Hervatten', done: 'Klaar', running: 'actief', paused: 'gepauzeerd', minutes: 'Minuten', clear: 'Wissen', stopwatch: 'Stopwatch', reset: 'Resetten',
    ipTitle: 'IP-locator', ipAddr: 'IP-adres', mac: 'MAC', location: 'Locatie', coords: 'Coördinaten', useTz: 'Deze tijdzone gebruiken', macNA: 'verborgen door de browser', locating: 'lokaliseren…',
    map: 'Kaart', synced: 'Gesynchroniseerd · {src}', corrected: 'Gecorrigeerd · {src}', drift: 'apparaatdrift {mag} — gecorrigeerd{res}', offLabel: 'Systeemklok — referentie niet beschikbaar', offDetail: 'geen driftcorrectie toegepast', lastCheck: 'laatste check {t}', syncing: 'synchroniseren…', secondRes: ' · seconde-resolutie', checking: 'controleren…',
    nightTitle: 'Nachtmodus aan/uit (N)', tzTitle: 'Tijdzone', modeTitle: 'Analoog / digitaal (A)', resyncTitle: 'Referentietijd opnieuw controleren (R)', fullTitle: 'Volledig scherm (F)', full: 'Volledig scherm',
    tzSearchPh: 'Tijdzones zoeken…', tzListAria: 'Tijdzones', prevMatch: 'Vorige treffer', nextMatch: 'Volgende treffer', closeFind: 'Zoekbalk sluiten', scrDocAria: 'Transcriptdocument', docTitle: 'Documenttitel', untitled: 'Naamloos document',
    smatePh: 'Typ een commando…', smateTip: 'SMate-assistent', smateSend: 'Verzenden', smateOnline: 'Online', smateTyping: 'typt…', smateUnavailable: 'niet beschikbaar', smateVoice: 'Spraakinvoer',
    smateHi: 'Hoi, ik ben SMate. Probeer “timer 5”, “zone Taipei”, “open portemonnee”, “nachtmodus” of “help”.',
    smateUnknown: 'Sorry, dat begreep ik niet. Typ “help”.',
    mHint: 'Tik op een station en dan op een ander — de prijs verschijnt hier.', mFrom: 'Van', mTo: 'Naar', mFare: 'Prijs', mStations: 'stations', mTransfers: 'overstappen', mMin: 'min', mSwap: 'Wissel', mClear: 'Wissen', mTRTC: 'Taipei-metro', mTY: 'Luchthaven-MRT', mKS: 'Kaohsiung-metro', mTC: 'Taichung-metro',lpMetro: 'Metro',  lpMetroSub: 'Tarievencalculator', lpWelcomeT: 'Welkom bij SinghoLaunch', lpWelcomeS: 'Eén launchpad voor wereldklok, metrotarieven, portemonnee, notities en instellingen — privé, offline en van jou.', lpStart: 'Aan de slag', lpWorld: 'De wereld rond', lpToday: 'Vandaag',
    mCard: 'Kaart', mCardTap: 'Houd de kaart tegen de achterkant van de telefoon…', mCardNone: 'Hier is geen lezer — scannen kan alleen op een telefoon met NFC.', mCardSeen: 'Kaart herkend', mCardBal: 'Saldo (NT$)', mCardNote: 'Het saldo blijft op dit toestel; geen website kan het van de kaart lezen.',
  },
  'nl-BE': {
    fareXsys: 'verschillende systemen — tarief geldt binnen één systeem',
    wallet: 'Portemonnee', walBalance: 'Saldo', walExpense: 'Uitgave', walIncome: 'Inkomst',
    walAmount: 'Bedrag', walNote: 'Notitie', walAdd: 'Toevoegen', mAdd: 'Toevoegen', mCode: 'Code', mCodePh: 'jou code…', mLang: 'Taal', mSetup: '{name} wordt voorbereid — wordt bij de eerste keer één keer gedownload', mBusy: 'Uitvoeren…', mMs: 'klaar in {ms} ms', mNetErr: '{name} kon niet laden — controleer internet', mStopped: 'Gestopt — duurde te lang', zoomIn: 'Inzoomen', zoomOut: 'Uitzoomen', walDays: 'Dagen', walReports: 'Rapporten', walCash: 'Contant', lpModule:'Module',lpModuleSub:'Visuele automatisering in n8n-stijl',flFiles:'Bestanden',flNew:'Nieuw',flOpen:'Openen',flRename:'Naam wijzigen',flDuplicate:'Dupliceren',flDelete:'Verwijderen',flExport:'Exporteren',flImport:'Importeren',flUpdated:'Bewerkt',flEmpty:'Nog geen documenten',flSearch:'Zoeken',flConfirm:'Definitief verwijderen?',flUntitledNote:'Naamloze notitie',flUntitledFlow:'Naamloze flow',mRun:'Uitvoeren',mGrid:'Raster',mText:'Tekst',mMarkdown:'Markdown',mIO:'I/O', mIOPh:'de tekst die je code leest…', mFeedHint:'het programma wacht op invoer — typ ze in het I/O-knooppunt en voer opnieuw uit',mResult:'Resultaat',encPlain:'Gewoon',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'HTML-entiteiten',encRot:'ROT13',
    walSpent: 'Uitgegeven', walMonth: 'Deze maand', walAvg: 'Daggemiddelde', walWeek: 'Laatste 7 dagen',
    walTop: 'Grootste uitgave', pDay: 'Dag', pWeek: 'Week', pMonth: 'Maand', pSem: 'Semester', pYear: 'Jaar', pDec: 'Decennium', walNet: 'Netto', walEmpty: 'Nog geen transacties', walCurrency: 'Valutasymbool', walDelete: 'Item verwijderen', walCurSearch: 'Valuta’s zoeken…', launchpad: 'Launchpad', lpClock: 'Klok', lpClockSub: 'Drift-gecorrigeerde wereldklok', lpWalletSub: 'Saldo, daguitgaven & rapporten',
    date: 'Datum', time: 'Tijd', window: 'Venster', light: 'Licht', night: 'Nachtmodus',
    resync: 'Opnieuw synchroniseren', search: 'Zoek stad of land…', signin: 'Aanmelden', signout: 'Afmelden',
    account: 'Account', settings: 'Instellingen', appearance: 'Uiterlijk', homeCity: 'Klokstad', currency: 'Valuta', data: 'Gegevens', resetData: 'Lokale gegevens opnieuw instellen',
    resetQ: 'Taal, thema, stad, valuta en accountmomentopnamen op dit toestel wissen? Portemonnee-transacties blijven bewaard.',
    portalNote: 'Meld je aan en taal, thema, stad, valuta en portemonnee volgen je Google-account op elk toestel.',
    lpSettingsSub: 'Taal, thema, stad & valuta',
    scribeIn: 'Spreektaal', scribeOut: 'Transcripttaal', scribeStart: 'Start', scribeStop: 'Stop', scribeListening: 'Luistert',
    scribeClear: 'Wissen', scribeCopy: 'Kopiëren', scribeDownload: 'Downloaden', scribeSaved: 'Alle wijzigingen opgeslagen', scribeSaving: 'Opslaan…', scribeWords: 'woorden',
    scribeHint: 'Druk op Start en spreek — het transcript verschijnt hier en blijft bewerkbaar.',
    scribeNo: 'Spraakherkenning wordt niet ondersteund in deze browser.',
    scribeUndo: 'Ongedaan maken', scribeRedo: 'Opnieuw uitvoeren', scribeFind: 'Zoeken', scribeReplace: 'Vervangen', scribeReplaceAll: 'Alles vervangen', scribePrint: 'Afdrukken', scribeImport: 'Tekstbestand importeren', scribeStamps: 'Tijdstempels', scribeChars: 'tekens', scribeNoHits: 'Geen treffers',
    lpScribeSub: 'Live transcriptie van colleges', lpScribe: 'Scribe', language: 'Taal', local: 'Lokaal', addZone: 'Zone toevoegen', single: 'Enkel', side: 'Naast elkaar', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Alles wissen', aiTip: 'AI op het toestel (WebGPU) voor vrije commando’s en lichte vragen',
    aiLoad: 'De AI wordt wakker — het model op het toestel wordt één keer gedownload bij eerste gebruik. Vraag het zo opnieuw.',
    aiNoGpu: 'Deze browser heeft geen WebGPU, dus de AI op het toestel kan hier niet draaien — getypte commando’s werken gewoon.',
    timeIn: 'Het is {t} in {c}.', remindSet: 'Herinnering over {n} min', remindNow: 'Tijd is om', clearChat: 'chat wissen', voiceTip: 'Lees antwoorden voor', winTitle: 'Vensterindeling', winAdd: 'Aan dit venster toevoegen', analog: 'Analoog', digital: 'Digitaal', timer: 'Timer',
    start: 'Start', pause: 'Pauze', resume: 'Hervatten', done: 'Klaar', running: 'actief', paused: 'gepauzeerd', minutes: 'Minuten', clear: 'Wissen', stopwatch: 'Stopwatch', reset: 'Opnieuw instellen',
    ipTitle: 'IP-locator', ipAddr: 'IP-adres', mac: 'MAC', location: 'Locatie', coords: 'Coördinaten', useTz: 'Deze tijdzone gebruiken', macNA: 'verborgen door de browser', locating: 'lokaliseren…',
    map: 'Kaart', synced: 'Gesynchroniseerd · {src}', corrected: 'Gecorrigeerd · {src}', drift: 'toesteldrift {mag} — gecorrigeerd{res}', offLabel: 'Systeemklok — referentie niet beschikbaar', offDetail: 'geen driftcorrectie toegepast', lastCheck: 'laatste check {t}', syncing: 'synchroniseren…', secondRes: ' · seconde-resolutie', checking: 'controleren…',
    nightTitle: 'Nachtmodus aan/uit (N)', tzTitle: 'Tijdzone', modeTitle: 'Analoog / digitaal (A)', resyncTitle: 'Referentietijd opnieuw controleren (R)', fullTitle: 'Volledig scherm (F)', full: 'Volledig scherm',
    tzSearchPh: 'Tijdzones zoeken…', tzListAria: 'Tijdzones', prevMatch: 'Vorige treffer', nextMatch: 'Volgende treffer', closeFind: 'Zoekbalk sluiten', scrDocAria: 'Transcriptdocument', docTitle: 'Documenttitel', untitled: 'Naamloos document',
    smatePh: 'Typ een commando…', smateTip: 'SMate-assistent', smateSend: 'Versturen', smateOnline: 'Online', smateTyping: 'typt…', smateUnavailable: 'niet beschikbaar', smateVoice: 'Spraakinvoer',
    smateHi: 'Hoi, ik ben SMate. Probeer “timer 5”, “zone Taipei”, “open portemonnee”, “nachtmodus” of “help”.',
    smateUnknown: 'Sorry, dat begreep ik niet. Typ “help”.',
    mHint: 'Tik op een station en dan op een ander — de prijs verschijnt hier.', mFrom: 'Van', mTo: 'Naar', mFare: 'Prijs', mStations: 'stations', mTransfers: 'overstappen', mMin: 'min', mSwap: 'Wissel', mClear: 'Wissen', mTRTC: 'Taipei-metro', mTY: 'Luchthaven-MRT', mKS: 'Kaohsiung-metro', mTC: 'Taichung-metro',lpMetro: 'Metro',  lpMetroSub: 'Tariefcalculator', lpWelcomeT: 'Welkom bij SinghoLaunch', lpWelcomeS: 'Eén launchpad voor wereldklok, metrotarieven, portemonnee, notities en instellingen — privé, offline en van jou.', lpStart: 'Aan de slag', lpWorld: 'De wereld rond', lpToday: 'Vandaag',
    mCard: 'Kaart', mCardTap: 'Houd de kaart tegen de achterkant van de telefoon…', mCardNone: 'Hier is geen lezer — scannen kan alleen op een telefoon met NFC.', mCardSeen: 'Kaart herkend', mCardBal: 'Saldo (NT$)', mCardNote: 'Het saldo blijft op dit toestel; geen website kan het van de kaart lezen.',
  },
  el: {
    fareXsys: 'διαφορετικά συστήματα — το κόμιστρο υπολογίζεται εντός ενός συστήματος',
    wallet: 'Πορτοφόλι', walBalance: 'Υπόλοιπο', walExpense: 'Έξοδο', walIncome: 'Έσοδο',
    walAmount: 'Ποσό', walNote: 'Σημείωση', walAdd: 'Προσθήκη', mAdd: 'Προσθήκη', mCode: 'Κώδικας', mCodePh: 'ο κώδικάς σου…', mLang: 'Γλώσσα', mSetup: 'Προετοιμάζεται το {name} — κατεβαίνει μία φορά στην πρώτη εκτέλεση', mBusy: 'Εκτελείται…', mMs: 'ολοκληρώθηκε σε {ms} ms', mNetErr: 'Αποτυχία φόρτωσης {name} — ελέγξτε τη σύνδεση', mStopped: 'Σταμάτησε — άργησε πολύ', zoomIn: 'Μεγέθυνση', zoomOut: 'Σμίκρυνση', walDays: 'Ημέρες', walReports: 'Αναφορές', walCash: 'Μετρητά', lpModule:'Μονάδα',lpModuleSub:'Οπτική αυτοματοποίηση σε στυλ n8n',flFiles:'Αρχεία',flNew:'Νέο',flOpen:'Άνοιγμα',flRename:'Μετονομασία',flDuplicate:'Αντιγραφή',flDelete:'Διαγραφή',flExport:'Εξαγωγή',flImport:'Εισαγωγή',flUpdated:'Τροποποιήθηκε',flEmpty:'Δεν υπάρχουν έγγραφα ακόμα',flSearch:'Αναζήτηση',flConfirm:'Οριστική διαγραφή;',flUntitledNote:'Σημείωση χωρίς τίτλο',flUntitledFlow:'Ροή χωρίς τίτλο',mRun:'Εκτέλεση',mGrid:'Πλέγμα',mText:'Κείμενο',mMarkdown:'Μάρκνταουν',mIO:'I/O', mIOPh:'το κείμενο που θα διαβάσει ο κώδικας…', mFeedHint:'το πρόγραμμα περιμένει είσοδο — πληκτρολογήστε την στον κόμβο I/O και εκτελέστε ξανά',mResult:'Αποτέλεσμα',encPlain:'Απλό',encB64:'Base64',encUrl:'URL',encHex:'Hex',encUni:'Unicode',encEnt:'Οντότητες HTML',encRot:'ROT13',
    walSpent: 'Ξοδεύτηκαν', walMonth: 'Αυτός ο μήνας', walAvg: 'Ημερήσιος μέσος', walWeek: 'Τελευταίες 7 ημέρες',
    walTop: 'Μεγαλύτερο έξοδο', pDay: 'Ημέρα', pWeek: 'Εβδομάδα', pMonth: 'Μήνας', pSem: 'Εξάμηνο', pYear: 'Χρόνος', pDec: 'Δεκαετία', walNet: 'Καθαρό', walEmpty: 'Δεν υπάρχουν συναλλαγές', walCurrency: 'Σύμβολο νομίσματος', walDelete: 'Διαγραφή καταχώρισης', walCurSearch: 'Αναζήτηση νομισμάτων…', launchpad: 'Αφετηρία', lpClock: 'Ρολόι', lpClockSub: 'Παγκόσμιο ρολόι με διόρθωση παρέκκλισης', lpWalletSub: 'Υπόλοιπο, ημερήσια έξοδα & αναφορές',
    date: 'Ημερομηνία', time: 'Ώρα', window: 'Παράθυρο', light: 'Φωτεινό', night: 'Νυχτερινή λειτουργία',
    resync: 'Επανασυγχρονισμός', search: 'Αναζήτηση πόλης ή χώρας…', signin: 'Σύνδεση', signout: 'Αποσύνδεση',
    account: 'Λογαριασμός', settings: 'Ρυθμίσεις', appearance: 'Εμφάνιση', homeCity: 'Πόλη ρολογιού', currency: 'Νόμισμα', data: 'Δεδομένα', resetData: 'Επαναφορά τοπικών δεδομένων',
    resetQ: 'Να καθαριστούν γλώσσα, θέμα, πόλη, νόμισμα και στιγμιότυπα λογαριασμού σε αυτή τη συσκευή; Οι συναλλαγές πορτοφολιού διατηρούνται.',
    portalNote: 'Συνδέσου και γλώσσα, θέμα, πόλη, νόμισμα και πορτοφόλι ακολουθούν τον λογαριασμό Google σε κάθε συσκευή.',
    lpSettingsSub: 'Γλώσσα, θέμα, πόλη & νόμισμα',
    scribeIn: 'Προφορική γλώσσα', scribeOut: 'Γλώσσα απομαγνητοφόνησης', scribeStart: 'Έναρξη', scribeStop: 'Διακοπή', scribeListening: 'Ακούει',
    scribeClear: 'Καθαρισμός', scribeCopy: 'Αντιγραφή', scribeDownload: 'Λήψη', scribeSaved: 'Όλες οι αλλαγές αποθηκεύτηκαν', scribeSaving: 'Αποθήκευση…', scribeWords: 'λέξεις',
    scribeHint: 'Πάτησε Έναρξη και μίλα — το κείμενο εμφανίζεται εδώ και παραμένει επεξεργάσιμο.',
    scribeNo: 'Η αναγνώριση ομιλίας δεν υποστηρίζεται σε αυτό το πρόγραμμα περιήγησης.',
    scribeUndo: 'Αναίρεση', scribeRedo: 'Επανάληψη', scribeFind: 'Εύρεση', scribeReplace: 'Αντικατάσταση', scribeReplaceAll: 'Αντικατάσταση όλων', scribePrint: 'Εκτύπωση', scribeImport: 'Εισαγωγή αρχείου κειμένου', scribeStamps: 'Χρονοσφραγίδες', scribeChars: 'χαρακτήρες', scribeNoHits: 'Κανένα αποτέλεσμα',
    lpScribeSub: 'Ζωντανή απομαγνητοφόνηση διαλέξεων', lpScribe: 'Scribe', language: 'Γλώσσα', local: 'Τοπική', addZone: 'Προσθήκη ζώνης', single: 'Μονό', side: 'Δίπλα-δίπλα', quad: '2 × 2', grid16: '4 × 4',
    clearAll: 'Καθαρισμός όλων', aiTip: 'AI στη συσκευή (WebGPU) για ελεύθερες εντολές και απλές ερωτήσεις',
    aiLoad: 'Το AI ξυπνά — το μοντέλο στη συσκευή κατεβαίνει μία φορά στην πρώτη χρήση. Ρώτα ξανά σε λίγο.',
    aiNoGpu: 'Αυτός ο περιηγητής δεν έχει WebGPU, άρα το AI στη συσκευή δεν τρέχει εδώ — οι εντολές λειτουργούν όταν πληκτρολογηθούν.',
    timeIn: 'Στην {c} είναι {t}.', remindSet: 'Υπενθύμιση σε {n} λεπτά', remindNow: 'Ο χρόνος τελείωσε', clearChat: 'καθαρισμός συνομιλίας', voiceTip: 'Διάβασε τις απαντήσεις φωναχτά', winTitle: 'Διάταξη παραθύρου', winAdd: 'Προσθήκη σε αυτό το παράθυρο', analog: 'Αναλογικό', digital: 'Ψηφιακό', timer: 'Χρονοδιακόπτης',
    start: 'Έναρξη', pause: 'Παύση', resume: 'Συνέχεια', done: 'Έτοιμο', running: 'σε λειτουργία', paused: 'σε παύση', minutes: 'Λεπτά', clear: 'Καθαρισμός', stopwatch: 'Χρονόμετρο', reset: 'Επαναφορά',
    ipTitle: 'Εντοπισμός IP', ipAddr: 'Διεύθυνση IP', mac: 'MAC', location: 'Τοποθεσία', coords: 'Συντεταγμένες', useTz: 'Χρήση αυτής της ζώνης', macNA: 'κρυφό από τον περιηγητή', locating: 'εντοπισμός…',
    map: 'Χάρτης', synced: 'Συγχρονίστηκε · {src}', corrected: 'Διορθώθηκε · {src}', drift: 'παρέκκλιση συσκευής {mag} — διορθώθηκε{res}', offLabel: 'Ρολόι συστήματος — μη διαθέσιμη αναφορά', offDetail: 'χωρίς διόρθωση παρέκκλισης', lastCheck: 'τελευταίος έλεγχος {t}', syncing: 'συγχρονισμός…', secondRes: ' · ανάλυση δευτερολέπτου', checking: 'έλεγχος…',
    nightTitle: 'Εναλλαγή νυχτερινής λειτουργίας (N)', tzTitle: 'Ζώνη ώρας', modeTitle: 'Αναλογικό / ψηφιακό (A)', resyncTitle: 'Επανέλεγχος ώρας αναφοράς (R)', fullTitle: 'Πλήρης οθόνη (F)', full: 'Πλήρης οθόνη',
    tzSearchPh: 'Αναζήτηση ζωνών ώρας…', tzListAria: 'Ζώνες ώρας', prevMatch: 'Προηγούμενο αποτέλεσμα', nextMatch: 'Επόμενο αποτέλεσμα', closeFind: 'Κλείσιμο γραμμής εύρεσης', scrDocAria: 'Έγγραφο απομαγνητοφόνησης', docTitle: 'Τίτλος εγγράφου', untitled: 'Έγγραφο χωρίς τίτλο',
    smatePh: 'Πληκτρολόγησε εντολή…', smateTip: 'Βοηθός SMate', smateSend: 'Αποστολή', smateOnline: 'Σε σύνδεση', smateTyping: 'πληκτρολογεί…', smateUnavailable: 'μη διαθέσιμο', smateVoice: 'Φωνητική εισαγωγή',
    smateHi: 'Γεια, είμαι ο SMate. Δοκίμασε «χρονοδιακόπτης 5», «ζώνη Ταϊπέι», «άνοιξε πορτοφόλι», «νυχτερινή λειτουργία» ή «help».',
    smateUnknown: 'Συγγνώμη, δεν κατάλαβα. Πληκτρολόγησε «help».',
    mHint: 'Πάτησε έναν σταθμό και μετά άλλον έναν — ο ναύλος εμφανίζεται εδώ.', mFrom: 'Από', mTo: 'Προς', mFare: 'Ναύλος', mStations: 'σταθμοί', mTransfers: 'μετεπιβιβάσεις', mMin: 'λεπ', mSwap: 'Ανταλλαγή', mClear: 'Καθαρισμός', mTRTC: 'Μετρό Ταϊπέι', mTY: 'MRT αεροδρομίου', mKS: 'Μετρό Καοσιούνγκ', mTC: 'Μετρό Ταϊτσούνγκ',lpMetro: 'Μετρό',  lpMetroSub: 'Υπολογιστής ναύλου', lpWelcomeT: 'Καλώς ήρθατε στο SinghoLaunch', lpWelcomeS: 'Ένα εκκινητήριο για παγκόσμιο ρολόι, ναύλα μετρό, πορτοφόλι, σημειώσεις και ρυθμίσεις — ιδιωτικό, εκτός σύνδεσης και δικό σας.', lpStart: 'Έναρξη', lpWorld: 'Σε όλο τον κόσμο', lpToday: 'Σήμερα',
    mCard: 'Κάρτα', mCardTap: 'Ακούμπησε την κάρτα στην πλάτη του τηλεφώνου…', mCardNone: 'Εδώ δεν υπάρχει αναγνώστης — χρειάζεται τηλέφωνο με NFC.', mCardSeen: 'Η κάρτα αναγνωρίστηκε', mCardBal: 'Υπόλοιπο (NT$)', mCardNote: 'Το υπόλοιπο μένει μόνο σε αυτή τη συσκευή· καμία ιστοσελίδα δεν μπορεί να το διαβάσει από την κάρτα.',
  },
};

/** Tiny formatter: t('es', 'synced', { src: 'x' }) -> 'Sincronizado · x' */
export function t(lang, key, vars = {}) {
  const table = STRINGS[lang] || STRINGS.en;
  const raw = table[key] ?? STRINGS.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

export const langOf = (id) => LANGS.find((l) => l.id === id) || LANGS.find((l) => l.id === 'en');

/** Bilingual tooltip for the language button, e.g. 'Language · 語言'. */
export const langTitleOf = (lang) =>
  lang === 'zh-Hant' ? '語言 · Language'
    : `${(STRINGS[lang] || STRINGS.en).language} · ${lang === 'en' ? '語言' : 'Language'}`;

/* ---------------- wallet math (pure, unit-tested) ---------------- */

/** Balance = income in minus spending out. */
export function walBalance(tx) {
  let b = 0;
  for (const x of tx) b += x.type === 'in' ? x.amt : -x.amt;
  return Math.round(b * 100) / 100;
}

/** Group transactions per day: date -> { spent, income, items[] }. */
export function walByDay(tx) {
  const m = new Map();
  for (const x of tx) {
    let d = m.get(x.date);
    if (!d) { d = { spent: 0, income: 0, items: [] }; m.set(x.date, d); }
    if (x.type === 'out') d.spent += x.amt; else d.income += x.amt;
    d.items.push(x);
  }
  for (const d of m.values()) {
    d.spent = Math.round(d.spent * 100) / 100;
    d.income = Math.round(d.income * 100) / 100;
  }
  return m;
}

/** Month-to-date dashboard figures for `today` (YYYY-MM-DD). */
export function walMonthStats(tx, today) {
  const mo = today.slice(0, 7);
  let spent = 0, income = 0, top = null;
  const days = new Set();
  for (const x of tx) {
    if (typeof x.date !== 'string' || !x.date.startsWith(mo)) continue;
    if (x.type === 'out') { spent += x.amt; days.add(x.date); if (!top || x.amt > top.amt) top = x; }
    else income += x.amt;
  }
  const elapsed = Number(today.slice(8, 10)) || 1;
  return {
    spent: Math.round(spent * 100) / 100,
    income: Math.round(income * 100) / 100,
    avg: Math.round((spent / elapsed) * 100) / 100,
    top,
  };
}

/** Spending per day over the seven days ending at `today`. */
export function walWeekSeries(tx, today) {
  const per = new Map();
  for (const x of tx) if (x.type === 'out') per.set(x.date, (per.get(x.date) || 0) + x.amt);
  const base = new Date(`${today}T00:00:00`);
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ date: ymd, spent: Math.round((per.get(ymd) || 0) * 100) / 100 });
  }
  return out;
}

/* ---------------- currencies: ISO 4217 + BTC/ETH ---------------- */

export const CURRENCIES = [
  ['AED', 'AE'], ['AFN', 'AF'], ['ALL', 'AL'], ['AMD', 'AM'], ['ANG', 'CW'], ['AOA', 'AO'],
  ['ARS', 'AR'], ['AUD', 'AU'], ['AWG', 'AW'], ['AZN', 'AZ'], ['BAM', 'BA'], ['BBD', 'BB'],
  ['BDT', 'BD'], ['BGN', 'BG'], ['BHD', 'BH'], ['BIF', 'BI'], ['BMD', 'BM'], ['BND', 'BN'],
  ['BOB', 'BO'], ['BRL', 'BR'], ['BSD', 'BS'], ['BTN', 'BT'], ['BWP', 'BW'], ['BYN', 'BY'],
  ['BZD', 'BZ'], ['CAD', 'CA'], ['CDF', 'CD'], ['CHF', 'CH'], ['CLP', 'CL'], ['CNY', 'CN'],
  ['COP', 'CO'], ['CRC', 'CR'], ['CUP', 'CU'], ['CVE', 'CV'], ['CZK', 'CZ'], ['DJF', 'DJ'],
  ['DKK', 'DK'], ['DOP', 'DO'], ['DZD', 'DZ'], ['EGP', 'EG'], ['ERN', 'ER'], ['ETB', 'ET'],
  ['EUR', 'EU'], ['FJD', 'FJ'], ['FKP', 'FK'], ['GBP', 'GB'], ['GEL', 'GE'], ['GHS', 'GH'],
  ['GIP', 'GI'], ['GMD', 'GM'], ['GNF', 'GN'], ['GTQ', 'GT'], ['GYD', 'GY'], ['HKD', 'HK'],
  ['HNL', 'HN'], ['HTG', 'HT'], ['HUF', 'HU'], ['IDR', 'ID'], ['ILS', 'IL'], ['INR', 'IN'],
  ['IQD', 'IQ'], ['IRR', 'IR'], ['ISK', 'IS'], ['JMD', 'JM'], ['JOD', 'JO'], ['JPY', 'JP'],
  ['KES', 'KE'], ['KGS', 'KG'], ['KHR', 'KH'], ['KMF', 'KM'], ['KPW', 'KP'], ['KRW', 'KR'],
  ['KWD', 'KW'], ['KYD', 'KY'], ['KZT', 'KZ'], ['LAK', 'LA'], ['LBP', 'LB'], ['LKR', 'LK'],
  ['LRD', 'LR'], ['LSL', 'LS'], ['LYD', 'LY'], ['MAD', 'MA'], ['MDL', 'MD'], ['MGA', 'MG'],
  ['MKD', 'MK'], ['MMK', 'MM'], ['MNT', 'MN'], ['MOP', 'MO'], ['MRU', 'MR'], ['MUR', 'MU'],
  ['MVR', 'MV'], ['MWK', 'MW'], ['MXN', 'MX'], ['MYR', 'MY'], ['MZN', 'MZ'], ['NAD', 'NA'],
  ['NGN', 'NG'], ['NIO', 'NI'], ['NOK', 'NO'], ['NPR', 'NP'], ['NZD', 'NZ'], ['OMR', 'OM'],
  ['PAB', 'PA'], ['PEN', 'PE'], ['PGK', 'PG'], ['PHP', 'PH'], ['PKR', 'PK'], ['PLN', 'PL'],
  ['PYG', 'PY'], ['QAR', 'QA'], ['RON', 'RO'], ['RSD', 'RS'], ['RUB', 'RU'], ['RWF', 'RW'],
  ['SAR', 'SA'], ['SBD', 'SB'], ['SCR', 'SC'], ['SDG', 'SD'], ['SEK', 'SE'], ['SGD', 'SG'],
  ['SHP', 'SH'], ['SLE', 'SL'], ['SOS', 'SO'], ['SRD', 'SR'], ['SSP', 'SS'], ['STN', 'ST'],
  ['SVC', 'SV'], ['SYP', 'SY'], ['SZL', 'SZ'], ['THB', 'TH'], ['TJS', 'TJ'], ['TMT', 'TM'],
  ['TND', 'TN'], ['TOP', 'TO'], ['TRY', 'TR'], ['TTD', 'TT'], ['TWD', 'TW'], ['TZS', 'TZ'],
  ['UAH', 'UA'], ['UGX', 'UG'], ['USD', 'US'], ['UYU', 'UY'], ['UZS', 'UZ'], ['VES', 'VE'],
  ['VND', 'VN'], ['VUV', 'VU'], ['WST', 'WS'], ['XAF', 'CM'], ['XCD', 'DM'], ['XOF', 'SN'],
  ['XPF', 'PF'], ['YER', 'YE'], ['ZAR', 'ZA'], ['ZMW', 'ZM'], ['ZWG', 'ZW'],
  ['BTC', ''], ['ETH', ''],
];
const CUR_CCMAP = new Map(CURRENCIES);
const CUR_FLAGS = {
  BTC: `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 15'><rect width='20' height='15' rx='2' fill='#F7931A'/><text x='10' y='11.5' font-size='10' text-anchor='middle' fill='#fff' font-family='Arial,sans-serif' font-weight='bold'>₿</text></svg>")}`,
  ETH: `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 15'><rect width='20' height='15' rx='2' fill='#627EEA'/><text x='10' y='11.5' font-size='10' text-anchor='middle' fill='#fff' font-family='Arial,sans-serif' font-weight='bold'>Ξ</text></svg>")}`,
};
const CUR_SYM = { BTC: '₿', ETH: 'Ξ' };
const CUR_NAMES = {
  BTC: { en: 'Bitcoin', 'zh-Hant': '比特幣', hi: 'बिटकॉइन', es: 'Bitcoin', fr: 'Bitcoin', ar: 'بيتكوين', bn: 'বিটকয়েন', ru: 'Биткоин', pt: 'Bitcoin', ur: 'بٹ کوائن' },
  ETH: { en: 'Ethereum', 'zh-Hant': '以太坊', hi: 'इथीरियम', es: 'Ethereum', fr: 'Ethereum', ar: 'إيثريوم', bn: 'ইথেরিয়াম', ru: 'Эфириум', pt: 'Ethereum', ur: 'ایتھیریم' },
};

/** Localized symbol for a currency code (₿ / Ξ for the two coins). */
export function curSymbol(code, locale = 'en-GB') {
  if (CUR_SYM[code]) return CUR_SYM[code];
  for (const disp of ['narrowSymbol', 'symbol']) {
    try {
      const part = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: disp })
        .formatToParts(1).find((x) => x.type === 'currency');
      if (part && part.value && part.value !== code) return part.value;
    } catch { /* unknown code */ }
  }
  return code;
}

/** Localized currency name (Intl.DisplayNames; hand-made for the coins). */
export function curName(code, langId = 'en') {
  const made = CUR_NAMES[code];
  if (made) return made[langId] || made.en;
  try {
    const n = new Intl.DisplayNames([langOf(langId).locale], { type: 'currency' }).of(code);
    if (n && n !== code) return n;
  } catch { /* unknown code */ }
  return code;
}

export function curFlag(code) {
  return CUR_FLAGS[code] || ccFlag(CUR_CCMAP.get(code));
}

/* ---------------- window layouts ---------------- */

/** '2'/'1x2' -> 2 (side by side), '2x2'/'4' -> 4 (grid), '4x4'/'16' -> 16, else 1 */
export function parseLayout(v) {
  if (v === '2' || v === '1x2' || v === '2x1') return 2;
  if (v === '4' || v === '2x2') return 4;
  if (v === '16' || v === '4x4') return 16;
  return 1;
}

export const layoutShape = (n) =>
  n === 2 ? { rows: 1, cols: 2, id: '2' }
    : n === 4 ? { rows: 2, cols: 2, id: '2x2' }
      : n === 16 ? { rows: 4, cols: 4, id: '4x4' }
        : { rows: 1, cols: 1, id: '1' };

/** next bigger window when a pane needs a free cell: 1 → 2 → 4 → 16 */
export const nextLayout = (n) => (n === 1 ? 2 : n === 2 ? 4 : 16);

/** Dial angles in degrees for hour/minute/second/millisecond hands.
    All four sweep continuously — the milli hand does one turn per second. */
/** Dial angles from any hh/mm/ss/ms segment set (clocks and countdowns). */
/** Elapsed ms of a stopwatch at nowMs (pure, unit-testable). */
export function stopwatchElapsed(st, nowMs) {
  return st.accum + (st.running ? Math.max(0, nowMs - st.startedAt) : 0);
}

export function anglesFromSegments(s) {
  const ms = Number(s.ms);
  const secF = Number(s.ss) + ms / 1000;
  const minF = Number(s.mm) + secF / 60;
  const hourF = (Number(s.hh) % 12) + minF / 60;
  return { hour: hourF * 30, minute: minF * 6, second: secF * 6, milli: ms * 0.36 };
}

export function handAngles(date, timeZone) {
  return anglesFromSegments(toSegments(date, timeZone));
}

/* ---------------- NTP-ish synchronisation ---------------- */

export const NTP_SOURCES = [
  {
    // ~50 ms round trip, millisecond resolution in the payload
    name: 'timeapi.io',
    url: 'https://timeapi.io/api/time/current/zone?timeZone=UTC',
    parse: (j) => Date.parse(String(j.dateTime).endsWith('Z') ? j.dateTime : j.dateTime + 'Z'),
  },
  {
    // fallback: any fast CORS-enabled CDN answers with an RFC 7231 Date header.
    // 1 s resolution, so compensate for the truncation (+500 ms) and mark it
    // coarse — it is only trusted when no millisecond-resolution source answers.
    name: 'jsdelivr Date header',
    url: 'https://cdn.jsdelivr.net/npm/left-pad@1.3.0/package.json',
    header: 'date',
    coarse: true,
    parse: (_j, res) => Date.parse(res.headers.get('date')) + 500,
  },
];

/** True when the source's own timestamp granularity limits its accuracy. */
export const isCoarse = (source) => Boolean(source && source.coarse);

/**
 * One sample against one endpoint, using the symmetric latency correction
 * from NTP: offset = serverTime + rtt/2 − localReceiveTime.
 */
export async function sampleNtp(source, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = deps.now || (() => Date.now());
  const t0 = now();
  let res;
  try {
    res = await fetchFn(source.url, { cache: 'no-store', signal: deps.signal });
  } catch (e) {
    return { ok: false, source: source.name, error: String(e) };
  }
  const t1 = now();
  if (!res) return { ok: false, source: source.name, error: 'no response' };

  // Date-header sources only need the headers — the body/status is irrelevant.
  if (!source.header && !res.ok) {
    return { ok: false, source: source.name, error: `HTTP ${res.status}` };
  }

  let json = null;
  if (!source.header) {
    try {
      json = await res.json();
    } catch (e) {
      return { ok: false, source: source.name, error: String(e) };
    }
  }
  let serverNow;
  try {
    serverNow = source.parse(json, res);
  } catch (e) {
    return { ok: false, source: source.name, error: String(e) };
  }
  if (!Number.isFinite(serverNow)) return { ok: false, source: source.name, error: 'unparsable time' };
  const rtt = t1 - t0;
  return {
    ok: true,
    source: source.name,
    coarse: Boolean(source.coarse),
    rtt,
    offset: Math.round(serverNow + rtt / 2 - t1),
    at: t1,
  };
}

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

/**
 * Keep the low-latency samples, drop the rest, take the median offset.
 * Coarse (second-resolution) sources are only used when nothing finer answered.
 */
export function pickNtpResult(samples, opts = {}) {
  const maxRtt = opts.maxRtt ?? 900;
  let good = (samples || []).filter((s) => s && s.ok && s.rtt <= maxRtt);
  if (!good.length) return null;

  const precise = good.filter((s) => !s.coarse);
  let resolution = 'millisecond';
  if (precise.length) good = precise;
  else resolution = 'second';

  const offset = median(good.map((s) => s.offset));
  const best = good.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  return {
    ok: true,
    source: best.source,
    resolution,
    offset,
    rtt: best.rtt,
    spread: Math.max(...good.map((s) => s.offset)) - Math.min(...good.map((s) => s.offset)),
    samples: good.length,
    at: best.at,
  };
}

export function syncStatus(result, opts = {}) {
  const driftLimit = opts.driftLimit ?? 250;
  const lang = opts.lang || 'en';
  if (!result || !result.ok) {
    return { level: 'off', label: t(lang, 'offLabel'), detail: t(lang, 'offDetail') };
  }
  const o = result.offset;
  const sign = o < 0 ? '−' : '+';
  const mag = `${sign}${Math.abs(o)} ms`;
  const res = result.resolution === 'second' ? t(lang, 'secondRes') : '';
  const vars = { src: result.source, mag, res };
  if (Math.abs(o) <= driftLimit) {
    return { level: 'ok', label: t(lang, 'synced', vars), detail: t(lang, 'drift', vars) };
  }
  return { level: 'warn', label: t(lang, 'corrected', vars), detail: t(lang, 'drift', vars) };
}

/* ---------------- the ticking clock ---------------- */

/**
 * Owns "what time is it right now" (system clock + measured drift) and the
 * render loop. `deps` lets the tests drive it with fake time and a fake rAF.
 */
export class ClockCore {
  constructor(deps = {}) {
    this.nowFn = deps.now || (() => Date.now());
    this.schedule = deps.schedule || ((fn) => requestAnimationFrame(fn));
    this.onTick = deps.onTick || (() => {});
    this.offset = 0;
    this.rate = 0;                 // measured device drift, correction-ms per device-ms
    this.offAt = this.nowFn();     // device time the current offset was anchored
    this._sw = null;
    this._running = false;
    this.start();
  }

  get running() { return this._running; }

  /* Current correction while a slew is running (smoothstep easing). */
  /* between syncs the device keeps drifting at its measured rate, so the
     correction grows with it — the display stays pinned to true time. */
  _rateTerm() {
    const x = this.rate * (this.nowFn() - this.offAt);
    return Math.max(-2000, Math.min(2000, Math.round(x)));
  }

  _curOff() {
    if (this._sw) {
      const k = (this.nowFn() - this._sw.t0) / this._sw.dur;
      if (k >= 1) { this.offset = this._sw.to; this._sw = null; }
      else {
        const e = k <= 0 ? 0 : k * k * (3 - 2 * k);
        return Math.round(this._sw.from + (this._sw.to - this._sw.from) * e);
      }
    }
    return this.offset + this._rateTerm();
  }

  /** Time the display should show: local system time, drift-corrected. */
  now() { return new Date(this.nowFn() + this._curOff()); }

  /* Small corrections ease in over ~2 s so the digits never jump;
     large ones (system clock stepped) apply instantly. */
  setOffset(ms) { this.setSync(ms, 0, this.nowFn()); }

  /* A sync anchors the correction at `at` and carries the fitted drift rate. */
  setSync(ms, rate = 0, at = null) {
    const to = Number.isFinite(ms) ? Math.round(ms) : 0;
    this.rate = Number.isFinite(rate) ? Math.max(-5e-4, Math.min(5e-4, rate)) : 0;
    this.offAt = Number.isFinite(at) ? at : this.nowFn();
    const from = this._curOff();
    if (Math.abs(to - from) > 2000) { this.offset = to; this._sw = null; }
    else if (to !== from) {
      this._sw = { from, to, t0: this.nowFn(), dur: Math.min(2500, 400 + Math.abs(to - from) * 4) };
    }
    this.onTick(this.now());
  }

  start() {
    if (this._running) return;
    this._running = true;
    const step = () => {
      if (!this._running) return;
      this.onTick(this.now());
      this.schedule(step);
    };
    step();
  }

  stop() { this._running = false; }
}

/**
 * Largest font size for which the clock still fits, given a box in CSS px.
 * Width: the string is CLOCK_EMS em wide. Height: line-height is .84, and we
 * leave a little air so the descenderless digits never touch the rules.
 */
export function fitFontSize(w, h, opts = {}) {
  const padX = opts.padX ?? 0;
  const padY = opts.padY ?? 0;
  const lineBox = opts.lineBox ?? 0.84;
  const max = opts.max ?? 340;
  const byWidth = (w - padX) / CLOCK_EMS;
  const byHeight = (h - padY) / lineBox;
  return Math.max(12, Math.floor(Math.min(byWidth, byHeight, max) * 100) / 100);
}

/* ---------------- standardized dropdown anchoring ----------------
   Every dropdown opens below its button with the menu's left edge on the
   button's left edge; a viewport clamp keeps it fully on-screen on phones.
   Installed once, site-wide, and catches dynamically created popovers. */
const POP_SEL = '.tz-pop, .wallet-pop, .auth-pop, .win-pop, .ip-pop, .timer-pop';
function placePop(pop) {
  pop.style.left = '0px';
  pop.style.right = 'auto';
  pop.style.transform = 'none';
  /* anchor to the trigger button's own rect — never to a CSS ancestor */
  const wrap = pop.parentElement;
  let btn = pop.previousElementSibling;
  if (!btn || !btn.matches || !btn.matches('button, a')) btn = wrap.querySelector('button, a');
  const b = (btn || wrap).getBoundingClientRect();
  const r = pop.getBoundingClientRect();
  const m = 8;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let L = b.left;                                     /* left edge on the button's left edge */
  if (L + r.width > vw - m) L = (vw - m) - r.width;   /* clamp on phones… */
  if (L < m) L = m;
  let T = b.bottom + 6;                               /* below the button */
  if (T + r.height > vh - m && b.top - r.height - 6 >= m) T = b.top - r.height - 6;
  const dx = L - r.left;
  const dy = T - r.top;
  pop.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const popMo = new MutationObserver((muts) => {
    for (const mu of muts) {
      const el = mu.target;
      if (el instanceof HTMLElement && el.matches(POP_SEL) && !el.hidden) placePop(el);
    }
  });
  popMo.observe(document, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  const reposition = () => {
    document.querySelectorAll(POP_SEL).forEach((pp) => { if (!pp.hidden) placePop(pp); });
  };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
}

/* ---------------- UI (browser only) ---------------- */

const els = {};
let timeZone = null;      // cell 0 zone; the picker always holds a value
let lang = 'en';          // UI language id (LANGS)
let zenMode = false;
let layout = 1;           // 1 | 2 | 4 cells
let cellZones = [null];   // per-cell zone (cell 0 mirrors timeZone)
let cells = [];           // { el, cap, flag, zspan, dspan, add, clock, prev, capKey }
let pickerCell = null;    // which cell the zone picker edits (null = main)
let timers = new Map();   // id -> { duration, endsAt, remaining, running }
let timerSeq = 0;
let stops = new Map();    // id -> { startedAt, accum, running }
let stopSeq = 0;
const isTimer = (z) => typeof z === 'string' && z.startsWith('timer:');
const isStop = (z) => typeof z === 'string' && z.startsWith('stop:');
const isSession = (z) => isTimer(z) || isStop(z);
let prev = null;
let lastMetaKey = null;
let syncResult = null;
let syncing = false;
let pickerRows = [];
let pickerGroups = [];

const WIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M9 4h9a2 2 0 0 1 2 2v9" stroke="currentColor" stroke-width="2"/></svg>';

const MOON_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M21.8577 15.9125C20.4575 16.5686 18.8663 16.8635 17.2164 16.6901C12.3885 16.1826 8.88611 11.8575 9.39354 7.02959C9.56355 5.50838 10.1889 3.87875 11.1249 2.64375C7.31883 3.87875 4.64062 7.40498 4.64062 11.5489C4.64062 16.7938 8.88611 21.0489 14.1231 21.0489C17.1979 21.0489 19.9435 19.5845 21.8577 17.3065C21.1965 16.9113 20.5529 16.4409 21.8577 15.9125Z" fill="currentColor"/></svg>';
const SUN_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.4" fill="currentColor"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

const ANALOG_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v4.5l3.1 1.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const DIGIT_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 12h2.4M13.6 12H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** Hairline displaay-style dial: rim, 60 ticks, 12/3/6/9 and four hands. */
function makeDial() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  const el = (name, attrs, cls) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (cls) n.setAttribute('class', cls);
    n.setAttribute('vector-effect', 'non-scaling-stroke');
    return n;
  };
  svg.appendChild(el('circle', { cx: 100, cy: 100, r: 97 }, 'dial-rim'));
  for (let i = 0; i < 60; i++) {
    const hour = i % 5 === 0;
    const a = (i * 6) * Math.PI / 180;
    const r1 = 94;
    const r2 = hour ? 85 : 90;
    svg.appendChild(el('line', {
      x1: 100 + r1 * Math.sin(a), y1: 100 - r1 * Math.cos(a),
      x2: 100 + r2 * Math.sin(a), y2: 100 - r2 * Math.cos(a),
    }, hour ? 'dial-tick dial-tick-h' : 'dial-tick'));
  }
  for (const [txt, x, y] of [['12', 100, 27], ['3', 173, 100], ['6', 100, 173], ['9', 27, 100]]) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('class', 'dial-num');
    t.textContent = txt;
    svg.appendChild(t);
  }
  const hand = (cls, y1, y2, name) => {
    const l = el('line', { x1: 100, y1, x2: 100, y2 }, `dial-hand ${cls}`);
    l.dataset.hand = name;
    return l;
  };
  const hands = {
    hour: hand('h-hour', 112, 55, 'hour'),
    minute: hand('h-min', 114, 38, 'minute'),
    second: hand('h-sec', 120, 30, 'second'),
    milli: hand('h-ms', 116, 24, 'milli'),
  };
  svg.append(hands.hour, hands.minute, hands.second, hands.milli);
  svg.appendChild(el('circle', { cx: 100, cy: 100, r: 4 }, 'dial-hub'));
  svg.appendChild(el('circle', { cx: 100, cy: 100, r: 1.8 }, 'dial-hub2'));
  return { svg, hands };
}

const LAY_ICONS = {
  1: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>',
  2: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="8" height="14" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="5" width="8" height="14" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  4: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="8" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="4" width="8" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="13" width="8" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg>',
  16: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9.75" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="16.5" y="3" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="9.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="16.5" y="9.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="16.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9.75" y="16.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="16.5" y="16.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
};

/** The mode toggle advertises the face it will switch TO, like the theme one. */
function updateModeBtn() {
  const analog = document.documentElement.classList.contains('analog');
  els.btnMode.innerHTML = `${analog ? DIGIT_ICON : ANALOG_ICON}<span>${t(lang, analog ? 'digital' : 'analog')}</span>`;
  els.btnMode.setAttribute('aria-pressed', String(analog));
}

function setMode(analog, persist = true) {
  document.documentElement.classList.toggle('analog', analog);
  if (persist) {
    try { localStorage.setItem('singhoah:mode', analog ? 'analog' : 'digital'); } catch { /* ignore */ }
  }
  updateModeBtn();
  fitClock();
  if (window.__clock) render(window.__clock.now());
}

/** The toggle advertises the scheme it will switch TO. Dark is the default. */
function updateThemeBtn() {
  const dark = document.documentElement.classList.contains('dark');
  els.btnNight.innerHTML = `${dark ? SUN_ICON : MOON_ICON}<span>${t(lang, dark ? 'light' : 'night')}</span>`;
  els.btnNight.setAttribute('aria-pressed', String(dark));
}

function grabElements() {
  for (const id of [
    'dateLong', 'dateTime', 'clockWrap', 'grid', 'syncDot', 'syncText', 'syncDetail',
    'zoneText', 'lastSync', 'secondFill', 'btnNight', 'btnSync', 'btnFull', 'btnWindow',
    'winPop', 'winList', 'layouts',
    'tzBtn', 'tzFlag', 'tzLabel', 'tzPop', 'tzSearch', 'tzList',
    'langBtn', 'langFlag', 'langLabel', 'langPop', 'langList',
    'dateLabel', 'timeLabel', 'winText', 'resyncText', 'btnMode',
    'btnTimer', 'timerPop', 'timerPresets', 'timerMin', 'timerMinLabel', 'timerStart', 'timerText',
    'btnStop', 'stopText', 'btnIp', 'ipText', 'ipPop', 'ipFlag', 'ipIp', 'ipMac', 'ipLoc', 'ipCoord',
    'ipUse', 'lblMac', 'lblLoc', 'lblCoord',
    'btnMap', 'mapText', 'mapWrap', 'mapSvg',
    'mapZoomIn', 'mapZoomOut', 'mapZoomReset', 'mapClose', 'mapTip',
    'btnLaunch', 'launchText', 'btnSettings', 'settingsText',
  ]) els[id] = document.getElementById(id);
}

/* ---------------- cells ---------------- */

function makeCell(i) {
  const withIds = i === 0; // keep the original ids on the first cell for a11y/tests
  const el = document.createElement('div');
  el.className = 'cell';

  const cap = document.createElement('p');
  cap.className = 'cell-cap';
  if (withIds) cap.id = 'zenCaption';
  const flag = document.createElement('img');
  flag.className = 'flag';
  flag.width = 20; flag.height = 15; flag.alt = '';
  if (withIds) flag.id = 'zenFlag';
  const zspan = document.createElement('span');
  zspan.className = 'cap-zone';
  if (withIds) zspan.id = 'zenZone';
  const sep = document.createElement('span');
  sep.className = 'zen-sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '—';
  const dspan = document.createElement('span');
  dspan.className = 'cap-date';
  if (withIds) dspan.id = 'zenDate';
  const sep2 = document.createElement('span');
  sep2.className = 'zen-sep';
  sep2.setAttribute('aria-hidden', 'true');
  sep2.textContent = '—';
  const tspan = document.createElement('span');
  tspan.className = 'cap-time';
  const rbtn = document.createElement('button');
  rbtn.type = 'button';
  rbtn.className = 'cap-reset';
  rbtn.textContent = '↺';
  rbtn.addEventListener('click', (e) => { e.stopPropagation(); resetStop(i); });
  const xbtn = document.createElement('button');
  xbtn.type = 'button';
  xbtn.className = 'cap-x';
  xbtn.textContent = '×';
  xbtn.addEventListener('click', (e) => { e.stopPropagation(); clearSessionCell(i); });
  cap.append(flag, zspan, sep, dspan, sep2, tspan, rbtn, xbtn);
  cap.addEventListener('click', () => capClick(i));

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'cell-add';
  add.textContent = `+ ${t(lang, 'addZone')}`;
  add.addEventListener('click', () => openPickerFor(i));

  const clock = document.createElement('p');
  clock.className = 'clock';
  if (withIds) clock.id = 'clock';
  DIGIT_KIND.forEach((kind) => {
    const span = document.createElement('span');
    span.className = kind === 'ms' ? 'ms' : kind === 'sep' ? 'sep' : 'digit';
    clock.appendChild(span);
  });

  const { svg: dialSvg, hands } = makeDial();
  const dial = document.createElement('div');
  dial.className = 'dial';
  dial.appendChild(dialSvg);

  el.append(cap, add, clock, dial);
  return { el, cap, flag, zspan, dspan, tspan, rbtn, xbtn, sep, add, clock, dial, hands, prev: null, capKey: null };
}

function cellZone(i) {
  return i === 0 ? timeZone : cellZones[i];
}

function buildCells() {
  els.grid.textContent = '';
  els.grid.dataset.layout = layoutShape(layout).id;
  cells = [];
  for (let i = 0; i < layout; i++) {
    const cell = makeCell(i);
    els.grid.appendChild(cell.el);
    cells.push(cell);
  }
  refreshCellStates();
  fitClock();
}

function refreshCellStates() {
  cells.forEach((cell, i) => {
    const z = cellZone(i);
    cell.el.classList.toggle('unset', !z);
    cell.el.classList.toggle('timer', isTimer(z));
    cell.el.classList.toggle('stop', isStop(z));
    if (!z) { cell.prev = null; cell.capKey = null; }
  });
}

const durationLabel = (ms) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor(ms / 1000) % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s)}` : `${m}:${pad(s)}`;
};

function updateTimerCell(cell, tm, date) {
  const remaining = tm.running ? tm.endsAt - date.getTime() : tm.remaining;
  const doneAt = remaining <= 0;
  if (doneAt && tm.running) { tm.running = false; tm.remaining = 0; }
  const seg = timerSegments(remaining);
  const digits = segDigits(seg);
  for (let k = 0; k < digits.length; k++) {
    if (!cell.prev || cell.prev[k] !== digits[k]) cell.clock.children[k].textContent = digits[k];
  }
  cell.prev = digits;
  cell.el.classList.toggle('done', doneAt);
  cell.zspan.textContent = t(lang, 'timer');
  cell.dspan.textContent = durationLabel(tm.duration);
  cell.tspan.textContent = doneAt ? t(lang, 'done') : t(lang, tm.running ? 'running' : 'paused');
  if (document.documentElement.classList.contains('analog')) {
    const a = anglesFromSegments(seg);
    cell.hands.hour.setAttribute('transform', `rotate(${a.hour} 100 100)`);
    cell.hands.minute.setAttribute('transform', `rotate(${a.minute} 100 100)`);
    cell.hands.second.setAttribute('transform', `rotate(${a.second} 100 100)`);
    cell.hands.milli.setAttribute('transform', `rotate(${a.milli} 100 100)`);
  }
}

function updateStopCell(cell, st, date) {
  const seg = timerSegments(stopwatchElapsed(st, date.getTime()));
  const digits = segDigits(seg);
  for (let k = 0; k < digits.length; k++) {
    if (!cell.prev || cell.prev[k] !== digits[k]) cell.clock.children[k].textContent = digits[k];
  }
  cell.prev = digits;
  cell.zspan.textContent = t(lang, 'stopwatch');
  cell.dspan.textContent = durationLabel(stopwatchElapsed(st, date.getTime()));
  cell.tspan.textContent = t(lang, st.running ? 'running' : 'paused');
  if (document.documentElement.classList.contains('analog')) {
    const a = anglesFromSegments(seg);
    cell.hands.hour.setAttribute('transform', `rotate(${a.hour} 100 100)`);
    cell.hands.minute.setAttribute('transform', `rotate(${a.minute} 100 100)`);
    cell.hands.second.setAttribute('transform', `rotate(${a.second} 100 100)`);
    cell.hands.milli.setAttribute('transform', `rotate(${a.milli} 100 100)`);
  }
}

function updateZoneCell(cell, z, date, locale) {
  const digits = toDigits(date, z);
  for (let k = 0; k < digits.length; k++) {
    if (!cell.prev || cell.prev[k] !== digits[k]) cell.clock.children[k].textContent = digits[k];
  }
  cell.prev = digits;
  const key = `${z}|${Math.floor(date.getTime() / 60000)}`;
  if (key !== cell.capKey) {
    cell.capKey = key;
    cell.flag.src = flagSrc(z);
    cell.zspan.textContent = z;
    cell.dspan.textContent = formatDateLong(date, { timeZone: z, locale });
    cell.tspan.textContent = `${formatTimeShort(date, { timeZone: z, locale })} ${zoneInfo(date, z).abbr}`.trim();
  }
  /* analog hands live here too, so minis sweep exactly like the window */
  if (document.documentElement.classList.contains('analog')) {
    const a = handAngles(date, z);
    cell.hands.hour.setAttribute('transform', `rotate(${a.hour} 100 100)`);
    cell.hands.minute.setAttribute('transform', `rotate(${a.minute} 100 100)`);
    cell.hands.second.setAttribute('transform', `rotate(${a.second} 100 100)`);
    cell.hands.milli.setAttribute('transform', `rotate(${a.milli} 100 100)`);
  }
}

function updateCell(cell, i, date, locale) {
  const z = cellZone(i);
  if (!z) return;
  if (isTimer(z)) {
    const tm = timers.get(z.slice(6));
    if (tm) updateTimerCell(cell, tm, date);
    return;
  }
  if (isStop(z)) {
    const st = stops.get(z.slice(5));
    if (st) updateStopCell(cell, st, date);
    return;
  }
  updateZoneCell(cell, z, date, locale);
}

/** Keep every clock as large as its cell allows, on every resize/rotate. */
/* same calm sizing as fitClock, for one cell anywhere (SMate minis) —
   uses offset* so it is immune to the mini stage's CSS scale */
function fitCell(cell) {
  const w = cell.el.offsetWidth;
  const h = cell.el.offsetHeight;
  if (!w || !h) return;
  const capH = cell.cap.offsetHeight + 14;
  const size = Math.max(12, fitFontSize(w, h - capH, { padX: 24, padY: 8 }) * 0.88);
  cell.clock.style.fontSize = `${size}px`;
  const side = Math.max(96, Math.min(420, Math.floor((Math.min(w, h - capH) - 28) * 0.72)));
  cell.dial.style.width = `${side}px`;
  cell.dial.style.height = `${side}px`;
}

function fitClock() {
  for (const cell of cells) {
    const box = cell.el.getBoundingClientRect();
    const capH = (zenMode || layout > 1) ? cell.cap.offsetHeight + 14 : 0;
    /* 88% of the fitted size — leaves calm margins instead of
       edge-to-edge digits (and keeps the ms column off the cell border) */
    const size = Math.max(12, fitFontSize(box.width, box.height - capH, { padX: 24, padY: 8 }) * 0.88);
    cell.clock.style.fontSize = `${size}px`;
    /* same calm sizing as the digits: 88% of the fit, capped on big cells */
    const side = Math.max(96, Math.min(420, Math.floor((Math.min(box.width, box.height - capH) - 28) * 0.72)));
    cell.dial.style.width = `${side}px`;
    cell.dial.style.height = `${side}px`;
  }
}

function renderMeta(date) {
  const locale = langOf(lang).locale;
  const zone = zoneInfo(date, timeZone);
  els.dateLong.textContent = formatDateLong(date, { timeZone, locale });
  els.dateTime.textContent = `${formatTimeShort(date, { timeZone, locale })} ${zone.abbr}`;
  els.zoneText.textContent = `${zone.tz} · ${zone.utc}`;
  // picker button follows the selection
  els.tzFlag.src = flagSrc(zone.tz);
  els.tzLabel.textContent = cityOf(zone.tz);
}

/** Meta text only changes once a minute (or on zone change) — skip otherwise. */
function maybeRenderMeta(date) {
  const key = `${timeZone}|${Math.floor(date.getTime() / 60000)}`;
  if (key === lastMetaKey) return;
  lastMetaKey = key;
  renderMeta(date);
}

/* SMate minis ride the SAME frame + the SAME corrected date as the main
   cells, so their digits are always identical to what the window shows. */
const frameListeners = new Set();
export function onFrame(fn) { frameListeners.add(fn); return () => frameListeners.delete(fn); }

export function render(date) {
  const locale = langOf(lang).locale;
  const analog = document.documentElement.classList.contains('analog');
  cells.forEach((cell, i) => updateCell(cell, i, date, locale));
  if (frameListeners.size) {
    for (const fn of [...frameListeners]) { try { fn(date); } catch { /* a listener bug must never stop the clock */ } }
  }
  maybeRenderMeta(date);
  const progress = (date.getSeconds() * 1000 + date.getMilliseconds()) / 60000;
  els.secondFill.style.transform = `scaleX(${progress.toFixed(4)})`;
}

function refreshURL() {
  const u = new URL(location.href);
  const shape = layoutShape(layout).id;
  const zen = zenMode ? '&zen=1' : '';
  if (layout === 1) {
    u.search = `?tz=${encodeURIComponent(timeZone || 'UTC')}${zen}`;
  } else {
    const zones = Array.from({ length: layout }, (_, i) => (isSession(cellZone(i)) ? '' : cellZone(i) || ''));
    u.search = `?tz=${encodeURIComponent(timeZone || 'UTC')}&layout=${shape}`
      + `&zones=${zones.map((z) => encodeURIComponent(z)).join(',')}${zen}`;
  }
  history.replaceState(null, '', u);
}

function setTimeZone(tz, persist = true) {
  timeZone = tz || null;
  markMapSel();
  if (zenMode) cellZones[0] = timeZone;
  lastMetaKey = null;
  prev = null;
  if (persist && !zenMode) {
    try { localStorage.setItem('singhoah:tz', tz || ''); } catch { /* ignore */ }
  }
  refreshCellStates();
  persistLayout();
  refreshURL();
  if (window.__clock) render(window.__clock.now());
}

function setCellZone(i, z) {
  if (i === 0) { setTimeZone(z, !zenMode); return; }
  cellZones[i] = z;
  refreshCellStates();
  persistLayout();
  refreshURL();
  if (window.__clock) render(window.__clock.now());
}

function setLayout(n) {
  layout = n;
  const keep = [timeZone, ...cellZones.slice(1)];
  cellZones = Array.from({ length: n }, (_, i) => keep[i] ?? null);
  document.documentElement.classList.toggle('multi', n > 1);
  document.querySelectorAll('.lay-btn').forEach((b) =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.layout) === n)));
  buildCells();
  persistLayout();
  refreshURL();
}

/** Remember format + zones so a reload restores the window (main app only). */
function persistLayout() {
  if (zenMode) return;
  try {
    localStorage.setItem('singhoah:layout', String(layout));
    localStorage.setItem('singhoah:zones', JSON.stringify(cellZones.map((z) => (isSession(z) ? null : z))));
  } catch { /* ignore */ }
}

/** A countdown joins the current window exactly like a zone pane does. */
function addTimerToWindow(ms) {
  const id = `t${++timerSeq}`;
  const now = (window.__clock ? window.__clock.now() : new Date()).getTime();
  timers.set(id, { duration: ms, endsAt: now + ms, remaining: ms, running: true });
  const shown = Array.from({ length: layout }, (_, i) => cellZone(i));
  let slot = shown.indexOf(null);
  if (slot === -1 && layout < 16) {
    setLayout(nextLayout(layout));
    slot = Array.from({ length: layout }, (_, i) => cellZone(i)).indexOf(null);
  }
  if (slot === -1) slot = layout - 1;
  setCellZone(slot, `timer:${id}`);
}

/** The Stopwatch button drops a counting-up pane into the current window. */
function addStopwatchToWindow() {
  const id = `s${++stopSeq}`;
  const now = (window.__clock ? window.__clock.now() : new Date()).getTime();
  stops.set(id, { startedAt: now, accum: 0, running: true });
  const shown = Array.from({ length: layout }, (_, i) => cellZone(i));
  let slot = shown.indexOf(null);
  if (slot === -1 && layout < 16) {
    setLayout(nextLayout(layout));
    slot = Array.from({ length: layout }, (_, i) => cellZone(i)).indexOf(null);
  }
  if (slot === -1) slot = layout - 1;
  setCellZone(slot, `stop:${id}`);
}

function toggleStop(i, z) {
  const st = stops.get(z.slice(5));
  if (!st) return;
  const now = (window.__clock ? window.__clock.now() : new Date()).getTime();
  if (st.running) {
    st.accum = stopwatchElapsed(st, now);
    st.running = false;
  } else {
    st.startedAt = now;
    st.running = true;
  }
  if (window.__clock) render(window.__clock.now());
}

function resetStop(i) {
  const z = cellZone(i);
  if (!isStop(z)) return;
  const st = stops.get(z.slice(5));
  if (!st) return;
  const now = (window.__clock ? window.__clock.now() : new Date()).getTime();
  st.startedAt = now;
  st.accum = 0;
  if (window.__clock) render(window.__clock.now());
}

function toggleTimer(i, z) {
  const tm = timers.get(z.slice(6));
  if (!tm) return;
  const now = (window.__clock ? window.__clock.now() : new Date()).getTime();
  if (tm.running) {
    tm.remaining = Math.max(0, tm.endsAt - now);
    tm.running = false;
  } else if (tm.remaining > 0) {
    tm.endsAt = now + tm.remaining;
    tm.running = true;
  }
  if (window.__clock) render(window.__clock.now());
}

function clearSessionCell(i) {
  const z = cellZone(i);
  if (isTimer(z)) timers.delete(z.slice(6));
  if (isStop(z)) stops.delete(z.slice(5));
  setCellZone(i, null);
}

function capClick(i) {
  const z = cellZone(i);
  if (isTimer(z)) toggleTimer(i, z);
  else if (isStop(z)) toggleStop(i, z);
  else openPickerFor(i);
}

/** ⧉ on a picker row: the zone joins the current window — no new tabs.
    Fills the first empty cell, growing 1→2→4 when needed; a full 2×2
    replaces the last cell. */
function addZoneToWindow(z) {
  const shown = Array.from({ length: layout }, (_, i) => cellZone(i));
  if (shown.includes(z)) return;
  let slot = shown.indexOf(null);
  if (slot === -1 && layout < 16) {
    setLayout(nextLayout(layout));
    slot = Array.from({ length: layout }, (_, i) => cellZone(i)).indexOf(null);
  }
  if (slot === -1) slot = layout - 1;
  setCellZone(slot, z);
}

/** Speech engines never learn brand names — they hear "sing ho script" or
    "s mate". Map the mishearings back onto the Singho vocabulary.
    display=true keeps the surrounding casing (for transcripts); otherwise
    the whole string is lowercased + normalized (for command matching). */
function brandFix(s, display = false) {
  const RULES = [
    [/\bsing\s*(?:ho|how|hoh|hou)\s*(?:scribe|script|scrip)s?\b/g, 'SinghoScribe'],
    [/\bsing\s*(?:ho|how|hoh|hou)\s*wallets?\b/g, 'SinghoWallet'],
    [/\bsing\s*(?:ho|how|hoh|hou)\s*settings?\b/g, 'SinghoSettings'],
    [/\bsing\s*(?:ho|how|hoh|hou)\s*clocks?\b/g, 'SinghoClock'],
    [/\bsing\s*(?:ho|how|hoh|hou)(?:\s*(?:ahh|ah|a|ya|yah))?\b/g, 'SinghoClock'],
    [/(^|[^'\w])(?:s|es)\s*\.?\s*mates?\b/g, '$1SMate'],
    [/\bsmart\s*mates?\b/g, 'SMate'],
  ];
  let out = display ? s : s.toLowerCase();
  for (const [re, rep] of RULES) {
    out = out.replace(display ? new RegExp(re.source, 'gi') : re, display ? rep : rep.toLowerCase());
  }
  return display ? out : out.replace(/\s+/g, ' ').trim();
}

/** SMate drivers: delete panes / zones, and restart sessions — the same
    state transitions the UI performs, callable from the assistant. */
function smateRemove(what) {
  let n = 0;
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const z = cellZone(i);
    if (!z) continue;
    const hit = what === 'timer' ? isTimer(z) : what === 'stop' ? isStop(z) : z === what;
    if (hit) {
      clearSessionCell(i);
      n += 1;
      if (what !== 'timer' && what !== 'stop') break;
    }
  }
  if (window.__clock) render(window.__clock.now());
  return n;
}
function smateRestart(kind) {
  const now = (window.__clock ? window.__clock.now() : new Date()).getTime();
  let n = 0;
  if (kind === 'timer') {
    for (const tm of timers.values()) { tm.remaining = tm.duration; tm.endsAt = now + tm.duration; tm.running = true; n += 1; }
  } else {
    for (const st of stops.values()) { st.accum = 0; st.startedAt = now; st.running = true; n += 1; }
  }
  if (window.__clock) render(window.__clock.now());
  return n;
}

/** Clear all: drop every added zone/timer/stopwatch, back to one home clock. */
function clearWindow() {
  timers.clear();
  stops.clear();
  setLayout(1);
  if (window.__clock) render(window.__clock.now());
}

/** SMate driver: shape the window (optional) then pin zones to cells in order. */
function smateWindow(zones, wantLayout) {
  if (wantLayout && wantLayout !== layout) setLayout(wantLayout);
  if (Array.isArray(zones) && zones.length) {
    if (zones.length > layout) setLayout(zones.length <= 2 ? 2 : zones.length <= 4 ? 4 : 16);
    zones.forEach((z, i) => { if (z) setCellZone(i, z); });
  }
  refreshCellStates();
  if (window.__clock) render(window.__clock.now());
  return Array.from({ length: layout }, (_, i) => cellZone(i));
}

/* ---------------- language toggle ---------------- */

function applyLang(id, persist = true) {
  lang = langOf(id).id;
  const L = langOf(lang);
  document.documentElement.lang = L.locale;
  document.documentElement.dir = L.dir;
  els.dateLabel.textContent = t(lang, 'date');
  els.timeLabel.textContent = t(lang, 'time');
  els.winText.textContent = t(lang, 'window');
  els.btnWindow.title = t(lang, 'winTitle');
  els.timerText.textContent = t(lang, 'timer');
  els.btnTimer.title = t(lang, 'timer');
  els.stopText.textContent = t(lang, 'stopwatch');
  els.btnStop.title = t(lang, 'stopwatch');
  els.ipText.textContent = 'IP';
  els.btnIp.title = t(lang, 'ipTitle');
  els.lblMac.textContent = t(lang, 'mac');
  els.lblLoc.textContent = t(lang, 'location');
  els.lblCoord.textContent = t(lang, 'coords');
  els.ipUse.textContent = t(lang, 'useTz');
  if (!els.ipPop.hidden) { els.ipMac.textContent = t(lang, 'macNA'); renderIpPop(); }
  els.mapText.textContent = t(lang, 'map');
  els.btnMap.title = t(lang, 'map');
  if (els.launchText) els.launchText.textContent = t(lang, 'launchpad');
  els.btnLaunch.title = t(lang, 'launchpad');
  if (els.settingsText) els.settingsText.textContent = t(lang, 'settings');
  if (els.btnSettings) els.btnSettings.title = t(lang, 'settings');
  els.timerMinLabel.textContent = t(lang, 'minutes');
  els.timerStart.textContent = t(lang, 'start');
  document.querySelectorAll('.cap-x').forEach((b) => {
    b.title = t(lang, 'clear');
    b.setAttribute('aria-label', t(lang, 'clear'));
  });
  document.querySelectorAll('.tz-win').forEach((b) => {
    b.title = t(lang, 'winAdd');
    b.setAttribute('aria-label', t(lang, 'winAdd'));
  });
  els.resyncText.textContent = t(lang, 'resync');
  els.tzSearch.placeholder = t(lang, 'search');
  els.langFlag.src = ccFlag(L.flag);
  els.langLabel.textContent = lang === 'zh-Hant' ? '繁中' : lang.toUpperCase();
  els.langBtn.title = langTitleOf(lang);
  els.langList.setAttribute('aria-label', t(lang, 'language'));
  els.btnNight.title = t(lang, 'nightTitle');
  if (els.tzBtn) els.tzBtn.title = t(lang, 'tzTitle');
  if (els.btnMode) els.btnMode.title = t(lang, 'modeTitle');
  if (els.btnSync) els.btnSync.title = t(lang, 'resyncTitle');
  if (els.btnFull) { els.btnFull.title = t(lang, 'fullTitle'); els.btnFull.setAttribute('aria-label', t(lang, 'full')); }
  placeMapUi();
  document.querySelectorAll('.lay-btn').forEach((b) => {
    b.title = t(lang, Number(b.dataset.layout) === 2 ? 'side' : Number(b.dataset.layout) === 4 ? 'quad' : Number(b.dataset.layout) === 16 ? 'grid16' : 'single');
  });
  document.querySelectorAll('#winList .tz-row').forEach((r) => {
    const n = Number(r.dataset.layout);
    r.querySelector('.tz-city').textContent = t(lang, n === 2 ? 'side' : n === 4 ? 'quad' : n === 16 ? 'grid16' : 'single');
  });
  const wc = document.getElementById('winClear');
  if (wc) {
    wc.querySelector('.tz-city').textContent = t(lang, 'clearAll');
    wc.title = t(lang, 'clearAll');
  }
  cells.forEach((c) => { c.add.textContent = `+ ${t(lang, 'addZone')}`; });
  updateThemeBtn();
  updateModeBtn();
  lastMetaKey = null;
  prev = null;
  if (persist) {
    try { localStorage.setItem('singhoah:lang', lang); } catch { /* ignore */ }
  }
  renderSync();
  document.dispatchEvent(new CustomEvent('singhoah:lang'));
  if (window.__clock) render(window.__clock.now());
}

function buildLangPicker() {
  for (const L of LANGS) {
    const row = document.createElement('div');
    row.className = 'tz-row';
    row.setAttribute('role', 'option');
    row.dataset.lang = L.id;
    const img = document.createElement('img');
    img.className = 'flag';
    img.width = 20; img.height = 15; img.alt = '';
    img.src = ccFlag(L.flag);
    const name = document.createElement('span');
    name.className = 'tz-city';
    name.textContent = L.name;
    row.append(img, name);
    row.addEventListener('click', () => { applyLang(L.id); closeLangPop(); els.langBtn.focus(); });
    els.langList.appendChild(row);
  }
}

function openLangPop() {
  els.langPop.hidden = false;
  clampPop(els.langPop);
  els.langBtn.setAttribute('aria-expanded', 'true');
}
function closeLangPop() {
  if (els.langPop.hidden) return;
  els.langPop.hidden = true;
  els.langBtn.setAttribute('aria-expanded', 'false');
}

/* ---------------- the zone picker ---------------- */

function openPickerFor(i) {
  pickerCell = i;
  openPop();
}

function buildPicker() {
  const zones = allTimeZones();
  const now = new Date();
  const byRegion = new Map();
  for (const z of zones) {
    const r = regionOf(z);
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r).push(z);
  }
  const frag = document.createDocumentFragment();
  for (const [region, list] of byRegion) {
    /* each group lives in its own wrapper so the sticky title is released
       when the group scrolls past (flat siblings would stack forever) */
    const wrap = document.createElement('div');
    wrap.className = 'tz-groupwrap';
    const head = document.createElement('div');
    head.className = 'tz-group';
    head.textContent = region;
    wrap.appendChild(head);
    const entry = { el: wrap, rows: [] };
    for (const z of list) {
      const row = document.createElement('div');
      row.className = 'tz-row';
      row.setAttribute('role', 'option');
      row.dataset.zone = z;
      row.dataset.search = `${z} ${region} ${zoneCountry(z) || ''}`.toLowerCase();

      const img = document.createElement('img');
      img.className = 'flag';
      img.width = 20; img.height = 15; img.alt = '';
      img.src = flagSrc(z);
      row.appendChild(img);

      const city = document.createElement('span');
      city.className = 'tz-city';
      city.textContent = cityOf(z);
      row.appendChild(city);

      const off = document.createElement('span');
      off.className = 'tz-off';
      off.textContent = zoneInfo(now, z).utc.replace('UTC', '');
      row.appendChild(off);

      const win = document.createElement('button');
      win.type = 'button';
      win.className = 'tz-win';
      win.title = t(lang, 'winAdd');
      win.setAttribute('aria-label', t(lang, 'winAdd'));
      win.innerHTML = WIN_SVG;
      win.addEventListener('click', (e) => { e.stopPropagation(); addZoneToWindow(z); });
      row.appendChild(win);

      row.addEventListener('click', () => {
        if (pickerCell != null) setCellZone(pickerCell, z);
        else setTimeZone(z);
        pickerCell = null;
        closePop();
        els.tzBtn.focus();
      });

      wrap.appendChild(row);
      entry.rows.push(row);
      pickerRows.push(row);
    }
    frag.appendChild(wrap);
    pickerGroups.push(entry);
  }
  els.tzList.appendChild(frag);
}

function applyFilter(q) {
  const query = q.trim().toLowerCase();
  const underscored = query.replace(/\s+/g, '_'); // "new york" finds New_York
  for (const g of pickerGroups) {
    let visible = 0;
    for (const r of g.rows) {
      const match = !query || r.dataset.search.includes(query)
        || r.dataset.search.includes(underscored);
      const show = match && (!zoneWhitelist || zoneWhitelist.includes(r.dataset.zone));
      r.hidden = !show;
      if (show) visible++;
    }
    g.el.hidden = visible === 0;
  }
}

/** Dropdowns hang below their button on every viewport; on narrow screens
    nudge them sideways just enough to stay inside the viewport. */
function clampPop(pop) {
  pop.style.transform = '';
  const r = pop.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  let dx = 0;
  if (r.left < 8) dx = 8 - r.left;
  else if (r.right > vw - 8) dx = (vw - 8) - r.right;
  if (dx) pop.style.transform = `translateX(${dx}px)`;
}

function openPop() {
  els.tzPop.hidden = false;
  clampPop(els.tzPop);
  els.tzBtn.setAttribute('aria-expanded', 'true');
  els.tzSearch.value = '';
  applyFilter('');
  /* pin the region title at the top, active city flush just below it */
  const sel = timeZone
    ? els.tzList.querySelector(`.tz-row[data-zone="${timeZone}"]`)
    : null;
  const headEl = els.tzList.querySelector('.tz-group');
  const headH = headEl ? headEl.getBoundingClientRect().height : 0;
  if (sel && !sel.hidden) {
    const lr = els.tzList.getBoundingClientRect();
    els.tzList.scrollTop += sel.getBoundingClientRect().top - (lr.top + headH);
    /* snap to the boundary below the pinned title: no half-clipped rows */
    const line = els.tzList.getBoundingClientRect().top + headH;
    for (const el of els.tzList.querySelectorAll('.tz-row, .tz-group')) {
      const r = el.getBoundingClientRect();
      if (r.top < line - 0.5 && r.bottom > line + 0.5) {
        els.tzList.scrollTop += r.bottom - line;
        break;
      }
    }
  } else {
    els.tzList.scrollTop = 0;
  }
  els.tzSearch.focus();
}

function closePop() {
  if (els.tzPop.hidden) return;
  els.tzPop.hidden = true;
  els.tzBtn.setAttribute('aria-expanded', 'false');
  zoneWhitelist = null;
}

/* ---------------- extra windows (splitscreen & co.) ---------------- */

export function zoneWindowUrl(z, lay = 1, base = (typeof location !== 'undefined' ? location.href : 'index.html')) {
  const u = new URL(base);
  u.hash = '';
  if (lay === 1) {
    u.search = `?tz=${encodeURIComponent(z)}&zen=1`;
  } else {
    const shape = layoutShape(lay).id;
    const zones = Array.from({ length: lay }, (_, i) => (i === 0 ? z : ''));
    u.search = `?zen=1&layout=${shape}&zones=${zones.map((x) => encodeURIComponent(x)).join(',')}`;
  }
  return u.href;
}

/* ---------------- sync ---------------- */

function renderSync() {
  const st = syncStatus(syncResult, { lang });
  els.syncDot.dataset.level = st.level;
  els.syncText.textContent = st.label;
  els.syncDetail.textContent = st.detail;
  els.lastSync.textContent = syncResult && syncResult.at
    ? t(lang, 'lastCheck', { t: new Date(syncResult.at).toTimeString().slice(0, 8) })
    : t(lang, 'checking');
}

/* Sync history of precise samples -> fitted device drift rate, so the clock
   stays corrected between checks instead of only at each check. */
const syncHist = [];
globalThis.__SINGHOAH_SYNCHIST = syncHist;
function fitRate() {
  if (syncHist.length < 3) return 0;
  const span = syncHist[syncHist.length - 1].at - syncHist[0].at;
  if (span < 120 * 1000) return 0;
  const n = syncHist.length;
  const t0 = syncHist[0].at;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const pt of syncHist) {
    const x = pt.at - t0, y = pt.offset;
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  const den = n * sxx - sx * sx;
  if (!den) return 0;
  return Math.max(-5e-4, Math.min(5e-4, (n * sxy - sx * sy) / den));
}
const predictAt = (at) => {
  const last = syncHist[syncHist.length - 1];
  return last ? last.offset + fitRate() * (at - last.at) : 0;
};

let syncFails = 0;
let retryTimer = null;
let lastFullAt = 0;

/* full = 3-round calibration (boot, manual, wake, escalation);
   light = one quick round, every minute, forever. */
async function runSync(full = true) {
  if (syncing) return;
  syncing = true;
  if (full) {
    els.btnSync.disabled = true;
    els.btnSync.classList.add('is-busy');
    els.lastSync.textContent = t(lang, 'syncing');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const roundList = full ? [0, 1, 2] : [0];
  const rounds = roundList.map(async (i) => {
    if (i) await new Promise((r) => setTimeout(r, 120 * i));
    const results = await Promise.all(NTP_SOURCES.map((sr) => sampleNtp(sr, {
      fetch: (...ar) => fetch(...ar, { signal: controller.signal, cache: 'no-store' }),
    })));
    return pickNtpResult(results);
  });

  const picked = (await Promise.all(rounds)).filter(Boolean)
    .sort((a, b) => a.rtt - b.rtt)[0] || null;

  clearTimeout(timer);
  syncing = false;
  els.btnSync.disabled = false;
  els.btnSync.classList.remove('is-busy');

  if (picked) {
    syncFails = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (full) lastFullAt = Date.now();
    const predicted = predictAt(picked.at);
    if (picked.resolution === 'millisecond') {
      syncHist.push({ at: picked.at, offset: picked.offset });
      while (syncHist.length > 10) syncHist.shift();
      window.__clock.setSync(picked.offset, fitRate(), picked.at);
    } else if (full || Math.abs(picked.offset - predicted) > 1200) {
      /* second-resolution fallback: only trusted when nothing finer answers
         AND we are genuinely far off — its +-500 ms noise must not wobble us */
      window.__clock.setSync(picked.offset, 0, picked.at);
    }
    if (!full && Math.abs(picked.offset - predictAt(picked.at)) > 150) {
      setTimeout(() => runSync(true), 4000);   /* odd light check -> recalibrate */
    }
    syncResult = picked;
  } else {
    /* failed: retry on our own with backoff — the user never has to */
    syncFails += 1;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; runSync(true); },
      Math.min(60 * 1000, 10 * 1000 * 2 ** Math.min(syncFails, 3)));
  }
  renderSync();
  window.dispatchEvent(new CustomEvent('singhoah:sync', { detail: picked }));
}

/* ---------------- boot ---------------- */

let mapPaths = new Map();   // cc -> svg path
let zoneWhitelist = null;   // map-driven picker filter
let cityLayer = null;       // settlement labels group
let mapCities = [];         // decoded settlement rows

function buildMap() {
  const M = globalThis.__SINGHOAH_MAP;
  if (!M || !els.mapSvg) return;
  els.mapSvg.setAttribute('viewBox', `0 0 ${M.w} ${M.h}`);
  const NS = 'http://www.w3.org/2000/svg';
  const grat = document.createElementNS(NS, 'path');
  grat.setAttribute('d', M.grat);
  grat.setAttribute('class', 'map-grat');
  els.mapSvg.appendChild(grat);
  const ccZones = new Map();
  for (const z of allTimeZones()) {
    const cc = zoneCountry(z);
    if (!cc) continue;
    if (!ccZones.has(cc)) ccZones.set(cc, []);
    ccZones.get(cc).push(z);
  }
  globalThis.__SINGHOAH_CCZONES = ccZones;
  for (const [cc, d] of Object.entries(M.cc)) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'map-cc');
    p.dataset.cc = cc;
    const zs = ccZones.get(cc);
    if (!zs || !zs.length) p.classList.add('nozone');
    p.addEventListener('click', () => mapCountryClick(cc));
    els.mapSvg.appendChild(p);
    mapPaths.set(cc, p);
  }
  cityLayer = document.createElementNS(NS, 'g');
  cityLayer.setAttribute('id', 'mapCities');
  els.mapSvg.appendChild(cityLayer);
  mapCities = (M.cities || []).map(([x, y, n2, p2, s2, t2, c2]) => ({ x, y, n: n2, p: p2, s: s2 || '', t: t2 || null, c: !!c2 }));
}

function mapCountryClick(cc) {
  if (mapMoved) return;   /* that was a drag, not a pick */
  const zs = (globalThis.__SINGHOAH_CCZONES && globalThis.__SINGHOAH_CCZONES.get(cc)) || [];
  if (!zs.length) return;
  closeMap();
  if (zs.length === 1) setTimeZone(zs[0]);
  else { zoneWhitelist = zs; openPop(); }
}

function markMapSel() {
  if (!mapPaths.size) return;
  const cc = zoneCountry(timeZone);
  mapPaths.forEach((p, k) => p.classList.toggle('sel', k === cc));
}

/* the 10m geometry is heavy — it rides along on first map open, not page load */
let mapDataState = 0;
const mapWaiters = [];
function ensureMapData(done) {
  if (globalThis.__SINGHOAH_MAP) { done(); return; }
  mapWaiters.push(done);
  if (mapDataState === 1) return;
  mapDataState = 1;
  const s = document.createElement('script');
  s.src = 'mapdata.js';
  s.onload = () => {
    mapDataState = 2;
    buildMap();
    mapBase = { w: globalThis.__SINGHOAH_MAP.w, h: globalThis.__SINGHOAH_MAP.h };
    const q = mapWaiters.splice(0);
    for (const f of q) f();
  };
  s.onerror = () => { mapDataState = 0; mapWaiters.length = 0; closeMap(); };
  document.head.appendChild(s);
}

function openMap() {
  mapView = { k: 1, cx: (mapBase.w || 960) / 2, cy: (mapBase.h || 500) / 2 };
  if (mapBase.w) mapApply();
  ensureMapData(() => { mapApply(); markMapSel(); });
  /* the full-screen map closes any menu left floating above it */
  closePop();
  closeLangPop();
  els.winPop.hidden = true;
  els.timerPop.hidden = true;
  els.ipPop.hidden = true;
  els.mapWrap.hidden = false;
  els.btnMap.setAttribute('aria-pressed', 'true');
  placeMapUi();
  markMapSel();
}
/* keep the zoom/pan stack clear of the topbar even when it wraps to two rows */
function placeMapUi() {
  const mu = document.querySelector('.map-ui');
  const tb = document.querySelector('.topbar');
  if (mu && tb) mu.style.top = `${Math.round(tb.getBoundingClientRect().bottom + 12)}px`;
}
if (typeof addEventListener === 'function') addEventListener('resize', placeMapUi);
function closeMap() {
  if (els.mapWrap.hidden) return;
  els.mapWrap.hidden = true;
  els.btnMap.setAttribute('aria-pressed', 'false');
}

/* ---- settlements: Google-style labels. More appear as you zoom in,
       collisions are dropped biggest-first, text stays screen-sized, and
       the native script rides under the app-language name (Taipei / 臺北市). */
const CITY_TR_KEY = { 'zh-Hant': 'zht', hi: 'hi', es: 'es', fr: 'fr', ar: 'ar', bn: 'bn', ru: 'ru', pt: 'pt', ur: 'ur' };
function cityNameLang(c) {
  const key = CITY_TR_KEY[lang];
  if (key === 'zht') return (c.t && c.t.zht) || c.s || c.n;
  return (key && c.t && c.t[key]) || c.n;
}
let cityRaf = 0;
function scheduleCities() {
  if (cityRaf) return;
  cityRaf = requestAnimationFrame(() => { cityRaf = 0; mapDrawCities(); });
}
function mapDrawCities() {
  if (!cityLayer || !mapBase.w || els.mapWrap.hidden) return;
  const k = mapView.k, { w, h } = mapBase;
  const vw = w / k, vh = h / k;
  /* the element's letterbox overflow is visible too (portrait phones see
     whole extra latitude bands), so ask the screen CTM what is really on
     screen instead of assuming the viewBox rectangle */
  const rect = els.mapSvg.getBoundingClientRect();
  const ctm = els.mapSvg.getScreenCTM();
  let upx = vw / Math.max(1, rect.width);
  let vx0 = mapView.cx - vw / 2, vx1 = vx0 + vw;
  let vy0 = mapView.cy - vh / 2, vy1 = vy0 + vh;
  if (ctm && ctm.a) {
    upx = 1 / ctm.a;
    vx0 = (rect.left - ctm.e) / ctm.a;
    vx1 = (rect.right - ctm.e) / ctm.a;
    vy0 = (rect.top - ctm.f) / ctm.d;
    vy1 = (rect.bottom - ctm.f) / ctm.d;
  }
  const base = 11 * upx;                                 // 11px labels at any zoom
  const thresh = Math.max(1, 5000 / Math.pow(k, 3.5));   // pop (thousands) by zoom
  const cands = [];
  for (const c of mapCities) {
    if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
    if (c.p < thresh && !(c.c && k >= 2)) continue;
    cands.push(c);
  }
  cands.sort((a, b) => (b.c - a.c) || (b.p - a.p));
  const NS = 'http://www.w3.org/2000/svg';
  const frag = document.createDocumentFragment();
  /* street-map culling: labels never overlap. Bigger places claim their
     space first; the rest appear as you zoom in and room opens up — that
     is how every city gets shown without ever becoming soup. */
  const placed = [];
  for (const c of cands) {
    if (placed.length >= 90) break;
    const main = cityNameLang(c);
    const sub = k >= 5 && c.s && c.s !== main ? c.s : '';
    const wEst = Math.max(main.length, sub.length) * base * 0.62 + base * 0.8;
    const hEst = base * (sub ? 2.5 : 1.55);
    const rx = c.x - wEst / 2, ry = c.y + base * 0.35;
    let hit = false;
    for (const r of placed) {
      if (rx < r.x + r.w && rx + wEst > r.x && ry < r.y + r.h && ry + hEst > r.y) { hit = true; break; }
    }
    if (hit) continue;
    placed.push({ x: rx, y: ry, w: wEst, h: hEst });
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'map-city');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', c.x); dot.setAttribute('cy', c.y);
    dot.setAttribute('r', (1.1 * upx).toFixed(4));  /* 1.1 SCREEN px at every zoom — clamping in map units made discs swallow labels */
    g.appendChild(dot);
    /* labels may run off the viewport edge and clip there, street-map
       style — a pointer without its name reads as junk geometry */
    const tx = document.createElementNS(NS, 'text');
    tx.setAttribute('x', c.x); tx.setAttribute('y', c.y);
    tx.setAttribute('text-anchor', 'middle');
    tx.style.fontSize = `${base.toFixed(2)}px`;
    const t1 = document.createElementNS(NS, 'tspan');
    t1.setAttribute('x', c.x); t1.setAttribute('dy', (base * 1.2).toFixed(2));
    t1.textContent = main;
    tx.appendChild(t1);
    if (sub) {
      const t2 = document.createElementNS(NS, 'tspan');
      t2.setAttribute('x', c.x); t2.setAttribute('dy', (base * 0.95).toFixed(2));
      t2.setAttribute('class', 'map-city-sub');
      t2.textContent = sub;
      tx.appendChild(t2);
    }
    g.appendChild(tx);
    frag.appendChild(g);
  }
  cityLayer.textContent = '';
  cityLayer.appendChild(frag);
}
/* center the map on a named settlement — the picker behind "map Taipei" */
function mapGoCity(name) {
  const want = String(name || '')
    .toLowerCase()
    .replace(/\b(map|show|open|fly|to|of|the|me|please|city|town)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  openMap();
  ensureMapData(() => {
    if (!want) return;
    const c = mapCities.find((x) => x.n.toLowerCase() === want)
      || mapCities.find((x) => x.n.toLowerCase().startsWith(want) && want.length > 2)
      || mapCities.find((x) => want.length > 3 && want.includes(x.n.toLowerCase()))
      || mapCities.find((x) => (x.s && x.s.length > 1 && want.includes(x.s.toLowerCase()))
        || (x.t && Object.values(x.t).some((v) => v && want.includes(v.toLowerCase()))));
    if (!c) return;
    mapView.k = 8;
    mapView.cx = c.x; mapView.cy = c.y;
    mapApply();
  });
  return true;
}
if (typeof document !== 'undefined') document.addEventListener('singhoah:lang', scheduleCities);

/* ---- map tools: zoom, pan, live tooltip, close ---- */
let mapView = { k: 1, cx: 0, cy: 0 };
let mapBase = { w: 0, h: 0 };
let mapDrag = null;
let mapMoved = false;
let mapDN = null, mapDNL = '';

function ccName(cc) {
  const L = langOf(lang).locale;
  if (mapDNL !== L) { try { mapDN = new Intl.DisplayNames([L], { type: 'region' }); } catch { mapDN = null; } mapDNL = L; }
  try { return (mapDN && mapDN.of(cc)) || cc; } catch { return cc; }
}
function mapApply() {
  const { w, h } = mapBase;
  const k = mapView.k;
  const vw = w / k, vh = h / k;
  let x = mapView.cx - vw / 2, y = mapView.cy - vh / 2;
  x = Math.max(0, Math.min(w - vw, x));
  y = Math.max(0, Math.min(h - vh, y));
  mapView.cx = x + vw / 2; mapView.cy = y + vh / 2;
  els.mapSvg.setAttribute('viewBox', `${x} ${y} ${vw} ${vh}`);
  els.mapSvg.style.setProperty('--mapk', String(1 / k));   /* hairlines stay hairlines */
  scheduleCities();
}
/* Pointer events arrive far faster than frames (120-1000 Hz mice, touch);
   gesture-driven applies are coalesced to exactly one per animation frame
   so pan/pinch cost is constant at any refresh rate (60/90/120 Hz). */
let mapRaf = 0;
function mapApplySoon() {
  if (!mapRaf) mapRaf = requestAnimationFrame(() => { mapRaf = 0; mapApply(); });
}
function mapZoom(f, px, py) {
  const k2 = Math.max(1, Math.min(16, mapView.k * f));
  if (k2 === mapView.k) return;
  const { w, h } = mapBase;
  const vw = w / mapView.k, vh = h / mapView.k;
  const x = mapView.cx - vw / 2 + px * vw;
  const y = mapView.cy - vh / 2 + py * vh;
  mapView.k = k2;
  const vw2 = w / k2, vh2 = h / k2;
  mapView.cx = x - px * vw2 + vw2 / 2;
  mapView.cy = y - py * vh2 + vh2 / 2;
  mapApplySoon();
}
function mapTipShow(e, cc) {
  const tip = els.mapTip;
  const zs = (globalThis.__SINGHOAH_CCZONES && globalThis.__SINGHOAH_CCZONES.get(cc)) || [];
  let when = '';
  if (zs.length) {
    const now = window.__clock ? window.__clock.now() : new Date();
    const sg = toSegments(now, zs[0]);
    when = `${sg.hh}:${sg.mm} · ${zoneInfo(now, zs[0]).utc}`;
  }
  tip.innerHTML = '';
  const st = document.createElement('strong');
  st.textContent = ccName(cc);
  tip.appendChild(st);
  if (when) tip.appendChild(document.createTextNode(when));
  tip.hidden = false;
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
function initMapTools() {
  const svg = els.mapSvg;
  els.mapZoomIn.addEventListener('click', () => mapZoom(1.5, 0.5, 0.5));
  els.mapZoomOut.addEventListener('click', () => mapZoom(1 / 1.5, 0.5, 0.5));
  els.mapZoomReset.addEventListener('click', () => {
    mapView = { k: 1, cx: mapBase.w / 2, cy: mapBase.h / 2 };
    mapApply();
  });
  els.mapClose.addEventListener('click', closeMap);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    mapZoom(e.deltaY < 0 ? 1.6 : 0.625, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  svg.addEventListener('dblclick', (e) => {
    const r = svg.getBoundingClientRect();
    mapZoom(1.6, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  /* pan via window listeners (no setPointerCapture — it would retarget
     the click event to the svg and break country picking) */
  const ptrs = new Map();
  let pinch = null;
  const ptrDist = () => {
    const [a, b] = [...ptrs.values()];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, e);
    if (ptrs.size === 2) {
      mapDrag = null;
      pinch = { d0: ptrDist() || 1, k0: mapView.k };
      return;
    }
    mapDrag = { x: e.clientX, y: e.clientY, cx: mapView.cx, cy: mapView.cy, r: svg.getBoundingClientRect() };
    mapMoved = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, e);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const r = svg.getBoundingClientRect();
      const target = Math.max(1, Math.min(16, pinch.k0 * (ptrDist() / pinch.d0)));
      if (target !== mapView.k) {
        mapZoom(target / mapView.k,
          ((a.clientX + b.clientX) / 2 - r.left) / r.width,
          ((a.clientY + b.clientY) / 2 - r.top) / r.height);
      }
      return;
    }
    if (mapDrag && mapView.k > 1) {
      const r = mapDrag.r;
      const vw = mapBase.w / mapView.k, vh = mapBase.h / mapView.k;
      const dx = (e.clientX - mapDrag.x) / r.width * vw * 2;
      const dy = (e.clientY - mapDrag.y) / r.height * vh * 2;
      if (Math.abs(e.clientX - mapDrag.x) + Math.abs(e.clientY - mapDrag.y) > 2) mapMoved = true;
      mapView.cx = mapDrag.cx - dx;
      mapView.cy = mapDrag.cy - dy;
      mapApplySoon();
    }
  });
  const endDrag = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (mapDrag) { mapDrag = null; setTimeout(() => { mapMoved = false; }, 0); }
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointermove', (e) => {
    if (mapDrag) { els.mapTip.hidden = true; return; }
    const p = e.target.closest && e.target.closest('.map-cc');
    if (p && !p.classList.contains('nozone')) mapTipShow(e, p.dataset.cc);
    else els.mapTip.hidden = true;
  });
  svg.addEventListener('pointerleave', () => { els.mapTip.hidden = true; });
}

let ipInfo = null;

async function locateIp() {
  const sources = [
    // ipwho.is answers any origin (incl. file://); ipapi.co backs it up on http(s)
    {
      url: 'https://ipwho.is/',
      map: (j) => ({ ip: j.ip, cc: j.country_code, city: j.city, region: j.region, country: j.country, lat: j.latitude, lon: j.longitude, tz: j.timezone && j.timezone.id }),
    },
    {
      url: 'https://ipapi.co/json/',
      map: (j) => ({ ip: j.ip, cc: j.country_code, city: j.city, region: j.region, country: j.country_name, lat: j.latitude, lon: j.longitude, tz: j.timezone }),
    },
  ];
  for (const s of sources) {
    try {
      const r = await fetch(s.url, { cache: 'no-store' });
      if (!r.ok) continue;
      const d = s.map(await r.json());
      if (d && d.ip) return d;
    } catch { /* try next */ }
  }
  return null;
}

function renderIpPop() {
  if (!ipInfo) return;
  els.ipIp.textContent = ipInfo.ip;
  els.ipFlag.src = ccFlag(ipInfo.cc);
  els.ipLoc.textContent = [ipInfo.city, ipInfo.region, ipInfo.country].filter(Boolean).join(', ');
  els.ipCoord.textContent = `${Number(ipInfo.lat).toFixed(2)}, ${Number(ipInfo.lon).toFixed(2)}`;
  const ok = ipInfo.tz && allTimeZones().includes(ipInfo.tz);
  els.ipUse.hidden = !ok;
  if (ok) els.ipUse.dataset.tz = ipInfo.tz;
}

function openIpPop() {
  els.ipPop.hidden = false;
  clampPop(els.ipPop);
  els.ipMac.textContent = t(lang, 'macNA');
  if (ipInfo) renderIpPop();
  else {
    els.ipLoc.textContent = t(lang, 'locating');
    locateIp().then((d) => { ipInfo = d; if (!els.ipPop.hidden) renderIpPop(); });
  }
}

function buildTimerPop() {
  for (const m of [1, 5, 10, 25, 45, 60]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = m >= 60 ? '1:00:00' : `${m}:00`;
    b.addEventListener('click', () => {
      els.timerPop.hidden = true;
      addTimerToWindow(m * 60000);
    });
    els.timerPresets.appendChild(b);
  }
  els.timerStart.addEventListener('click', () => {
    const mins = parseFloat(els.timerMin.value);
    if (!Number.isFinite(mins) || mins <= 0) return;
    els.timerPop.hidden = true;
    addTimerToWindow(Math.round(mins * 60000));
  });
}

function buildWindowMenu() {
  for (const [n, icon] of [[1, LAY_ICONS[1]], [2, LAY_ICONS[2]], [4, LAY_ICONS[4]], [16, LAY_ICONS[16]]]) {
    const row = document.createElement('div');
    row.className = 'tz-row';
    row.setAttribute('role', 'option');
    row.dataset.layout = String(n);
    row.innerHTML = `${icon}<span class="tz-city"></span>`;
    row.addEventListener('click', () => {
      els.winPop.hidden = true;
      setLayout(n);
    });
    els.winList.appendChild(row);
  }
  const clr = document.createElement('button');
  clr.type = 'button';
  clr.className = 'btn tz-row win-clear';
  clr.id = 'winClear';
  clr.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span class="tz-city"></span>';
  clr.addEventListener('click', () => {
    els.winPop.hidden = true;
    clearWindow();
  });
  els.winPop.appendChild(clr);
}

function initUI() {
  grabElements();

  // URL beats storage beats system: ?tz=… lets each window run its own zone
  const params = new URLSearchParams(location.search);
  zenMode = params.has('zen');
  if (zenMode) document.documentElement.classList.add('zen');
  let savedLayout = 1;
  let savedZones = [];
  if (!zenMode) {
    try { savedLayout = parseLayout(localStorage.getItem('singhoah:layout')); } catch { /* ignore */ }
    try { savedZones = JSON.parse(localStorage.getItem('singhoah:zones') || '[]') || []; } catch { savedZones = []; }
  }
  const layParam = params.get('layout');
  layout = layParam != null ? parseLayout(layParam) : (zenMode ? 1 : savedLayout);
  const tzParam = params.get('tz');
  const zonesParam = (params.get('zones') || '').split(',').map((s) => decodeURIComponent(s.trim()));

  buildPicker();
  buildLangPicker();
  buildWindowMenu();
  buildTimerPop();
  initMapTools();

  const zones = allTimeZones();
  const system = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let saved = '';
  try { saved = localStorage.getItem('singhoah:tz') || ''; } catch { /* ignore */ }
  const first = zonesParam[0] && zones.includes(zonesParam[0]) ? zonesParam[0]
    : zones.includes(tzParam) ? tzParam
      : zones.includes(saved) ? saved : system;
  timeZone = first;
  cellZones = Array.from({ length: layout }, (_, i) => {
    if (i === 0) return first;
    if (zones.includes(zonesParam[i])) return zonesParam[i];
    if (!zenMode && typeof savedZones[i] === 'string' && zones.includes(savedZones[i])) return savedZones[i];
    return null;
  });

  setLayout(layout);
  /* SMate may have ordered a clear-all from another page */
  try {
    if (localStorage.getItem('singhoah:pendingClear')) {
      localStorage.removeItem('singhoah:pendingClear');
      clearWindow();
    }
    /* SMate may have shaped the window from another page */
    const pw = JSON.parse(localStorage.getItem('singhoah:pendingWin') || 'null');
    if (pw && (Array.isArray(pw.z) || typeof pw.l === 'number')) {
      localStorage.removeItem('singhoah:pendingWin');
      smateWindow(Array.isArray(pw.z) ? pw.z : [], typeof pw.l === 'number' ? pw.l : null);
    }
    /* …or ordered a mode, timer, stopwatch or map fly-to */
    const pmode = localStorage.getItem('singhoah:pendingMode');
    if (pmode) { localStorage.removeItem('singhoah:pendingMode'); setMode(pmode === 'analog'); }
    const ptm = JSON.parse(localStorage.getItem('singhoah:pendingTimer') || 'null');
    if (ptm && typeof ptm.m === 'number') {
      localStorage.removeItem('singhoah:pendingTimer');
      addTimerToWindow(Math.round(ptm.m * 60000));
      const c = [...document.querySelectorAll('.cell.timer')].pop();
      if (c) c.dataset.smateRun = '1';
    }
    const psp = JSON.parse(localStorage.getItem('singhoah:pendingStop') || 'null');
    if (psp) {
      localStorage.removeItem('singhoah:pendingStop');
      addStopwatchToWindow();
      const c = [...document.querySelectorAll('.cell.stop')].pop();
      if (c) c.dataset.smateRun = '1';
    }
    const pmap = JSON.parse(localStorage.getItem('singhoah:pendingMap') || 'null');
    if (pmap && typeof pmap.c === 'string') { localStorage.removeItem('singhoah:pendingMap'); mapGoCity(pmap.c); }
  } catch { /* ignore */ }

  let savedLang = '';
  try { savedLang = localStorage.getItem('singhoah:lang') || ''; } catch { /* ignore */ }
  applyLang(LANGS.some((l) => l.id === savedLang) ? savedLang : 'en', false);

  els.tzBtn.addEventListener('click', () => {
    if (els.tzPop.hidden) openPickerFor(zenMode ? 0 : null);
    else closePop();
  });
  els.tzSearch.addEventListener('input', () => applyFilter(els.tzSearch.value));
  els.langBtn.addEventListener('click', () => (els.langPop.hidden ? openLangPop() : closeLangPop()));
  els.btnWindow.addEventListener('click', () => {
    els.winPop.hidden = !els.winPop.hidden;
    if (!els.winPop.hidden) clampPop(els.winPop);
  });
  document.querySelectorAll('.lay-btn').forEach((b) =>
    b.addEventListener('click', () => setLayout(Number(b.dataset.layout))));
  document.addEventListener('pointerdown', (e) => {
    if (!els.tzPop.hidden && !e.target.closest('.tz')) closePop();
    if (!els.langPop.hidden && !e.target.closest('.lang')) closeLangPop();
    if (!els.winPop.hidden && !e.target.closest('.winmenu')) els.winPop.hidden = true;
    if (!els.timerPop.hidden && !e.target.closest('.timermenu')) els.timerPop.hidden = true;
    if (!els.ipPop.hidden && !e.target.closest('.ipmenu')) els.ipPop.hidden = true;
  });

  fitClock();
  new ResizeObserver(fitClock).observe(els.clockWrap);
  window.addEventListener('orientationchange', fitClock);

  window.__clock = new ClockCore({ onTick: render });

  const root = document.documentElement;
  els.btnNight.addEventListener('click', () => {
    root.classList.toggle('dark');
    const dark = root.classList.contains('dark');
    try { localStorage.setItem('singhoah:night', dark ? '1' : '0'); } catch { /* ignore */ }
    updateThemeBtn();
  });

  els.btnMode.addEventListener('click', () =>    setMode(!document.documentElement.classList.contains('analog')));
  els.btnTimer.addEventListener('click', () => {
    els.timerPop.hidden = !els.timerPop.hidden;
    if (!els.timerPop.hidden) clampPop(els.timerPop);
  });
  els.btnStop.addEventListener('click', addStopwatchToWindow);
  els.btnIp.addEventListener('click', () => {
    if (els.ipPop.hidden) openIpPop();
    else els.ipPop.hidden = true;
  });
  els.btnMap.addEventListener('click', () => (els.mapWrap.hidden ? openMap() : closeMap()));
  els.mapWrap.addEventListener('click', (e) => { if (e.target === els.mapWrap) closeMap(); });
  els.ipUse.addEventListener('click', () => {
    if (els.ipUse.dataset.tz) setTimeZone(els.ipUse.dataset.tz);
    els.ipPop.hidden = true;
  });

  els.btnSync.addEventListener('click', () => runSync(true));

  els.btnFull.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* ignore */ }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePop(); closeLangPop(); els.winPop.hidden = true; els.timerPop.hidden = true; els.ipPop.hidden = true; closeMap(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input,textarea,select')) return;
    if (e.key === 'n' || e.key === 'N') els.btnNight.click();
    if (e.key === 'a' || e.key === 'A') els.btnMode.click();
    if (e.key === 'f' || e.key === 'F') els.btnFull.click();
    if (e.key === 'r' || e.key === 'R') runSync(true);
  });

  // the <head> script applied the stored (or default-dark) scheme pre-paint
  updateThemeBtn();

  renderSync();
  lastFullAt = Date.now();
  runSync(true);
  setInterval(() => runSync(Date.now() - lastFullAt > 15 * 60 * 1000), 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !syncResult || !syncResult.at) return;
    if (Date.now() - syncResult.at > 60 * 1000) runSync(true);   /* woke up: recalibrate */
  });
}

/** Reusable anchored language picker (wallet & launchpad pages). */
export function makeLangPicker(btn, pop, list, onPick, wrapSel = '.langwrap') {
  for (const L of LANGS) {
    const row = document.createElement('div');
    row.className = 'tz-row';
    row.setAttribute('role', 'option');
    row.dataset.lang = L.id;
    const img = document.createElement('img');
    img.className = 'flag';
    img.alt = '';
    img.width = 20; img.height = 15;
    img.src = ccFlag(L.flag);
    const name = document.createElement('span');
    name.className = 'tz-city';
    name.textContent = L.name;
    row.append(img, name);
    row.addEventListener('click', () => { onPick(L.id); pop.hidden = true; });
    list.appendChild(row);
  }
  btn.addEventListener('click', () => { pop.hidden = !pop.hidden; if (!pop.hidden) clampPop(pop); });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !e.target.closest(wrapSel)) pop.hidden = true;
  });
}

/* shared library for the sibling apps (SinghoWallet, SinghoLaunch) */
/* common non-ISO names people type into the currency search */
const CUR_ALIAS = {
  TWD: 'NTD NT New Taiwan Dollar 新台幣 台幣',
  CNY: 'RMB Yuan 人民幣 元',
  GBP: 'Sterling UK Pound',
  JPY: 'Yen 日圓 日元',
  KRW: 'Won 韓圜',
  VND: 'Dong',
};
export const curAlias = (code) => (CUR_ALIAS[code] || '').toLowerCase();

globalThis.__SING_LIB = {
  LANGS, STRINGS, t, langOf, langTitleOf, pad, ccFlag, formatClock,
  toSegments, anglesFromSegments, makeDial,
  allTimeZones, cityOf, regionOf, zoneCountry, flagSrc, zoneInfo,
  curSymbol, curName, curFlag, CURRENCIES, curAlias,
  walBalance, walByDay, walMonthStats, walWeekSeries,
  makeLangPicker, clampPop,
  smateWindow, clearWindow, smateRemove, smateRestart, brandFix, mapGoCity,
  /* same builders the main window uses — SMate Action Blocks are true minis */
  buildCell: makeCell, updTimerCell: updateTimerCell, updStopCell: updateStopCell, updZoneCell: updateZoneCell, fitCell,
  /* the SAME corrected time the main window renders — minis stay in lockstep */
  coreNow: () => (window.__clock ? window.__clock.now() : new Date()),
  onFrame,
  timerAt: (i) => [...timers.values()][i] || null, stopAt: (i) => [...stops.values()][i] || null,
  /* live state views for SMate Action Blocks */
  timersView: () => [...timers.values()].map((t) => ({ d: t.duration, e: t.endsAt, r: t.remaining, on: t.running })),
  stopsView: () => [...stops.values()].map((s) => ({ s: s.startedAt, a: s.accum, on: s.running })),
  walPush(type, amt, note) {
    let w = null;
    try { w = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null'); } catch { /* ignore */ }
    w = w && Array.isArray(w.tx) ? w : { cur: 'USD', tx: [] };
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    w.tx.push({ id: `t${Date.now()}-sm`, type, amt, note: String(note || '').slice(0, 40), date, ts: Date.now() });
    try { localStorage.setItem('singhoah:wallet', JSON.stringify(w)); } catch { /* ignore */ }
    return { bal: walBalance(w.tx), cur: w.cur };
  },
};

if (typeof document !== 'undefined') {
  const boot = () => { if (document.getElementById('grid')) initUI(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
