/* ============================================================
   SinghoWallet — the wallet as its own app.
   Shares the design system, the translations and the stored
   ledger (singhoah:wallet) with the Singhoah clock.
   ============================================================ */
const LIB = globalThis.__SING_LIB;
const {
  LANGS, t, langOf, pad, ccFlag,
  curSymbol, curName, curFlag, CURRENCIES, curAlias,
  walBalance, walByDay, walMonthStats, walWeekSeries,
  makeLangPicker,
} = LIB;

const els = {};
for (const id of [
  'langBtn', 'langFlag', 'langLabel', 'langPop', 'langList', 'btnNight', 'nightText',
  'launchText', 'btnLaunch', 'clockText', 'btnClock',
  'walBal', 'walBalLabel', 'walCurBtn', 'walForm', 'walTypeOut', 'walTypeIn',
  'walAmt', 'walAmtSym', 'walAmtLabel', 'walDateBtn', 'walDateLabel', 'walNote', 'walNoteLabel',
  'walAddBtn', 'walCal', 'walTabD', 'walTabR', 'walDaysBox', 'walRepBox', 'walCurBox',
  'btnSettings', 'settingsText',
]) els[id] = document.getElementById(id);

let lang = 'en';
let wallet = { cur: 'USD', tx: [] };
let walType = 'out';
let walTab = 'days';
let walPrevTab = 'days';
let walCurQuery = '';
let walDateVal = null;
let calView = null;
let walSeq = 0;

/* ---------------- storage ---------------- */

function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null');
    if (w && Array.isArray(w.tx)) {
      return {
        cur: typeof w.cur === 'string' && w.cur.trim()
          ? (w.cur.trim() === '$' ? 'USD' : w.cur.trim())
          : 'USD',
        tx: w.tx.filter((x) => x && (x.type === 'in' || x.type === 'out') && Number.isFinite(x.amt)),
      };
    }
  } catch { /* ignore */ }
  return { cur: 'USD', tx: [] };
}
function saveWallet() { try { localStorage.setItem('singhoah:wallet', JSON.stringify(wallet)); } catch { /* ignore */ } }

/* ---------------- formatting ---------------- */

const walToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const walEsc = (v) => String(v ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtMoney(v) {
  const n = new Intl.NumberFormat(langOf(lang).locale, { maximumFractionDigits: 2 }).format(Math.abs(v));
  return `${v < 0 ? '−' : ''}${curSymbol(wallet.cur, langOf(lang).locale)}${n}`;
}

function walDateLabel(ymd) {
  try {
    return new Intl.DateTimeFormat(langOf(lang).locale,
      { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${ymd}T00:00:00`));
  } catch { return ymd; }
}

/* ---------------- rendering ---------------- */

function weekChartSVG(series) {
  const max = Math.max(...series.map((x) => x.spent), 1);
  const bw = 320 / 7;
  const fmt = new Intl.DateTimeFormat(langOf(lang).locale, { weekday: 'narrow' });
  let inner = '';
  series.forEach((x, i) => {
    const h = x.spent > 0 ? Math.max(3, Math.round((x.spent / max) * 78)) : 1;
    inner += `<rect class="wal-bar${i === 6 ? ' now' : ''}" x="${(i * bw + bw * 0.22).toFixed(1)}" y="${92 - h}" width="${(bw * 0.56).toFixed(1)}" height="${h}" rx="1.5"/>`;
    inner += `<text x="${(i * bw + bw / 2).toFixed(1)}" y="106">${fmt.format(new Date(`${x.date}T00:00:00`))}</text>`;
  });
  return `<svg class="wal-chart" viewBox="0 0 320 110" aria-hidden="true">${inner}</svg>`;
}

function renderCurList() {
  if (!document.getElementById('curSearch')) {
    els.walCurBox.innerHTML = `
      <input id="curSearch" class="wal-cur-search" type="search" autocomplete="off"
        placeholder="${walEsc(t(lang, 'walCurSearch'))}" aria-label="${walEsc(t(lang, 'walCurSearch'))}">
      <div class="tz-list wal-cur-list" id="curList" role="listbox"></div>`;
  }
  document.getElementById('curSearch').placeholder = t(lang, 'walCurSearch');
  const q = walCurQuery.trim().toLowerCase();
  const rows = CURRENCIES
    .filter(([code]) => !q
      || code.toLowerCase().includes(q)
      || curSymbol(code, langOf(lang).locale).toLowerCase().includes(q)
      || curName(code, lang).toLowerCase().includes(q)
      || curAlias(code).includes(q))
    .map(([code]) => `
      <div class="tz-row cur-row${code === wallet.cur ? ' sel-cur' : ''}" role="option" data-code="${code}">
        <img class="flag" alt="" src="${curFlag(code)}">
        <span class="tz-city">${walEsc(curName(code, lang))}</span>
        <span class="tz-off">${walEsc(curSymbol(code, langOf(lang).locale))} · ${code}</span>
      </div>`)
    .join('');
  document.getElementById('curList').innerHTML = rows || `<p class="wal-empty">${t(lang, 'walEmpty')}</p>`;
}

function renderCal() {
  const L = langOf(lang).locale;
  const { y, m } = calView;
  const first = new Date(y, m, 1);
  const lead = first.getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const dimPrev = new Date(y, m, 0).getDate();
  const monthLbl = new Intl.DateTimeFormat(L, { month: 'long', year: 'numeric' }).format(first);
  const dows = [...Array(7)].map((_, i) =>
    new Intl.DateTimeFormat(L, { weekday: 'narrow' }).format(new Date(2023, 0, 1 + i)));
  const today = walToday();
  const sel = walDateVal;
  let cells = dows.map((d) => `<span class="dow">${d}</span>`).join('');
  for (let i = 0; i < lead; i++) {
    cells += `<button type="button" class="wal-cal-day dim" tabindex="-1">${dimPrev - lead + 1 + i}</button>`;
  }
  for (let d = 1; d <= dim; d++) {
    const ymd = `${y}-${pad(m + 1)}-${pad(d)}`;
    const cls = `wal-cal-day${ymd === sel ? ' sel' : ''}${ymd === today ? ' today' : ''}`;
    cells += `<button type="button" class="${cls}" data-date="${ymd}">${d}</button>`;
  }
  els.walCal.innerHTML = `
    <div class="wal-cal-head">
      <button type="button" class="wal-cal-nav" data-d="-1" aria-label="‹">‹</button>
      <strong>${monthLbl}</strong>
      <button type="button" class="wal-cal-nav" data-d="1" aria-label="›">›</button>
    </div>
    <div class="wal-cal-grid">${cells}</div>`;
}

function renderWallet() {
  els.walBal.textContent = fmtMoney(walBalance(wallet.tx));
  els.walCurBtn.innerHTML = `<img class="flag" alt="" src="${curFlag(wallet.cur)}"><span>${wallet.cur}</span><span class="tz-off">${walEsc(curSymbol(wallet.cur, langOf(lang).locale))}</span>`;
  els.walAmtSym.textContent = curSymbol(wallet.cur, langOf(lang).locale);
  els.walDateBtn.textContent = walDateLabel(walDateVal || walToday());
  els.walDaysBox.hidden = walTab !== 'days';
  els.walRepBox.hidden = walTab !== 'reports';
  els.walCurBox.hidden = walTab !== 'cur';
  if (walTab === 'cur') { renderCurList(); return; }
  const box = walTab === 'days' ? els.walDaysBox : els.walRepBox;
  if (!wallet.tx.length) { box.innerHTML = `<p class="wal-empty">${t(lang, 'walEmpty')}</p>`; return; }
  if (walTab === 'days') {
    const days = [...walByDay(wallet.tx).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    box.innerHTML = days.map(([ymd, d]) => {
      const items = [...d.items].sort((a, b) => (a.ts || 0) < (b.ts || 0) ? 1 : -1).map((x) => `
        <div class="wal-item">
          <span class="wal-note">${walEsc(x.note) || t(lang, x.type === 'in' ? 'walIncome' : 'walExpense')}</span>
          <span class="wal-amt ${x.type}">${x.type === 'in' ? '+' : '−'}${fmtMoney(x.amt)}</span>
          <button type="button" class="wal-x" data-id="${x.id}" title="${walEsc(t(lang, 'walDelete'))}" aria-label="${walEsc(t(lang, 'walDelete'))}">×</button>
        </div>`).join('');
      const right = d.spent > 0 ? `${t(lang, 'walSpent')} ${fmtMoney(d.spent)}` : `+${fmtMoney(d.income)}`;
      return `<div class="wal-day"><div class="wal-day-h"><span>${walDateLabel(ymd)}</span><span>${right}</span></div>${items}</div>`;
    }).join('');
  } else {
    const st = walMonthStats(wallet.tx, walToday());
    box.innerHTML = `
      <div class="wal-cards">
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walSpent')} · ${t(lang, 'walMonth')}</p><strong>${fmtMoney(st.spent)}</strong></div>
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walIncome')} · ${t(lang, 'walMonth')}</p><strong>${fmtMoney(st.income)}</strong></div>
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walAvg')}</p><strong>${fmtMoney(st.avg)}</strong></div>
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walTop')}</p><strong>${st.top ? walEsc(`${st.top.note ? `${st.top.note} · ` : ''}${fmtMoney(st.top.amt)}`) : '—'}</strong></div>
      </div>
      <p class="wal-lbl wal-week-lbl">${t(lang, 'walWeek')}</p>
      ${weekChartSVG(walWeekSeries(wallet.tx, walToday()))}`;
  }
}

function setWalType(v) {
  walType = v;
  els.walTypeOut.setAttribute('aria-pressed', String(v === 'out'));
  els.walTypeIn.setAttribute('aria-pressed', String(v === 'in'));
}
function setWalTab(v) {
  if (walTab === 'cur' && v !== 'cur') walCurQuery = '';
  els.walCal.hidden = true;
  walTab = v;
  els.walTabD.setAttribute('aria-pressed', String(v === 'days'));
  els.walTabR.setAttribute('aria-pressed', String(v === 'reports'));
  renderWallet();
}

/* ---------------- language + theme ---------------- */

function applyLang(id, persist = true) {
  lang = langOf(id).id;
  const L = langOf(lang);
  document.documentElement.lang = L.locale;
  document.documentElement.dir = L.dir;
  els.langFlag.src = ccFlag(L.flag);
  els.langLabel.textContent = lang === 'zh-Hant' ? '繁中' : lang.toUpperCase();
  els.walBalLabel.textContent = t(lang, 'walBalance');
  els.walTypeOut.textContent = t(lang, 'walExpense');
  els.walTypeIn.textContent = t(lang, 'walIncome');
  els.walAmtLabel.textContent = t(lang, 'walAmount');
  els.walNoteLabel.textContent = t(lang, 'walNote');
  els.walDateLabel.textContent = t(lang, 'date');
  els.walAddBtn.textContent = t(lang, 'walAdd');
  els.walTabD.textContent = t(lang, 'walDays');
  els.walTabR.textContent = t(lang, 'walReports');
  els.walCurBtn.title = t(lang, 'walCurrency');
  els.walCurBtn.setAttribute('aria-label', t(lang, 'walCurrency'));
  els.launchText.textContent = t(lang, 'launchpad');
  els.btnLaunch.title = t(lang, 'launchpad');
  els.clockText.textContent = t(lang, 'lpClock');
  els.btnClock.title = t(lang, 'lpClock');
  if (els.settingsText) els.settingsText.textContent = t(lang, 'settings');
  if (els.btnSettings) els.btnSettings.title = t(lang, 'settings');
  updateThemeBtn();
  renderWallet();
  if (!els.walCal.hidden) renderCal();
  if (persist) { try { localStorage.setItem('singhoah:lang', lang); } catch { /* ignore */ } }
  document.dispatchEvent(new CustomEvent('singhoah:lang'));
}

function updateThemeBtn() {
  const dark = document.documentElement.classList.contains('dark');
  els.nightText.textContent = t(lang, dark ? 'light' : 'night');
  els.btnNight.setAttribute('aria-pressed', String(dark));
}

/* ---------------- boot ---------------- */

function init() {
  wallet = loadWallet();

  let savedLang = '';
  try { savedLang = localStorage.getItem('singhoah:lang') || ''; } catch { /* ignore */ }
  applyLang(LANGS.some((l) => l.id === savedLang) ? savedLang : 'en', false);

  makeLangPicker(els.langBtn, els.langPop, els.langList, (id) => applyLang(id), '.langwrap');

  els.btnNight.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const dark = document.documentElement.classList.contains('dark');
    try { localStorage.setItem('singhoah:night', dark ? '1' : '0'); } catch { /* ignore */ }
    updateThemeBtn();
  });

  els.walForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amt = Math.round(parseFloat(String(els.walAmt.value).replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      els.walAmt.classList.add('bad');
      setTimeout(() => els.walAmt.classList.remove('bad'), 600);
      return;
    }
    const date = walDateVal || walToday();
    wallet.tx.push({
      id: `t${Date.now()}-${walSeq++}`, type: walType, amt,
      note: els.walNote.value.trim().slice(0, 40), date, ts: Date.now(),
    });
    saveWallet();
    els.walAmt.value = '';
    els.walNote.value = '';
    renderWallet();
  });
  els.walTypeOut.addEventListener('click', () => setWalType('out'));
  els.walTypeIn.addEventListener('click', () => setWalType('in'));
  els.walTabD.addEventListener('click', () => setWalTab('days'));
  els.walTabR.addEventListener('click', () => setWalTab('reports'));

  els.walCurBtn.addEventListener('click', () => {
    if (walTab === 'cur') setWalTab(walPrevTab || 'days');
    else { walPrevTab = walTab; setWalTab('cur'); }
  });
  els.walCurBox.addEventListener('input', (e) => {
    if (e.target.id === 'curSearch') { walCurQuery = e.target.value; renderCurList(); }
  });

  els.walDateBtn.addEventListener('click', () => {
    if (els.walCal.hidden) {
      const [y, m] = (walDateVal || walToday()).split('-').map(Number);
      calView = { y, m: m - 1 };
      els.walCal.hidden = false;
      renderCal();
    } else els.walCal.hidden = true;
  });
  els.walCal.addEventListener('click', (e) => {
    const nav = e.target.closest('.wal-cal-nav');
    if (nav) {
      calView.m += Number(nav.dataset.d);
      if (calView.m < 0) { calView.m = 11; calView.y--; }
      if (calView.m > 11) { calView.m = 0; calView.y++; }
      renderCal();
      return;
    }
    const day = e.target.closest('.wal-cal-day');
    if (day && day.dataset.date) {
      walDateVal = day.dataset.date;
      els.walCal.hidden = true;
      els.walDateBtn.textContent = walDateLabel(walDateVal);
    }
  });

  document.querySelector('.wal-panel').addEventListener('click', (e) => {
    const row = e.target.closest('.cur-row');
    if (row) {
      wallet.cur = row.dataset.code;
      saveWallet();
      setWalTab(walPrevTab || 'days');
      return;
    }
    const x = e.target.closest('.wal-x');
    if (x) {
      wallet.tx = wallet.tx.filter((w) => w.id !== x.dataset.id);
      saveWallet();
      renderWallet();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { els.walCal.hidden = true; els.langPop.hidden = true; }
  });

  renderWallet();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
