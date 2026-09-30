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
  makeLangPicker, langTitleOf,
} = LIB;

const els = {};
for (const id of [
  'langBtn', 'langFlag', 'langLabel', 'langPop', 'langList', 'btnNight', 'nightText',
  'launchText', 'btnLaunch', 'clockText', 'btnClock',
  'walBal', 'walBalLabel', 'walCurBtn', 'walForm', 'walTypeOut', 'walTypeIn',
  'walAmt', 'walAmtSym', 'walAmtLabel', 'walDateBtn', 'walDateLabel', 'walNote', 'walNoteLabel',
  'walAddBtn', 'walCal', 'walTabD', 'walTabR', 'walTabC', 'walDaysBox', 'walRepBox', 'walCashBox', 'walCurBox',
  'btnSettings', 'settingsText',
]) els[id] = document.getElementById(id);

let lang = 'en';
let wallet = { cur: 'USD', tx: [] };
let walType = 'out';
let walTab = 'days';
let walPrevTab = 'days';
let walCurQuery = '';
let repPeriod = 'week';
let repOff = 0;
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
  els.walCashBox.hidden = walTab !== 'cash';
  els.walCurBox.hidden = walTab !== 'cur';
  if (walTab === 'cur') { renderCurList(); return; }
  if (walTab === 'cash') { renderCash(); return; }
  const box = walTab === 'days' ? els.walDaysBox : els.walRepBox;
  if (walTab === 'days' && !wallet.tx.length) { box.innerHTML = `<p class="wal-empty">${t(lang, 'walEmpty')}</p>`; return; }
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
    const r = repCompute();
    const spent = r.spent.reduce((x, y) => x + y, 0);
    const income = r.income.reduce((x, y) => x + y, 0);
    const net = income - spent;
    const PERIODS = [['day', 'pDay'], ['week', 'pWeek'], ['month', 'pMonth'],
      ['semester', 'pSem'], ['year', 'pYear'], ['decade', 'pDec']];
    box.innerHTML = `
      <div class="wal-seg wal-seg6" role="group" aria-label="${walEsc(t(lang, 'walReports'))}">
        ${PERIODS.map(([id, k]) => `<button type="button" data-rep="${id}" aria-pressed="${id === repPeriod}">${t(lang, k)}</button>`).join('')}
      </div>
      <div class="wal-repbar">
        <button type="button" class="wal-cal-nav" data-repoff="-1" aria-label="‹">‹</button>
        <strong>${walEsc(r.title)}</strong>
        <button type="button" class="wal-cal-nav" data-repoff="1" aria-label="›">›</button>
      </div>
      <div class="wal-cards">
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walSpent')}</p><strong>${fmtMoney(spent)}</strong></div>
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walIncome')}</p><strong>${fmtMoney(income)}</strong></div>
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walNet')}</p><strong>${net < 0 ? '−' : '+'}${fmtMoney(net).replace('−', '')}</strong></div>
        <div class="wal-card"><p class="wal-lbl">${t(lang, 'walTop')}</p><strong>${r.top ? walEsc(`${r.top.note ? `${r.top.note} · ` : ''}${fmtMoney(r.top.amt)}`) : '—'}</strong></div>
      </div>
      <p class="wal-lbl wal-week-lbl"><span class="lg"></span>${t(lang, 'walSpent')}<span class="lg in"></span>${t(lang, 'walIncome')}</p>
      ${repChartSVG(r)}`;
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
  els.walTabC.setAttribute('aria-pressed', String(v === 'cash'));
  renderWallet();
}


/* ---------------- reports: day / week / month / semester / year / decade ---------------- */

