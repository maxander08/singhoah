/* ============================================================
   Singhoah — core logic (runs in the browser *and* in node)
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

/* Ten of the world's most-spoken languages; the Chinese entry is
   Traditional Chinese, as flown by TW. Arabic and Urdu run RTL. */
export const LANGS = [
  { id: 'en', locale: 'en-GB', flag: 'GB', name: 'English', dir: 'ltr' },
  { id: 'zh-Hant', locale: 'zh-Hant-TW', flag: 'TW', name: '中文（繁體）', dir: 'ltr' },
  { id: 'hi', locale: 'hi-IN', flag: 'IN', name: 'हिन्दी', dir: 'ltr' },
  { id: 'es', locale: 'es-ES', flag: 'ES', name: 'Español', dir: 'ltr' },
  { id: 'fr', locale: 'fr-FR', flag: 'FR', name: 'Français', dir: 'ltr' },
  { id: 'ar', locale: 'ar', flag: 'SA', name: 'العربية', dir: 'rtl' },
  { id: 'bn', locale: 'bn', flag: 'BD', name: 'বাংলা', dir: 'ltr' },
  { id: 'ru', locale: 'ru-RU', flag: 'RU', name: 'Русский', dir: 'ltr' },
  { id: 'pt', locale: 'pt-BR', flag: 'BR', name: 'Português', dir: 'ltr' },
  { id: 'ur', locale: 'ur', flag: 'PK', name: 'اردو', dir: 'rtl' },
];

