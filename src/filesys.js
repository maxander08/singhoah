/* filesys.js — one document system for SinghoScribe notes and SinghoModule
   flows, styled after a Google-Docs welcome page. Documents live in
   localStorage (singhoah:docs) as { id: { kind, title, updated, data } },
   can be renamed / duplicated / deleted, and round-trip through JSON files
   (Export / Import). No network, no AI, nothing loads on demand. */

const LIB = globalThis.__SING_LIB || { t: (l, k) => k, langOf: () => ({ locale: 'en' }), LANGS: [] };
const KEY = 'singhoah:docs';

function readAll() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return d && typeof d === 'object' ? d : {}; } catch { return {}; }
}
function writeAll(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full / private mode */ } }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function docsList(kind) {
  return Object.values(readAll())
    .filter((d) => d && d.kind === kind && d.id)
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export function docsGet(id) { return readAll()[id] || null; }
export function docsCreate(kind, title, data) {
  const all = readAll();
  const id = uid();
  all[id] = { id, kind, title: (title || '').trim(), updated: Date.now(), data: data || {} };
  writeAll(all);
  return id;
}
export function docsSave(id, patch) {
  const all = readAll();
  const d = all[id];
  if (!d) return false;
  if (patch && patch.title !== undefined) d.title = String(patch.title).trim().slice(0, 80);
  if (patch && patch.data !== undefined) d.data = patch.data;
  d.updated = Date.now();
  writeAll(all);
  return true;
}
export function docsDuplicate(id) {
  const d = docsGet(id);
  if (!d) return null;
  return docsCreate(d.kind, d.title, JSON.parse(JSON.stringify(d.data)));
}

/* ---- cloud merge (used by auth.js when a Google account is signed in) ----
   Documents sync through the same users/<uid> Firestore doc as the wallet,
   but unlike the wallet they MERGE per document: each doc carries its own
   `updated`, so a note created on the phone and a flow created on the laptop
   both survive. Deletions carry tombstones (singhoah:docsdel) so a document
   deleted on one device cannot resurrect from another. */
const KEYDEL = 'singhoah:docsdel';
function readDel() {
  try { const m = JSON.parse(localStorage.getItem(KEYDEL) || '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; }
}
function writeDel(m) { try { localStorage.setItem(KEYDEL, JSON.stringify(m)); } catch { /* storage full */ } }
export function docsDelete(id) {
  const all = readAll();
  if (!all[id]) return false;
  delete all[id];
  writeAll(all);
  const del = readDel();
  del[id] = Date.now();
  writeDel(del);   /* tombstone: other devices must not resurrect this doc */
  return true;
}
/* Merge a remote docs snapshot into this browser. Per document, the newer
   `updated` wins; a tombstone newer than the document wins over both; a doc
   re-edited after its deletion beats the tombstone (legitimate re-creation). */
export function mergeDocs(remote, remoteDel) {
  const all = readAll();
  const del = readDel();
  const rdel = remoteDel && typeof remoteDel === 'object' ? remoteDel : {};
  const okDoc = (d) => d && typeof d === 'object' && typeof d.kind === 'string';
  const changedIds = [];
  const ids = new Set([...Object.keys(all), ...Object.keys(remote || {})]);
  for (const id of ids) {
    const L = okDoc(all[id]) ? all[id] : null;
    const R = okDoc(remote && remote[id]) ? remote[id] : null;
    const lu = (L && L.updated) || 0;
    const ru = (R && R.updated) || 0;
    const tDel = Math.max(del[id] || 0, rdel[id] || 0);
    if (L && R) {
      if (ru > lu) { all[id] = R; changedIds.push(id); }
    } else if (L && !R) {
      if (lu <= tDel) { delete all[id]; changedIds.push(id); }
    } else if (!L && R) {
      if (ru > tDel) { all[id] = R; changedIds.push(id); }
    }
    if (tDel && Math.max(lu, ru) > tDel) delete del[id];   /* re-created after deletion */
  }
  const cutoff = Date.now() - 90 * 864e5;
  for (const [id, ts] of Object.entries(del)) if (!ts || ts < cutoff) delete del[id];
  writeAll(all);
  writeDel(del);
  return { changed: changedIds.length > 0, changedIds };
}

/* ---- JSON round-trips (Export downloads a file, Import reads one back) ---- */
export function docToJSON(id) {
  const d = docsGet(id);
  if (!d) return null;
  return JSON.stringify({ app: 'singhoah', kind: d.kind, title: d.title, updated: d.updated, data: d.data }, null, 2);
}
export function docsExport(id) {
  const d = docsGet(id);
  const json = docToJSON(id);
  if (!json) return false;
  const safe = (d.title || 'document').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'document';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `${safe}.singho.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  return true;
}
export function docsImportJSON(text, kind) {
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== 'object' || !j.kind || typeof j.data !== 'object') return null;
    return docsCreate(kind || j.kind, j.title || '', j.data);
  } catch { return null; }
}

/* ---- the Google-Docs-style home: cards for every document of one kind ----
   opts: { mount, kind, untitled, brand, onOpen } — re-render with refresh(). */
export function renderFilesHome(opts) {
  const { mount, kind, untitled, brand, onOpen } = opts;
  let q = '';
  let confirmId = null;
  let confirmTimer = 0;

  function relabel() {
    const L = localStorage.getItem('singhoah:lang') || 'en';
    mount.querySelectorAll('[data-k]').forEach((el) => { el.textContent = LIB.t(L, el.dataset.k); });
    mount.querySelector('.fl-search')?.setAttribute('placeholder', LIB.t(L, 'flSearch'));
  }

  function draw() {
    const L = localStorage.getItem('singhoah:lang') || 'en';
    const list = docsList(kind).filter((d) => !q || (d.title || untitled).toLowerCase().includes(q.toLowerCase()));
    const cards = list.map((d) => {
      const title = d.title || untitled;
      const when = new Date(d.updated || Date.now());
      let dateTxt = '';
      try { dateTxt = new Intl.DateTimeFormat(LIB.langOf(L).locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(when); } catch { dateTxt = when.toLocaleDateString(); }
      const confirming = confirmId === d.id;
      return `<div class="fl-card" data-id="${d.id}" role="button" tabindex="0">
        <strong class="fl-title">${esc(title)}</strong>
        <span class="fl-date">${esc(LIB.t(L, 'flUpdated'))} · ${esc(dateTxt)}</span>
        <span class="fl-acts">
          <button type="button" class="btn fl-act" data-act="rename" title="${esc(LIB.t(L, 'flRename'))}" aria-label="${esc(LIB.t(L, 'flRename'))}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
          <button type="button" class="btn fl-act" data-act="dup" title="${esc(LIB.t(L, 'flDuplicate'))}" aria-label="${esc(LIB.t(L, 'flDuplicate'))}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" stroke="currentColor" stroke-width="1.8"/><path d="M16 4H4v12" stroke="currentColor" stroke-width="1.8"/></svg></button>
          <button type="button" class="btn fl-act" data-act="export" title="${esc(LIB.t(L, 'flExport'))}" aria-label="${esc(LIB.t(L, 'flExport'))}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="btn fl-act fl-del ${confirming ? 'sure' : ''}" data-act="del" title="${esc(LIB.t(L, confirming ? 'flConfirm' : 'flDelete'))}" aria-label="${esc(LIB.t(L, confirming ? 'flConfirm' : 'flDelete'))}">${confirming ? esc(LIB.t(L, 'flConfirm')) : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'}</button>
        </span>
      </div>`;
    }).join('');
    mount.innerHTML = `
      <div class="fl-head">
        <p class="fl-brand">${esc(brand)}</p>
        <div class="fl-tools">
          <input class="fl-search" type="search" placeholder="${esc(LIB.t(L, 'flSearch'))}" aria-label="${esc(LIB.t(L, 'flSearch'))}" value="${esc(q)}">
          <button type="button" class="btn fl-new" data-fl-new><svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span data-k="flNew"></span></button>
          <button type="button" class="btn fl-imp" data-fl-import title="${esc(LIB.t(L, 'flImport'))}" aria-label="${esc(LIB.t(L, 'flImport'))}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4m0 0 4 4m-4-4-4 4M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <input class="fl-file" type="file" accept=".json,application/json" hidden>
        </div>
      </div>
      ${list.length ? `<div class="fl-grid">${cards}</div>` : `<p class="fl-empty" data-k="flEmpty"></p>`}`;
    relabel();

    mount.querySelector('.fl-search').addEventListener('input', (e) => { q = e.target.value; draw(); mount.querySelector('.fl-search').focus(); });

    mount.querySelector('[data-fl-new]').addEventListener('click', () => { const id = docsCreate(kind, '', {}); onOpen(id); });
    const fileBtn = mount.querySelector('.fl-file');
    mount.querySelector('[data-fl-import]').addEventListener('click', () => fileBtn.click());
    fileBtn.addEventListener('change', async () => {
      const f = fileBtn.files && fileBtn.files[0];
      if (f) {
        const id = docsImportJSON(await f.text(), kind);
        if (id) onOpen(id); else draw();
      }
      fileBtn.value = '';
    });

    mount.querySelectorAll('.fl-card').forEach((card) => {
      const open = () => onOpen(card.dataset.id);
      card.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (!act) { open(); return; }
        e.stopPropagation();
        const id = card.dataset.id;
        const a = act.dataset.act;
        if (a === 'rename') {
          const t = card.querySelector('.fl-title');
          const inp = document.createElement('input');
          inp.className = 'fl-rename';
          inp.value = docsGet(id).title || '';
          inp.setAttribute('aria-label', LIB.t(localStorage.getItem('singhoah:lang') || 'en', 'flRename'));
          t.replaceWith(inp);
          inp.focus();
          inp.select();
          const done = () => { docsSave(id, { title: inp.value }); draw(); };
          inp.addEventListener('blur', done);
          inp.addEventListener('keydown', (ev) => {
            ev.stopPropagation(); /* Enter must rename, not re-open the card */
            if (ev.key === 'Enter') inp.blur();
            if (ev.key === 'Escape') { inp.value = null; draw(); }
          });
        } else if (a === 'dup') { docsDuplicate(id); draw(); }
        else if (a === 'export') { docsExport(id); }
        else if (a === 'del') {
          if (confirmId === id) { docsDelete(id); confirmId = null; draw(); }
          else { confirmId = id; draw(); clearTimeout(confirmTimer); confirmTimer = setTimeout(() => { confirmId = null; draw(); }, 3500); }
        }
      });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }
  draw();
  return { refresh: draw, relabel };
}