function repCompute() {
  const L = langOf(lang).locale;
  const now = new Date();
  const tx = wallet.tx;
  const out = { labels: [], spent: [], income: [], title: '', top: null, nowIdx: -1 };
  const mk = (n) => { out.spent = Array(n).fill(0); out.income = Array(n).fill(0); out.labels = Array(n).fill(''); };
  const addTx = (i, x) => {
    if (x.type === 'out') { out.spent[i] += x.amt; if (!out.top || x.amt > out.top.amt) out.top = x; }
    else out.income[i] += x.amt;
  };
  const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (repPeriod === 'day') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + repOff);
    mk(24);
    const hf = new Intl.DateTimeFormat(L, { hour: 'numeric' });
    for (let h = 0; h < 24; h++) out.labels[h] = hf.format(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 30));
    out.title = new Intl.DateTimeFormat(L, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    const ymd = ymdOf(d);
    tx.forEach((x) => { if (x.date === ymd) addTx(new Date(x.ts || 0).getHours(), x); });
    if (repOff === 0) out.nowIdx = now.getHours();
  } else if (repPeriod === 'week') {
    mk(7);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + repOff * 7);
    const wf = new Intl.DateTimeFormat(L, { weekday: 'narrow' });
    for (let i = 0; i < 7; i++) out.labels[i] = wf.format(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6 + i));
    out.title = `${walDateLabel(ymdOf(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6)))} – ${walDateLabel(ymdOf(end))}`;
    tx.forEach((x) => {
      for (let i = 0; i < 7; i++) {
        if (x.date === ymdOf(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6 + i))) { addTx(i, x); break; }
      }
    });
    if (repOff === 0) out.nowIdx = 6;
  } else if (repPeriod === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + repOff, 1);
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    mk(dim);
    for (let i = 1; i <= dim; i++) out.labels[i - 1] = String(i);
    out.title = new Intl.DateTimeFormat(L, { month: 'long', year: 'numeric' }).format(d);
    const pre = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-`;
    tx.forEach((x) => {
      if (x.date && x.date.startsWith(pre)) {
        const dd = Number(x.date.slice(8, 10));
        if (dd >= 1 && dd <= dim) addTx(dd - 1, x);
      }
    });
    if (repOff === 0) out.nowIdx = now.getDate() - 1;
  } else if (repPeriod === 'semester') {
    const sem = Math.floor(now.getMonth() / 6) + repOff;
    const start = new Date(now.getFullYear(), sem * 6, 1);
    mk(6);
    const mf = new Intl.DateTimeFormat(L, { month: 'short' });
    for (let i = 0; i < 6; i++) out.labels[i] = mf.format(new Date(start.getFullYear(), start.getMonth() + i, 1));
    out.title = `${mf.format(start)} – ${mf.format(new Date(start.getFullYear(), start.getMonth() + 5, 1))} ${start.getFullYear()}`;
    tx.forEach((x) => {
      if (!x.date) return;
      const [yy, mm] = x.date.split('-').map(Number);
      const mi = (yy - start.getFullYear()) * 12 + (mm - 1) - start.getMonth();
      if (mi >= 0 && mi < 6) addTx(mi, x);
    });
    if (repOff === 0) out.nowIdx = now.getMonth() - start.getMonth();
  } else if (repPeriod === 'year') {
    const y = now.getFullYear() + repOff;
    mk(12);
    const mf = new Intl.DateTimeFormat(L, { month: 'narrow' });
    for (let i = 0; i < 12; i++) out.labels[i] = mf.format(new Date(y, i, 1));
    out.title = new Intl.DateTimeFormat(L, { year: 'numeric' }).format(new Date(y, 0, 1));
    tx.forEach((x) => {
      if (!x.date) return;
      const [yy, mm] = x.date.split('-').map(Number);
      if (yy === y) addTx(mm - 1, x);
    });
    if (repOff === 0) out.nowIdx = now.getMonth();
  } else { /* decade */
    const ds = Math.floor(now.getFullYear() / 10) * 10 + repOff * 10;
    mk(10);
    for (let i = 0; i < 10; i++) out.labels[i] = String(ds + i);
    out.title = `${ds}–${ds + 9}`;
    tx.forEach((x) => {
      if (!x.date) return;
      const yy = Number(x.date.slice(0, 4));
      if (yy >= ds && yy < ds + 10) addTx(yy - ds, x);
    });
    if (repOff === 0) out.nowIdx = now.getFullYear() - ds;
  }
  return out;
}

function repChartSVG(r) {
  const n = r.spent.length;
  const max = Math.max(...r.spent, ...r.income, 1);
  const bw = 320 / n;
  const step = Math.ceil(n / 12);
  let inner = '';
  for (let i = 0; i < n; i++) {
    const hs = r.spent[i] > 0 ? Math.max(3, Math.round((r.spent[i] / max) * 78)) : 1;
    const hi = r.income[i] > 0 ? Math.max(3, Math.round((r.income[i] / max) * 78)) : 0;
    const x = i * bw;
    if (hi) inner += `<rect class="wal-bar in" x="${(x + bw * 0.10).toFixed(1)}" y="${92 - hi}" width="${(bw * 0.34).toFixed(1)}" height="${hi}" rx="1.5"/>`;
    inner += `<rect class="wal-bar${i === r.nowIdx ? ' now' : ''}" x="${(x + bw * 0.50).toFixed(1)}" y="${92 - hs}" width="${(bw * 0.34).toFixed(1)}" height="${hs}" rx="1.5"/>`;
    if (i % step === 0) inner += `<text x="${(x + bw / 2).toFixed(1)}" y="106">${r.labels[i]}</text>`;
  }
  return `<svg class="wal-chart" viewBox="0 0 320 110" aria-hidden="true">${inner}</svg>`;
}

/* ---------------- language + theme ---------------- */

function applyLang(id, persist = true) {
  lang = langOf(id).id;
  const L = langOf(lang);
  document.documentElement.lang = L.locale;
  document.documentElement.dir = L.dir;
  els.langFlag.src = ccFlag(L.flag);
  els.langLabel.textContent = lang === 'zh-Hant' ? '繁中' : lang.toUpperCase();
  els.langBtn.title = langTitleOf(lang);
  els.langList.setAttribute('aria-label', t(lang, 'language'));
  els.btnNight.title = t(lang, 'nightTitle');
  els.walBalLabel.textContent = t(lang, 'walBalance');
  els.walTypeOut.textContent = t(lang, 'walExpense');
  els.walTypeIn.textContent = t(lang, 'walIncome');
  els.walAmtLabel.textContent = t(lang, 'walAmount');
  els.walNoteLabel.textContent = t(lang, 'walNote');
  els.walDateLabel.textContent = t(lang, 'date');
  els.walAddBtn.textContent = t(lang, 'walAdd');
  els.walTabD.textContent = t(lang, 'walDays');
  els.walTabR.textContent = t(lang, 'walReports');
  els.walTabC.textContent = t(lang, 'walCash');
  els.walCurBtn.title = t(lang, 'walCurrency');
  els.walCurBtn.setAttribute('aria-label', t(lang, 'walCurrency'));
  if (els.launchText) els.launchText.textContent = t(lang, 'launchpad');
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
  try {
    const rp = localStorage.getItem('singhoah:walrep') || '';
    if (['day', 'week', 'month', 'semester', 'year', 'decade'].includes(rp)) repPeriod = rp;
  } catch { /* ignore */ }

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
  els.walTabC.addEventListener('click', () => setWalTab('cash'));

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
    const rbtn = e.target.closest('[data-rep]');
    if (rbtn) {
      repPeriod = rbtn.dataset.rep;
      repOff = 0;
      try { localStorage.setItem('singhoah:walrep', repPeriod); } catch { /* ignore */ }
      renderWallet();
      return;
    }
    const rnav = e.target.closest('[data-repoff]');
    if (rnav) { repOff += Number(rnav.dataset.repoff); renderWallet(); return; }
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

/* A cloud sync adopted a newer ledger — repaint without a reload. */
document.addEventListener('singhoah:cloudsync', () => {
  wallet = loadWallet();
  renderWallet();
});

/* ---------------- cash view: a wallet that pops out real notes & coins ------
   Notes and coins are hand-drawn inline SVG (one <symbol> per denomination,
   stamped repeatedly via <use> so the DOM stays tiny), colored after each
   currency's real banknote ladder where one is known. The balance is split
   greedily into real denominations; the pop-out is pure CSS, so phones stay
   smooth. Nothing here loads external images or libraries. */
const CASH_NOTES = {
  USD: [100, 50, 20, 10, 5, 2, 1], EUR: [500, 200, 100, 50, 20, 10, 5], TWD: [2000, 1000, 500, 200, 100],
  JPY: [10000, 5000, 2000, 1000], KRW: [50000, 10000, 5000, 1000], GBP: [50, 20, 10, 5],
  CNY: [100, 50, 20, 10, 5, 1], INR: [500, 200, 100, 50, 20, 10], HKD: [1000, 500, 100, 50, 20, 10],
  SGD: [1000, 100, 50, 10, 5, 2], CHF: [1000, 500, 200, 100, 50, 20, 10], CAD: [100, 50, 20, 10, 5],
  AUD: [100, 50, 20, 10, 5], NZD: [100, 50, 20, 10, 5], THB: [1000, 500, 100, 50, 20],
  PHP: [1000, 500, 200, 100, 50, 20], MYR: [100, 50, 20, 10, 5, 1], MXN: [1000, 500, 200, 100, 50, 20],
  BRL: [200, 100, 50, 20, 10, 5, 2], RUB: [5000, 1000, 500, 200, 100, 50, 10], TRY: [200, 100, 50, 20, 10, 5],
  PLN: [500, 200, 100, 50, 20, 10], SEK: [1000, 500, 200, 100, 50], NOK: [1000, 500, 200, 100, 50],
  DKK: [1000, 500, 200, 100, 50], CZK: [5000, 2000, 1000, 500, 200, 100], HUF: [20000, 10000, 5000, 2000, 1000],
  SAR: [500, 100, 50, 10, 5, 1], AED: [1000, 500, 200, 100, 50, 20, 10, 5], IDR: [100000, 50000, 20000, 10000, 5000, 2000, 1000],
  VND: [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000],
};
const CASH_COINS = {
  USD: [0.25, 0.1, 0.05, 0.01], EUR: [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01], TWD: [50, 10, 5, 1],
  JPY: [500, 100, 50, 10], KRW: [500, 100, 50, 10], GBP: [2, 1, 0.5, 0.2, 0.1, 0.05],
  CNY: [0.5, 0.1], INR: [10, 5, 2, 1], HKD: [10, 5, 2, 1], THB: [10, 5, 2, 1],
  PHP: [10, 5, 1], MXN: [10, 5, 2, 1], BRL: [1, 0.5, 0.25, 0.1, 0.05], RUB: [10, 5, 2, 1],
  TRY: [1, 0.5, 0.25, 0.1], PLN: [5, 2, 1, 0.5, 0.2, 0.1], CZK: [50, 20, 10, 5, 2, 1],
  HUF: [200, 100, 50, 20, 10, 5], SAR: [2, 1, 0.5], AED: [1, 0.5, 0.25], SGD: [1, 0.5, 0.2, 0.1, 0.05],
  CHF: [5, 2, 1, 0.5, 0.2, 0.1, 0.05], CAD: [2, 1, 0.25, 0.1, 0.05], AUD: [2, 1, 0.5, 0.2, 0.1],
  NZD: [2, 1, 0.5, 0.2, 0.1], SEK: [10, 5, 2, 1], NOK: [20, 10, 5, 1], DKK: [20, 10, 5, 2, 1],
};
const CASH_DEC0 = new Set(['JPY', 'KRW', 'VND', 'IDR', 'HUF', 'CLP', 'ISK', 'UGX', 'KES', 'TZS', 'COP', 'XAF', 'XOF', 'PYG', 'GNF', 'RWF', 'BIF', 'DJF', 'XPF', 'VUV']);
/* real banknote ladders, ordered to match CASH_NOTES above */
const CASH_NOTE_COL = {
  USD: ['#5f7d67', '#66846d', '#6d8b74', '#74927b', '#7b9982', '#82a089', '#89a790'],
  EUR: ['#8f979d', '#b8a04a', '#7fa86b', '#d98b3f', '#4a76b8', '#c96a5e', '#a0a8ae'],
  TWD: ['#5f9e63', '#3f6bb8', '#8a6f4d', '#8e6bb8', '#c0392b'],
  JPY: ['#8a6f4d', '#5f9e63', '#9a6bb8', '#4a76b8'],
  KRW: ['#5f9e63', '#d98b3f', '#8a6f4d', '#4a76b8'],
  GBP: ['#c0392b', '#9a6bb8', '#d98b3f', '#3fa0a8'],
  CNY: ['#c0392b', '#5f9e63', '#8a6f4d', '#4a76b8', '#9a6bb8', '#7d8ba0'],
  INR: ['#8a6f4d', '#3fb8ae', '#9a6bb8', '#d98b3f', '#c96a5e', '#7d8ba0'],
  HKD: ['#caa24a', '#8a6f4d', '#c0392b', '#5f9e63', '#4a76b8', '#9a6bb8'],
  THB: ['#8a6f4d', '#9a6bb8', '#c0392b', '#4a76b8', '#5f9e63'],
  BRL: ['#caa24a', '#3fb8ae', '#8a6f4d', '#caa24a', '#c0392b', '#9a6bb8', '#4a76b8'],
  RUB: ['#c0392b', '#5f9e63', '#9a6bb8', '#5f9e63', '#c0392b', '#4a76b8', '#5f9e63'],
  CAD: ['#8a6f4d', '#c0392b', '#5f9e63', '#4a76b8', '#9a6bb8'],
  AUD: ['#5f9e63', '#caa24a', '#c0392b', '#4a76b8', '#9a6bb8'],
};
const cashHue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const cashNoteColor = (cur, idx) => (CASH_NOTE_COL[cur] && CASH_NOTE_COL[cur][idx]) || `hsl(${(cashHue(cur) + idx * 42) % 360} 40% 44%)`;
const cashValText = (v) => (Number.isInteger(v) ? String(v) : String(v));
const cashSerial = (cur, v) => { let h = cashHue(cur + v) * 991 + v; return `${cur[0]}${(h % 90 + 10)} ${(h % 900000 + 100000)}`; };

/* greedy change-making of the live balance; DOM stays tiny via caps */
function cashSplit(cur, total) {
  const notes = CASH_NOTES[cur] || [1000, 500, 200, 100, 50, 20, 10, 5, 1];
  const dec0 = CASH_DEC0.has(cur);
  const coins = CASH_COINS[cur] || (dec0 ? [10, 5, 1] : [0.25, 0.1, 0.05, 0.01]);
  let rest = Math.round(total * 100) / 100;
  const out = [];
  for (let i = 0; i < notes.length; i++) {
    if (out.length >= 22) break;
    const v = notes[i];
    const n = Math.min(Math.floor(rest / v + 1e-9), 30);
    if (n > 0) { out.push({ v, n, coin: false, idx: i }); rest = Math.round((rest - v * n) * 100) / 100; }
  }
  for (const v of coins) {
    if (out.length >= 32) break;
    const n = Math.min(Math.floor(rest / v + 1e-9), 20);
    if (n > 0) { out.push({ v, n, coin: true, idx: 0 }); rest = Math.round((rest - v * n) * 100) / 100; }
  }
  return { out, rest };
}

function cashNoteSym(id, v, col, cur) {
  const sym = curSymbol(cur, langOf(lang).locale);
  return `<symbol id="cn-${id}" viewBox="0 0 240 108"><rect x="1.5" y="1.5" width="237" height="105" rx="10" fill="${col}" stroke="rgba(0,0,0,.45)" stroke-width="3"/><rect x="8" y="8" width="224" height="92" rx="7" fill="none" stroke="rgba(255,255,255,.85)" stroke-opacity=".45" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/><path d="M14 86 q22 -20 44 0 t44 0 t44 0 t44 0 t44 0" fill="none" stroke="rgba(255,255,255,.85)" stroke-opacity=".28" stroke-width="3"/><circle cx="180" cy="54" r="31" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.85)" stroke-opacity=".55" stroke-width="2"/><circle cx="180" cy="45" r="9" fill="rgba(255,255,255,.6)"/><path d="M164 74 a16 16 0 0 1 32 0 z" fill="rgba(255,255,255,.6)"/><text x="20" y="46" font-size="34" font-weight="700" fill="rgba(255,255,255,.92)">${cashValText(v)}</text><text x="20" y="70" font-size="14" fill="rgba(255,255,255,.85)">${walEsc(sym)} · ${walEsc(cur)}</text><text x="222" y="26" text-anchor="end" font-size="10" letter-spacing="2" fill="rgba(255,255,255,.65)">${cashSerial(cur, v)}</text></symbol>`;
}
function cashCoinSym(id, v, metal) {
  return `<symbol id="cc-${id}" viewBox="0 0 88 88"><circle cx="44" cy="44" r="40" fill="url(#cg-${metal})" stroke="rgba(0,0,0,.4)" stroke-width="3"/><circle cx="44" cy="44" r="30" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="2" stroke-dasharray="2 4"/><text x="44" y="52" text-anchor="middle" font-size="21" font-weight="700" fill="rgba(70,45,0,.75)">${cashValText(v)}</text></symbol>`;
}
const CASH_GRADS = `<radialGradient id="cg-gold" cx="35%" cy="30%"><stop offset="0" stop-color="#f7e08b"/><stop offset="1" stop-color="#b8860b"/></radialGradient><radialGradient id="cg-silver" cx="35%" cy="30%"><stop offset="0" stop-color="#f0f2f4"/><stop offset="1" stop-color="#8e979f"/></radialGradient><radialGradient id="cg-copper" cx="35%" cy="30%"><stop offset="0" stop-color="#e2a378"/><stop offset="1" stop-color="#a35a2c"/></radialGradient>`;
const CASH_WALLET_ART = `<defs><linearGradient id="cwl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a33"/><stop offset="1" stop-color="#5f3a1e"/></linearGradient></defs><rect x="20" y="58" width="300" height="146" rx="20" fill="url(#cwl)"/><rect x="20" y="58" width="300" height="26" rx="12" fill="rgba(0,0,0,.42)"/><rect x="28" y="92" width="284" height="104" rx="14" fill="none" stroke="rgba(255,224,170,.35)" stroke-width="2" stroke-dasharray="6 5"/><rect x="150" y="128" width="170" height="56" rx="14" fill="rgba(0,0,0,.16)"/><rect x="252" y="140" width="50" height="30" rx="9" fill="#caa24a"/><circle cx="277" cy="155" r="5" fill="#8a5a33"/>`;