export const STRINGS = {
  en: {
    wallet: 'Wallet', walBalance: 'Balance', walExpense: 'Expense', walIncome: 'Income',
    walAmount: 'Amount', walNote: 'Note', walAdd: 'Add', walDays: 'Days', walReports: 'Reports',
    walSpent: 'Spent', walMonth: 'This month', walAvg: 'Daily average', walWeek: 'Last 7 days',
    walTop: 'Largest expense', walEmpty: 'No transactions yet', walCurrency: 'Currency symbol', walDelete: 'Delete entry', walCurSearch: 'Search currencies…', launchpad: 'Launchpad', lpClock: 'Clock', lpClockSub: 'Drift-corrected world clock', lpWalletSub: 'Balance, daily spending & reports', lpOffline: 'Offline single-file',
    date: 'Date', time: 'Time', window: 'Window', light: 'Light', night: 'Night Shift',
    resync: 'Re-sync', search: 'Search city or country…', language: 'Language',
    addZone: 'Add zone', single: 'Single', side: 'Side by side', quad: '2 × 2',
    winTitle: 'Window layout', winAdd: 'Add to this window',
    analog: 'Analog', digital: 'Digital',
    timer: 'Timer', start: 'Start', pause: 'Pause', resume: 'Resume', done: 'Done', running: 'running', paused: 'paused', minutes: 'Minutes', clear: 'Clear',
    stopwatch: 'Stopwatch', reset: 'Reset', ipTitle: 'IP locator', ipAddr: 'IP address', mac: 'MAC', location: 'Location', coords: 'Coordinates', useTz: 'Use this time zone', macNA: 'hidden by the browser', locating: 'locating…',
    map: 'Map',
    synced: 'Synced · {src}', corrected: 'Corrected · {src}',
    drift: 'device drift {mag} — corrected{res}',
    offLabel: 'System clock — reference unavailable', offDetail: 'no drift correction applied',
    lastCheck: 'last check {t}', syncing: 'syncing…', secondRes: ' · second resolution', checking: 'checking…',
  },
  'zh-Hant': {
    wallet: '錢包', walBalance: '餘額', walExpense: '支出', walIncome: '收入',
    walAmount: '金額', walNote: '備註', walAdd: '新增', walDays: '每日', walReports: '報表',
    walSpent: '已花費', walMonth: '本月', walAvg: '日均', walWeek: '最近 7 天',
    walTop: '最大支出', walEmpty: '尚無交易', walCurrency: '貨幣符號', walDelete: '刪除項目', walCurSearch: '搜尋貨幣…', launchpad: '啟動台', lpClock: '時鐘', lpClockSub: '漂移校正世界時鐘', lpWalletSub: '餘額、每日花費與報表', lpOffline: '離線單一檔案',
    date: '日期', time: '時間', window: '視窗', light: '淺色', night: '夜間模式',
    resync: '重新同步', search: '搜尋城市或國家…', language: '語言',
    addZone: '新增時區', single: '單一', side: '並排', quad: '2 × 2',
    winTitle: '視窗格式', winAdd: '加入此視窗',
    analog: '類比', digital: '數位',
    timer: '計時器', start: '開始', pause: '暫停', resume: '繼續', done: '完成', running: '運行中', paused: '已暫停', minutes: '分鐘', clear: '清除',
    stopwatch: '碼表', reset: '重置', ipTitle: 'IP 定位', ipAddr: 'IP 位址', mac: 'MAC', location: '位置', coords: '座標', useTz: '使用此時區', macNA: '瀏覽器不公開', locating: '定位中…',
    map: '地圖',
    synced: '已同步 · {src}', corrected: '已校正 · {src}',
    drift: '裝置漂移 {mag} — 已校正{res}',
    offLabel: '系統時鐘 — 無可用時間來源', offDetail: '未套用漂移校正',
    lastCheck: '上次檢查 {t}', syncing: '同步中…', secondRes: ' · 秒級解析度', checking: '檢查中…',
  },
  hi: {
    wallet: 'वॉलेट', walBalance: 'बैलेंस', walExpense: 'ख़र्च', walIncome: 'आय',
    walAmount: 'राशि', walNote: 'नोट', walAdd: 'जोड़ें', walDays: 'दिन', walReports: 'रिपोर्ट',
    walSpent: 'ख़र्च हुआ', walMonth: 'इस माह', walAvg: 'दैनिक औसत', walWeek: 'पिछले 7 दिन',
    walTop: 'सबसे बड़ा ख़र्च', walEmpty: 'अभी कोई लेन-देन नहीं', walCurrency: 'मुद्रा चिन्ह', walDelete: 'हटाएँ', walCurSearch: 'मुद्राएँ खोजें…', launchpad: 'लॉन्चपैड', lpClock: 'घड़ी', lpClockSub: 'ड्रिफ्ट-सुधारी विश्व घड़ी', lpWalletSub: 'बैलेंस, दैनिक ख़र्च और रिपोर्ट', lpOffline: 'ऑफ़लाइन एकल फ़ाइल',
    date: 'तिथि', time: 'समय', window: 'विंडो', light: 'लाइट', night: 'नाइट शिफ्ट',
    resync: 'री-सिंक', search: 'शहर या देश खोजें…', language: 'भाषा',
    addZone: 'ज़ोन जोड़ें', single: 'एकल', side: 'साथ-साथ', quad: '2 × 2',
    winTitle: 'विंडो लेआउट', winAdd: 'इस विंडो में जोड़ें',
    analog: 'एनालॉग', digital: 'डिजिटल',
    timer: 'टाइमर', start: 'शुरू', pause: 'रोकें', resume: 'जारी', done: 'हो गया', running: 'चल रहा', paused: 'रुका', minutes: 'मिनट', clear: 'हटाएँ',
    stopwatch: 'स्टॉपवॉच', reset: 'रीसेट', ipTitle: 'IP लोकेटर', ipAddr: 'IP पता', mac: 'MAC', location: 'स्थान', coords: 'निर्देशांक', useTz: 'यह समयक्षेत्र उपयोग करें', macNA: 'ब्राउज़र नहीं बताता', locating: 'पता लगा रहे हैं…',
    map: 'नक्शा',
    synced: 'सिंक हुआ · {src}', corrected: 'समायोजित · {src}',
    drift: 'डिवाइस ड्रिफ्ट {mag} — समायोजित{res}',
    offLabel: 'सिस्टम घड़ी — संदर्भ अनुपलब्ध', offDetail: 'कोई ड्रिफ्ट सुधार लागू नहीं',
    lastCheck: 'अंतिम जाँच {t}', syncing: 'सिंक हो रहा है…', secondRes: ' · सेकंड रिज़ॉल्यूशन', checking: 'जाँच हो रही है…',
  },
  es: {
    wallet: 'Cartera', walBalance: 'Saldo', walExpense: 'Gasto', walIncome: 'Ingreso',
    walAmount: 'Importe', walNote: 'Nota', walAdd: 'Añadir', walDays: 'Días', walReports: 'Informes',
    walSpent: 'Gastado', walMonth: 'Este mes', walAvg: 'Media diaria', walWeek: 'Últimos 7 días',
    walTop: 'Mayor gasto', walEmpty: 'Sin movimientos aún', walCurrency: 'Símbolo de moneda', walDelete: 'Eliminar entrada', walCurSearch: 'Buscar divisas…', launchpad: 'Launchpad', lpClock: 'Reloj', lpClockSub: 'Reloj mundial con deriva corregida', lpWalletSub: 'Saldo, gasto diario e informes', lpOffline: 'Un solo archivo sin conexión',
    date: 'Fecha', time: 'Hora', window: 'Ventana', light: 'Claro', night: 'Turno de noche',
    resync: 'Resincronizar', search: 'Buscar ciudad o país…', language: 'Idioma',
    addZone: 'Añadir zona', single: 'Único', side: 'Lado a lado', quad: '2 × 2',
    winTitle: 'Formato de ventana', winAdd: 'Añadir a esta ventana',
    analog: 'Analógico', digital: 'Digital',
    timer: 'Temporizador', start: 'Iniciar', pause: 'Pausa', resume: 'Seguir', done: 'Listo', running: 'en marcha', paused: 'en pausa', minutes: 'Minutos', clear: 'Quitar',
    stopwatch: 'Cronómetro', reset: 'Reiniciar', ipTitle: 'Localizador IP', ipAddr: 'Dirección IP', mac: 'MAC', location: 'Ubicación', coords: 'Coordenadas', useTz: 'Usar esta zona', macNA: 'oculta por el navegador', locating: 'localizando…',
    map: 'Mapa',
    synced: 'Sincronizado · {src}', corrected: 'Corregido · {src}',
    drift: 'deriva del dispositivo {mag} — corregida{res}',
    offLabel: 'Reloj del sistema — referencia no disponible', offDetail: 'sin corrección de deriva',
    lastCheck: 'última comprobación {t}', syncing: 'sincronizando…', secondRes: ' · resolución de segundos', checking: 'comprobando…',
  },
  fr: {
    wallet: 'Portefeuille', walBalance: 'Solde', walExpense: 'Dépense', walIncome: 'Revenu',
    walAmount: 'Montant', walNote: 'Note', walAdd: 'Ajouter', walDays: 'Jours', walReports: 'Rapports',
    walSpent: 'Dépensé', walMonth: 'Ce mois-ci', walAvg: 'Moyenne quotidienne', walWeek: '7 derniers jours',
    walTop: 'Plus grosse dépense', walEmpty: 'Aucune transaction', walCurrency: 'Symbole de devise', walDelete: 'Supprimer l’entrée', walCurSearch: 'Rechercher une devise…', launchpad: 'Launchpad', lpClock: 'Horloge', lpClockSub: 'Horloge mondiale corrigée de la dérive', lpWalletSub: 'Solde, dépenses du jour et rapports', lpOffline: 'Fichier unique hors ligne',
    date: 'Date', time: 'Heure', window: 'Fenêtre', light: 'Clair', night: 'Mode nuit',
    resync: 'Resynchroniser', search: 'Rechercher une ville ou un pays…', language: 'Langue',
    addZone: 'Ajouter un fuseau', single: 'Seul', side: 'Côte à côte', quad: '2 × 2',
    winTitle: 'Format de fenêtre', winAdd: 'Ajouter à cette fenêtre',
    analog: 'Analogique', digital: 'Numérique',
    timer: 'Minuteur', start: 'Démarrer', pause: 'Pause', resume: 'Reprendre', done: 'Terminé', running: 'en cours', paused: 'en pause', minutes: 'Minutes', clear: 'Retirer',
    stopwatch: 'Chrono', reset: 'Réinitialiser', ipTitle: 'Localisation IP', ipAddr: 'Adresse IP', mac: 'MAC', location: 'Position', coords: 'Coordonnées', useTz: 'Utiliser ce fuseau', macNA: 'masquée par le navigateur', locating: 'localisation…',
    map: 'Carte',
    synced: 'Synchronisé · {src}', corrected: 'Corrigé · {src}',
    drift: 'dérive de l’appareil {mag} — corrigée{res}',
    offLabel: 'Horloge système — référence indisponible', offDetail: 'aucune correction de dérive',
    lastCheck: 'dernier contrôle {t}', syncing: 'synchronisation…', secondRes: ' · résolution à la seconde', checking: 'contrôle…',
  },
  ar: {
    wallet: 'المحفظة', walBalance: 'الرصيد', walExpense: 'مصروف', walIncome: 'دخل',
    walAmount: 'المبلغ', walNote: 'ملاحظة', walAdd: 'أضف', walDays: 'الأيام', walReports: 'التقارير',
    walSpent: 'أُنفق', walMonth: 'هذا الشهر', walAvg: 'المتوسط اليومي', walWeek: 'آخر 7 أيام',
    walTop: 'أكبر مصروف', walEmpty: 'لا معاملات بعد', walCurrency: 'رمز العملة', walDelete: 'حذف الإدخال', walCurSearch: 'ابحث عن العملات…', launchpad: 'منصة الإطلاق', lpClock: 'الساعة', lpClockSub: 'ساعة عالمية مصحَّحة الانحراف', lpWalletSub: 'الرصيد والمصروفات اليومية والتقارير', lpOffline: 'ملف واحد دون اتصال',
    date: 'التاريخ', time: 'الوقت', window: 'نافذة', light: 'فاتح', night: 'الوضع الليلي',
    resync: 'إعادة المزامنة', search: 'ابحث عن مدينة أو دولة…', language: 'اللغة',
    addZone: 'أضف منطقة', single: 'واحدة', side: 'جنباً إلى جنب', quad: '2 × 2',
    winTitle: 'تنسيق النافذة', winAdd: 'أضف إلى هذه النافذة',
    analog: 'تناظري', digital: 'رقمي',
    timer: 'مؤقت', start: 'ابدأ', pause: 'إيقاف مؤقت', resume: 'استئناف', done: 'انتهى', running: 'جارٍ', paused: 'متوقف مؤقتاً', minutes: 'دقائق', clear: 'إزالة',
    stopwatch: 'ساعة إيقاف', reset: 'تصفير', ipTitle: 'محدد IP', ipAddr: 'عنوان IP', mac: 'MAC', location: 'الموقع', coords: 'الإحداثيات', useTz: 'استخدم هذه المنطقة', macNA: 'يخفيها المتصفح', locating: 'جارٍ التحديد…',
    map: 'خريطة',
    synced: 'متزامن · {src}', corrected: 'مصَحَّح · {src}',
    drift: 'انحراف الجهاز {mag} — مصحَّح{res}',
    offLabel: 'ساعة النظام — لا مرجع متاح', offDetail: 'دون تصحيح للانحراف',
    lastCheck: 'آخر فحص {t}', syncing: 'جارٍ المزامنة…', secondRes: ' · دقة بالثواني', checking: 'جارٍ الفحص…',
  },
  bn: {
    wallet: 'ওয়ালেট', walBalance: 'ব্যালেন্স', walExpense: 'খরচ', walIncome: 'আয়',
    walAmount: 'পরিমাণ', walNote: 'নোট', walAdd: 'যোগ', walDays: 'দিন', walReports: 'রিপোর্ট',
    walSpent: 'খরচ হয়েছে', walMonth: 'এই মাস', walAvg: 'দৈনিক গড়', walWeek: 'শেষ ৭ দিন',
    walTop: 'সবচেয়ে বড় খরচ', walEmpty: 'এখনও কোনো লেনদেন নেই', walCurrency: 'মুদ্রা চিহ্ন', walDelete: 'মুছুন', walCurSearch: 'মুদ্রা খুঁজুন…', launchpad: 'লঞ্চপ্যাড', lpClock: 'ঘড়ি', lpClockSub: 'ড্রিফট-সংশোধিত বিশ্বঘড়ি', lpWalletSub: 'ব্যালেন্স, দৈনিক খরচ ও রিপোর্ট', lpOffline: 'অফলাইন একক ফাইল',
    date: 'তারিখ', time: 'সময়', window: 'উইন্ডো', light: 'লাইট', night: 'নাইট শিফ্ট',
    resync: 'রি-সিঙ্ক', search: 'শহর বা দেশ খুঁজুন…', language: 'ভাষা',
    addZone: 'অঞ্চল যোগ করুন', single: 'একক', side: 'পাশাপাশি', quad: '2 × 2',
    winTitle: 'উইন্ডো বিন্যাস', winAdd: 'এই উইন্ডোতে যোগ করুন',
    analog: 'অ্যানালগ', digital: 'ডিজিটল',
    timer: 'টাইমার', start: 'শুরু', pause: 'বিরতি', resume: 'চালু', done: 'হয়ে গেছে', running: 'চলছে', paused: 'বিরাম', minutes: 'মিনিট', clear: 'সরান',
    stopwatch: 'স্টপওয়াচ', reset: 'রিসেট', ipTitle: 'IP লোকেটর', ipAddr: 'IP ঠিকানা', mac: 'MAC', location: 'অবস্থান', coords: 'স্থানাঙ্ক', useTz: 'এই টাইমজোন ব্যবহার করুন', macNA: 'ব্রাউজার লুকিয়ে রাখে', locating: 'খোঁজা হচ্ছে…',
    map: 'মানচিত্র',
    synced: 'সিঙ্ক হয়েছে · {src}', corrected: 'সংশোধিত · {src}',
    drift: 'ডিভাইস ড্রিফ্ট {mag} — সংশোধিত{res}',
    offLabel: 'সিস্টেম ঘড়ি — রেফারেন্স নেই', offDetail: 'ড্রিফ্ট সংশোধন প্রযোজ্য নয়',
    lastCheck: 'সর্বশেষ যাচাই {t}', syncing: 'সিঙ্ক হচ্ছে…', secondRes: ' · সেকেন্ড রেজোলিউশন', checking: 'যাচাই হচ্ছে…',
  },
  ru: {
    wallet: 'Кошелёк', walBalance: 'Баланс', walExpense: 'Расход', walIncome: 'Доход',
    walAmount: 'Сумма', walNote: 'Заметка', walAdd: 'Добавить', walDays: 'Дни', walReports: 'Отчёты',
    walSpent: 'Потрачено', walMonth: 'В этом месяце', walAvg: 'Среднее в день', walWeek: 'Последние 7 дней',
    walTop: 'Крупнейшая трата', walEmpty: 'Пока нет операций', walCurrency: 'Символ валюты', walDelete: 'Удалить запись', walCurSearch: 'Поиск валюты…', launchpad: 'Лаунчпад', lpClock: 'Часы', lpClockSub: 'Всемирные часы с коррекцией дрейфа', lpWalletSub: 'Баланс, расходы по дням и отчёты', lpOffline: 'Офлайн одним файлом',
    date: 'Дата', time: 'Время', window: 'Окно', light: 'Светлая', night: 'Ночной режим',
    resync: 'Синхронизировать', search: 'Поиск города или страны…', language: 'Язык',
    addZone: 'Добавить пояс', single: 'Один', side: 'Рядом', quad: '2 × 2',
    winTitle: 'Формат окна', winAdd: 'Добавить в это окно',
    analog: 'Аналоговый', digital: 'Цифровой',
    timer: 'Таймер', start: 'Старт', pause: 'Пауза', resume: 'Продолжить', done: 'Готово', running: 'идёт', paused: 'пауза', minutes: 'Минуты', clear: 'Убрать',
    stopwatch: 'Секундомер', reset: 'Сброс', ipTitle: 'IP-локатор', ipAddr: 'IP-адрес', mac: 'MAC', location: 'Местоположение', coords: 'Координаты', useTz: 'Этот часовой пояс', macNA: 'скрыт браузером', locating: 'определение…',
    map: 'Карта',
    synced: 'Синхронизировано · {src}', corrected: 'Скорректировано · {src}',
    drift: 'дрейф устройства {mag} — скорректировано{res}',
    offLabel: 'Системные часы — эталон недоступен', offDetail: 'коррекция дрейфа не применяется',
    lastCheck: 'последняя проверка {t}', syncing: 'синхронизация…', secondRes: ' · точность до секунды', checking: 'проверка…',
  },
  pt: {
    wallet: 'Carteira', walBalance: 'Saldo', walExpense: 'Despesa', walIncome: 'Receita',
    walAmount: 'Valor', walNote: 'Nota', walAdd: 'Adicionar', walDays: 'Dias', walReports: 'Relatórios',
    walSpent: 'Gasto', walMonth: 'Este mês', walAvg: 'Média diária', walWeek: 'Últimos 7 dias',
    walTop: 'Maior gasto', walEmpty: 'Sem transações ainda', walCurrency: 'Símbolo de moeda', walDelete: 'Excluir entrada', walCurSearch: 'Buscar moedas…', launchpad: 'Launchpad', lpClock: 'Relógio', lpClockSub: 'Relógio mundial com deriva corrigida', lpWalletSub: 'Saldo, gastos diários e relatórios', lpOffline: 'Arquivo único off-line',
    date: 'Data', time: 'Hora', window: 'Janela', light: 'Claro', night: 'Modo noturno',
    resync: 'Ressincronizar', search: 'Buscar cidade ou país…', language: 'Idioma',
    addZone: 'Adicionar fuso', single: 'Único', side: 'Lado a lado', quad: '2 × 2',
    winTitle: 'Formato da janela', winAdd: 'Adicionar a esta janela',
    analog: 'Analógico', digital: 'Digital',
    timer: 'Timer', start: 'Iniciar', pause: 'Pausa', resume: 'Retomar', done: 'Pronto', running: 'correndo', paused: 'pausado', minutes: 'Minutos', clear: 'Remover',
    stopwatch: 'Cronômetro', reset: 'Reiniciar', ipTitle: 'Localizador IP', ipAddr: 'Endereço IP', mac: 'MAC', location: 'Localização', coords: 'Coordenadas', useTz: 'Usar este fuso', macNA: 'oculto pelo navegador', locating: 'localizando…',
    map: 'Mapa',
    synced: 'Sincronizado · {src}', corrected: 'Corrigido · {src}',
    drift: 'deriva do dispositivo {mag} — corrigida{res}',
    offLabel: 'Relógio do sistema — referência indisponível', offDetail: 'sem correção de deriva',
    lastCheck: 'última verificação {t}', syncing: 'sincronizando…', secondRes: ' · resolução de segundos', checking: 'verificando…',
  },
  ur: {
    wallet: 'والٹ', walBalance: 'بیلنس', walExpense: 'خرچ', walIncome: 'آمدنی',
    walAmount: 'رقم', walNote: 'نوٹ', walAdd: 'شامل کریں', walDays: 'دن', walReports: 'رپورٹس',
    walSpent: 'خرچ ہوا', walMonth: 'اس مہینے', walAvg: 'یومیہ اوسط', walWeek: 'پچھلے 7 دن',
    walTop: 'سب سے بڑا خرچ', walEmpty: 'ابھی کوئی لین دین نہیں', walCurrency: 'کرنسی کا نشان', walDelete: 'اندراج حذف کریں', walCurSearch: 'کرنسی تلاش کریں…', launchpad: 'لائنچ پیڈ', lpClock: 'گھڑی', lpClockSub: 'ڈرفٹ درست شدہ عالمی گھڑی', lpWalletSub: 'بیلنس، یومیہ خرچ اور رپورٹس', lpOffline: 'آف لائن سنگل فائل',
    date: 'تاریخ', time: 'وقت', window: 'ونڈو', light: 'ہلکا', night: 'نائٹ موڈ',
    resync: 'دوبارہ سنک', search: 'شہر یا ملک تلاش کریں…', language: 'زبان',
    addZone: 'زون شامل کریں', single: 'واحد', side: 'بہ پہلو', quad: '2 × 2',
    winTitle: 'ونڈو فارمیٹ', winAdd: 'اس ونڈو میں شامل کریں',
    analog: 'انالاگ', digital: 'ڈیجیٹل',
    timer: 'ٹائمر', start: 'شروع', pause: 'روکیں', resume: 'جاری', done: 'ہو گیا', running: 'جاری ہے', paused: 'موقوف', minutes: 'منٹ', clear: 'ہٹائیں',
    stopwatch: 'اسٹاپ واچ', reset: 'ری سیٹ', ipTitle: 'IP لوکیٹر', ipAddr: 'IP پتہ', mac: 'MAC', location: 'مقام', coords: 'کوآرڈینیٹس', useTz: 'یہ ٹائم زون استعمال کریں', macNA: 'براؤزر چھپاتا ہے', locating: 'تلاش جاری…',
    map: 'نقشہ',
    synced: 'ہم آہنگ · {src}', corrected: 'درست · {src}',
    drift: 'ڈیوائس ڈرفٹ {mag} — درست{res}',
    offLabel: 'سسٹم گھڑی — ماخذ دستیاب نہیں', offDetail: 'کوئی ڈرفٹ اصلاح لاگو نہیں',
    lastCheck: 'آخری معائنہ {t}', syncing: 'سنک ہو رہا ہے…', secondRes: ' · سیکنڈ ریزولیوشن', checking: 'معائنہ ہو رہا ہے…',
  },
};