function renderCash() {
  const box = els.walCashBox;
  const total = walBalance(wallet.tx);
  if (wallet.cur === 'BTC' || wallet.cur === 'ETH' || total <= 0) {
    box.innerHTML = `<p class="wal-empty">${t(lang, 'walEmpty')}</p>`;
    return;
  }
  const { out, rest } = cashSplit(wallet.cur, total);
  const coinMax = Math.max.apply(null, (CASH_COINS[wallet.cur] || [1]));
  const defs = [];
  const items = [];
  let i = 0;
  for (const it of out) {
    const id = `${wallet.cur}-${it.coin ? 'c' : 'n'}-${String(it.v).replace('.', '_')}`;
    if (it.coin) {
      const metal = it.v >= coinMax * 0.5 ? 'gold' : it.v >= coinMax * 0.1 ? 'silver' : 'copper';
      defs.push(cashCoinSym(id, it.v, metal));
      items.push(`<span class="cash-coin" style="--i:${i}" title="${walEsc(`${it.n}× ${fmtMoney(it.v)}`)}"><svg viewBox="0 0 88 88" aria-hidden="true"><use href="#cc-${id}"/></svg>${it.n > 1 ? `<i>×${it.n}</i>` : ''}</span>`);
    } else {
      defs.push(cashNoteSym(id, it.v, cashNoteColor(wallet.cur, it.idx), wallet.cur));
      const rot = (i % 2 ? -1 : 1) * (2 + (i * 7) % 5);
      items.push(`<span class="cash-note" style="--i:${i};--r:${rot}deg" title="${walEsc(`${it.n}× ${fmtMoney(it.v)}`)}"><svg viewBox="0 0 240 108" aria-hidden="true"><use href="#cn-${id}"/></svg>${it.n > 1 ? `<i>×${it.n}</i>` : ''}</span>`);
    }
    i++;
  }
  const more = rest > 0.004 ? `<span class="cash-more">+${walEsc(fmtMoney(rest))}</span>` : '';
  box.innerHTML = `
  <div class="cash-scene">
    <svg class="cash-wallet" viewBox="0 0 340 210" aria-hidden="true">${CASH_WALLET_ART}</svg>
    <div class="cash-tray" role="img" aria-label="${walEsc(`${t(lang, 'walCash')} · ${fmtMoney(total)}`)}">
      <svg class="cash-defs" width="0" height="0" aria-hidden="true"><defs>${CASH_GRADS}${defs.join('')}</defs></svg>
      ${items.join('')}
      ${more}
    </div>
  </div>`;
}