/** Tiny formatter: t('es', 'synced', { src: 'x' }) -> 'Sincronizado · x' */
export function t(lang, key, vars = {}) {
  const table = STRINGS[lang] || STRINGS.en;
  const raw = table[key] ?? STRINGS.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

export const langOf = (id) => LANGS.find((l) => l.id === id) || LANGS[0];

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

/** '2'/'1x2' -> 2 (side by side), '2x2'/'4' -> 4 (grid), anything else -> 1 */
export function parseLayout(v) {
  if (v === '2' || v === '1x2' || v === '2x1') return 2;
  if (v === '4' || v === '2x2') return 4;
  return 1;
}

export const layoutShape = (n) =>
  n === 2 ? { rows: 1, cols: 2, id: '2' }
    : n === 4 ? { rows: 2, cols: 2, id: '2x2' }
      : { rows: 1, cols: 1, id: '1' };

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
    this._running = false;
    this.start();
  }

  get running() { return this._running; }

  /** Time the display should show: local system time, drift-corrected. */
  now() { return new Date(this.nowFn() + this.offset); }

  setOffset(ms) {
    this.offset = Number.isFinite(ms) ? Math.round(ms) : 0;
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
    'btnLaunch', 'launchText',
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
}

/** Keep every clock as large as its cell allows, on every resize/rotate. */
function fitClock() {
  for (const cell of cells) {
    const box = cell.el.getBoundingClientRect();
    const capH = (zenMode || layout > 1) ? cell.cap.offsetHeight + 14 : 0;
    const size = fitFontSize(box.width, box.height - capH, { padX: 24, padY: 8 });
    cell.clock.style.fontSize = `${size}px`;
    const side = Math.max(96, Math.floor(Math.min(box.width, box.height - capH) - 28));
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

export function render(date) {
  const locale = langOf(lang).locale;
  const analog = document.documentElement.classList.contains('analog');
  cells.forEach((cell, i) => {
    updateCell(cell, i, date, locale);
    if (analog && cellZone(i) && !isSession(cellZone(i))) {
      const a = handAngles(date, cellZone(i));
      cell.hands.hour.setAttribute('transform', `rotate(${a.hour} 100 100)`);
      cell.hands.minute.setAttribute('transform', `rotate(${a.minute} 100 100)`);
      cell.hands.second.setAttribute('transform', `rotate(${a.second} 100 100)`);
      cell.hands.milli.setAttribute('transform', `rotate(${a.milli} 100 100)`);
    }
  });
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
  if (slot === -1 && layout < 4) {
    setLayout(layout === 1 ? 2 : 4);
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
  if (slot === -1 && layout < 4) {
    setLayout(layout === 1 ? 2 : 4);
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
  if (slot === -1 && layout < 4) {
    setLayout(layout === 1 ? 2 : 4);
    slot = Array.from({ length: layout }, (_, i) => cellZone(i)).indexOf(null);
  }
  if (slot === -1) slot = layout - 1;
  setCellZone(slot, z);
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
  els.launchText.textContent = t(lang, 'launchpad');
  els.btnLaunch.title = t(lang, 'launchpad');
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
  document.querySelectorAll('.lay-btn').forEach((b) => {
    b.title = t(lang, Number(b.dataset.layout) === 2 ? 'side' : Number(b.dataset.layout) === 4 ? 'quad' : 'single');
  });
  document.querySelectorAll('#winList .tz-row').forEach((r) => {
    const n = Number(r.dataset.layout);
    r.querySelector('.tz-city').textContent = t(lang, n === 2 ? 'side' : n === 4 ? 'quad' : 'single');
  });
  cells.forEach((c) => { c.add.textContent = `+ ${t(lang, 'addZone')}`; });
  updateThemeBtn();
  updateModeBtn();
  lastMetaKey = null;
  prev = null;
  if (persist) {
    try { localStorage.setItem('singhoah:lang', lang); } catch { /* ignore */ }
  }
  renderSync();
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
    const head = document.createElement('div');
    head.className = 'tz-group';
    head.textContent = region;
    frag.appendChild(head);
    const entry = { el: head, rows: [] };
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

      frag.appendChild(row);
      entry.rows.push(row);
      pickerRows.push(row);
    }
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

async function runSync() {
  if (syncing) return;
  syncing = true;
  els.btnSync.disabled = true;
  els.btnSync.classList.add('is-busy');
  els.lastSync.textContent = t(lang, 'syncing');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const rounds = [0, 1, 2].map(async (i) => {
    if (i) await new Promise((r) => setTimeout(r, 120 * i));
    const results = await Promise.all(NTP_SOURCES.map((s) => sampleNtp(s, {
      fetch: (...a) => fetch(...a, { signal: controller.signal, cache: 'no-store' }),
    })));
    return pickNtpResult(results);
  });

  const picked = (await Promise.all(rounds)).filter(Boolean)
    .sort((a, b) => a.rtt - b.rtt)[0] || null;

  clearTimeout(timer);
  syncing = false;
  els.btnSync.disabled = false;
  els.btnSync.classList.remove('is-busy');

  syncResult = picked;
  if (picked) window.__clock.setOffset(picked.offset);
  renderSync();
  window.dispatchEvent(new CustomEvent('singhoah:sync', { detail: picked }));
}

/* ---------------- boot ---------------- */

let mapPaths = new Map();   // cc -> svg path
let zoneWhitelist = null;   // map-driven picker filter

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
}

function mapCountryClick(cc) {
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

function openMap() {
  /* the full-screen map closes any menu left floating above it */
  closePop();
  closeLangPop();
  els.winPop.hidden = true;
  els.timerPop.hidden = true;
  els.ipPop.hidden = true;
  els.mapWrap.hidden = false;
  els.btnMap.setAttribute('aria-pressed', 'true');
  markMapSel();
}
function closeMap() {
  if (els.mapWrap.hidden) return;
  els.mapWrap.hidden = true;
  els.btnMap.setAttribute('aria-pressed', 'false');
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
  for (const [n, icon] of [[1, LAY_ICONS[1]], [2, LAY_ICONS[2]], [4, LAY_ICONS[4]]]) {
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
  buildMap();

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

  els.btnSync.addEventListener('click', runSync);

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
    if (e.key === 'r' || e.key === 'R') runSync();
  });

  // the <head> script applied the stored (or default-dark) scheme pre-paint
  updateThemeBtn();

  renderSync();
  runSync();
  setInterval(runSync, 5 * 60 * 1000);
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
globalThis.__SING_LIB = {
  LANGS, STRINGS, t, langOf, pad, ccFlag,
  curSymbol, curName, curFlag, CURRENCIES,
  walBalance, walByDay, walMonthStats, walWeekSeries,
  makeLangPicker, clampPop,
};

if (typeof document !== 'undefined') {
  const boot = () => { if (document.getElementById('grid')) initUI(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
