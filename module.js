/* ============================================================
   SinghoModule — visual automation, n8n style.
   Wire Text → Markdown → Output modules on a grid canvas and
   run the flow. Connectors are square (sharp 90° corners) to
   match Singhoah's UI. Flows are documents in the shared store
   (filesys.js) and round-trip through JSON. No network, no AI.
   ============================================================ */
const LIB = globalThis.__SING_LIB;
const { LANGS, t, langOf, ccFlag, makeLangPicker, langTitleOf } = LIB;
const FS = await import('./filesys.js');
const $ = (id) => document.getElementById(id);

let lang = 'en';
let docId = null;
let doc = { nodes: [], wires: [], grid: true };
let view = { x: 40, y: 20, z: 1 };
let selectedWire = -1;
let saveTimer = 0;
let seq = 0;

const GRID = 24;
const TYPES = {
  text: { w: 230, color: '#4a76b8', name: () => t(lang, 'mText'), hasIn: false, hasOut: true },
  markdown: { w: 200, color: '#5f9e63', name: () => t(lang, 'mMarkdown'), hasIn: true, hasOut: true },
  output: { w: 250, color: '#c9a24a', name: () => t(lang, 'mOutput'), hasIn: true, hasOut: false },
};
const ENCS = ['plain', 'b64', 'url', 'hex', 'uni', 'ent', 'rot'];

/* ---------- text encoders ---------- */
const b64enc = (s) => {
  const b = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
};
const rot13 = (s) => s.replace(/[a-zA-Z]/g, (c) => {
  const base = c <= 'Z' ? 65 : 97;
  return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
});
function encode(kind, s) {
  try {
    if (kind === 'b64') return b64enc(s);
    if (kind === 'url') return encodeURIComponent(s);
    if (kind === 'hex') return [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    if (kind === 'uni') return [...s].map((c) => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join('');
    if (kind === 'ent') return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
      .replace(/[\u0080-\u{10FFFF}]/gu, (c) => '&#x' + c.codePointAt(0).toString(16) + ';');
    if (kind === 'rot') return rot13(s);
    return s;
  } catch { return s; }
}

/* ---------- a tiny, safe Markdown renderer (escapes first) ---------- */
function mdToHtml(src) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const blocks = [];
  let s = esc(src).replace(/\r\n?/g, '\n');
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.replace(/^\n|\n$/g, '')}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const inline = (x) => x
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
  const out = [];
  let list = null; /* 'ul' | 'ol' */
  const flush = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of s.split('\n')) {
    const line = raw.trimEnd();
    const m = line.match(/^\u0000(\d+)\u0000$/);
    if (m) { flush(); out.push(blocks[+m[1]]); continue; }
    if (!line.trim()) { flush(); continue; }
    let mm;
    if ((mm = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); out.push(`<h${mm[1].length}>${inline(mm[2])}</h${mm[1].length}>`); continue; }
    if (/^(---+|\*\*\*+)$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }
    if ((mm = line.match(/^&gt;\s?(.*)$/))) { flush(); out.push(`<blockquote>${inline(mm[1])}</blockquote>`); continue; }
    if ((mm = line.match(/^[-*]\s+(.*)$/))) { if (list !== 'ul') { flush(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(mm[1])}</li>`); continue; }
    if ((mm = line.match(/^\d+\.\s+(.*)$/))) { if (list !== 'ol') { flush(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(mm[1])}</li>`); continue; }
    flush(); out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('\n');
}

/* ---------- the canvas ---------- */
const world = $('modWorld'), wiresSvg = $('modWires'), canvas = $('modCanvas');
const snap = (v) => (doc.grid ? Math.round(v / GRID) * GRID : Math.round(v));
const nodeEl = (id) => world.querySelector(`.mod-node[data-id="${id}"]`);

function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;
  canvas.style.backgroundSize = `${GRID * view.z}px ${GRID * view.z}px`;
  canvas.classList.toggle('nogrid', !doc.grid);
}

function portPos(id, which) {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return [0, 0];
  return which === 'out' ? [n.x + TYPES[n.type].w, n.y + 18] : [n.x, n.y + 18];
}
/* square connectors only: H-V-H polylines, sharp 90° corners, no curves */
function wirePath(a, b) {
  const [x1, y1] = portPos(a, 'out');
  const [x2, y2] = portPos(b, 'in');
  const mid = Math.round((x1 + x2) / 2);
  return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
}

function redrawWires() {
  const sel = selectedWire;
  wiresSvg.innerHTML = doc.wires.map((w, i) =>
    `<path d="${wirePath(w.from, w.to)}" class="mod-wire${i === sel ? ' sel' : ''}" data-i="${i}"/>`).join('');
  [...wiresSvg.querySelectorAll('.mod-wire')].forEach((p) => {
    p.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      selectedWire = selectedWire === +p.dataset.i ? -1 : +p.dataset.i;
      redrawWires();
    });
  });
  const old = world.querySelector('.mod-wdel');
  if (old) old.remove();
  if (sel >= 0 && doc.wires[sel]) {
    const [x1, y1] = portPos(doc.wires[sel].from, 'out');
    const [x2, y2] = portPos(doc.wires[sel].to, 'in');
    const b = document.createElement('button');
    b.className = 'mod-wdel';
    b.type = 'button';
    b.setAttribute('aria-label', t(lang, 'flDelete'));
    b.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
    b.style.left = `${(x1 + x2) / 2 - 11}px`;
    b.style.top = `${(y1 + y2) / 2 - 11}px`;
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => { doc.wires.splice(selectedWire, 1); selectedWire = -1; redrawWires(); touch(); });
    world.appendChild(b);
  }
}

function renderNode(n) {
  const T = TYPES[n.type];
  let el = nodeEl(n.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'mod-node';
    el.dataset.id = n.id;
    world.appendChild(el);
  }
  el.style.left = `${n.x}px`;
  el.style.top = `${n.y}px`;
  el.style.width = `${T.w}px`;
  const head = `
    <div class="mod-head"><span class="mod-ndot" style="background:${T.color}"></span>
    <span class="mod-nname">${T.name()}</span>
    <button type="button" class="mod-nx" aria-label="${t(lang, 'flDelete')}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></button></div>`;
  let body = '';
  if (n.type === 'text') {
    const encs = ENCS.map((e) => `<option value="${e}"${(n.cfg.enc || 'plain') === e ? ' selected' : ''}>${t(lang, 'enc' + ({ plain: 'Plain', b64: 'B64', url: 'Url', hex: 'Hex', uni: 'Uni', ent: 'Ent', rot: 'Rot' }[e]))}</option>`).join('');
    body = `<div class="mod-body"><textarea class="mod-ta" rows="4" placeholder="${t(lang, 'mText')}…"></textarea><select class="mod-enc" aria-label="${t(lang, 'mText')}">${encs}</select></div>`;
  } else if (n.type === 'markdown') {
    body = `<div class="mod-body"><p class="mod-hint"># &nbsp;**b** &nbsp;*i* &nbsp;\`c\`</p></div>`;
  } else {
    body = `<div class="mod-body"><div class="mod-result"><span class="mod-empty">${t(lang, 'mResult')} —</span></div></div>`;
  }
  el.innerHTML = head + body + (T.hasIn ? '<span class="mod-port in"></span>' : '') + (T.hasOut ? '<span class="mod-port out"></span>' : '');

  const ta = el.querySelector('.mod-ta');
  if (ta) {
    ta.value = n.cfg.text || '';
    ta.addEventListener('input', () => { n.cfg.text = ta.value; touch(); });
  }
  const enc = el.querySelector('.mod-enc');
  if (enc) enc.addEventListener('change', () => { n.cfg.enc = enc.value; touch(); });
  el.querySelector('.mod-nx').addEventListener('click', () => removeNode(n.id));

  /* drag the node by its header (mouse or touch, one pointer API) */
  el.querySelector('.mod-head').addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mod-nx')) return;
    e.stopPropagation();
    const el2 = el, n2 = n;
    const sx = e.clientX, sy = e.clientY, ox = n2.x, oy = n2.y;
    el2.setPointerCapture(e.pointerId);
    el2.classList.add('drag');
    const move = (ev) => {
      n2.x = snap(ox + (ev.clientX - sx) / view.z);
      n2.y = snap(oy + (ev.clientY - sy) / view.z);
      el2.style.left = `${n2.x}px`;
      el2.style.top = `${n2.y}px`;
      redrawWires();
    };
    const up = () => { el2.classList.remove('drag'); el2.removeEventListener('pointermove', move); el2.removeEventListener('pointerup', up); touch(); };
    el2.addEventListener('pointermove', move);
    el2.addEventListener('pointerup', up);
  });

  /* drag a wire out of the output port */
  el.querySelectorAll('.mod-port.out').forEach((port) => {
    port.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      port.setPointerCapture(e.pointerId);
      let temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      temp.setAttribute('class', 'mod-wire temp');
      wiresSvg.appendChild(temp);
      const toWorld = (cx, cy) => {
        const r = canvas.getBoundingClientRect();
        return [(cx - r.left - view.x) / view.z, (cy - r.top - view.y) / view.z];
      };
      const [x1, y1] = portPos(n.id, 'out');
      const move = (ev) => {
        const [wx, wy] = toWorld(ev.clientX, ev.clientY);
        const mid = Math.round((x1 + wx) / 2);
        temp.setAttribute('d', `M ${x1} ${y1} H ${mid} V ${wy} H ${wx}`);
      };
      const up = (ev) => {
        port.removeEventListener('pointermove', move);
        port.removeEventListener('pointerup', up);
        temp.remove();
        const drop = document.elementFromPoint(ev.clientX, ev.clientY);
        const target = drop && drop.closest ? drop.closest('.mod-port.in') : null;
        if (target) {
          const tNode = target.closest('.mod-node').dataset.id;
          if (tNode !== n.id) {
            doc.wires = doc.wires.filter((w) => w.to !== tNode);
            doc.wires.push({ from: n.id, to: tNode });
            touch();
          }
        }
        redrawWires();
      };
      port.addEventListener('pointermove', move);
      port.addEventListener('pointerup', up);
    });
  });
}

function removeNode(id) {
  doc.nodes = doc.nodes.filter((n) => n.id !== id);
  doc.wires = doc.wires.filter((w) => w.from !== id && w.to !== id);
  const el = nodeEl(id);
  if (el) el.remove();
  selectedWire = -1;
  redrawWires();
  touch();
}
function addNode(type, x, y) {
  const n = {
    id: 'n' + (++seq) + Date.now().toString(36).slice(-3),
    type, x: snap(x ?? (60 + (seq % 5) * 30)), y: snap(y ?? (40 + (seq % 5) * 30)),
    cfg: type === 'text' ? { text: '', enc: 'plain' } : {},
  };
  doc.nodes.push(n);
  renderNode(n);
  redrawWires();
  touch();
  return n;
}

/* pan the canvas + wheel zoom */
canvas.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.mod-node') || e.target.closest('.mod-zoom')) return;
  const sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
  let moved = false;
  canvas.setPointerCapture(e.pointerId);
  const move = (ev) => {
    if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
    view.x = ox + ev.clientX - sx;
    view.y = oy + ev.clientY - sy;
    applyView();
  };
  const up = () => {
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    if (!moved && selectedWire !== -1) { selectedWire = -1; redrawWires(); }
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom(view.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
}, { passive: false });
function setZoom(z) {
  view.z = Math.min(1.8, Math.max(0.4, Math.round(z * 100) / 100));
  applyView();
  $('modZoomR').textContent = `${Math.round(view.z * 100)}%`;
}
$('modZoomIn').addEventListener('click', () => setZoom(view.z * 1.2));
$('modZoomOut').addEventListener('click', () => setZoom(view.z / 1.2));
$('modZoomR').addEventListener('click', () => { view = { x: 40, y: 20, z: 1 }; setZoom(1); applyView(); });

/* ---------- run the flow: Text → Markdown → Output ---------- */
function run() {
  const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
  const done = new Set();
  const val = {};
  const outs = [];
  for (let round = 0; round <= doc.nodes.length; round++) {
    let progressed = false;
    for (const n of doc.nodes) {
      if (done.has(n.id)) continue;
      const ins = doc.wires.filter((w) => w.to === n.id).map((w) => val[w.from]).filter((v) => v !== undefined);
      if (ins.length < doc.wires.filter((w) => w.to === n.id).length) continue;
      let v;
      if (n.type === 'text') v = { text: encode(n.cfg.enc || 'plain', n.cfg.text || '') };
      else if (n.type === 'markdown') v = { html: mdToHtml(ins.map((x) => x.text ?? '').join('\n\n')) };
      else {
        const texts = ins.map((x) => x.text ?? '').join('\n');
        v = { text: texts };
        const el = nodeEl(n.id);
        if (el) {
          const box = el.querySelector('.mod-result');
          if (box) {
            if (ins.length === 1 && ins[0].html !== undefined) box.innerHTML = `<div class="mod-md">${ins[0].html}</div>`;
            else box.textContent = texts || '';
            if (!texts && !(ins.length === 1 && ins[0].html)) box.innerHTML = `<span class="mod-empty">${t(lang, 'mResult')} —</span>`;
          }
          el.classList.remove('ran');
          requestAnimationFrame(() => el.classList.add('ran'));
        }
        if (texts) outs.push(texts);
      }
      val[n.id] = v;
      done.add(n.id);
      progressed = true;
    }
    if (!progressed) break; /* cycle or waiting on nothing: stop */
  }
  return outs;
}

/* ---------- persistence: a flow is a document ---------- */
function touch() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!docId) return;
    FS.docsSave(docId, { title: $('modTitle').value, data: { nodes: doc.nodes, wires: doc.wires, grid: doc.grid, seq } });
  }, 500);
}
function openDoc(id) {
  const d = FS.docsGet(id);
  if (!d || d.kind !== 'flow') return showHome();
  if (docId) { clearTimeout(saveTimer); }
  docId = id;
  doc = { nodes: (d.data && d.data.nodes) || [], wires: (d.data && d.data.wires) || [], grid: d.data ? d.data.grid !== false : true };
  seq = (d.data && d.data.seq) || doc.nodes.length;
  view = { x: 40, y: 20, z: 1 };
  selectedWire = -1;
  history.replaceState(null, '', `?doc=${id}`);
  $('modHome').hidden = true;
  $('modEditor').hidden = false;
  document.body.classList.remove('mod-fileshome');
  $('modTitle').value = d.title || '';
  world.querySelectorAll('.mod-node').forEach((el) => el.remove());
  const wdel = world.querySelector('.mod-wdel');
  if (wdel) wdel.remove();
  for (const n of doc.nodes) renderNode(n);
  redrawWires();
  applyView();
  setZoom(1);
}
function showHome() {
  if (docId) { clearTimeout(saveTimer); touch(); }
  docId = null;
  history.replaceState(null, '', location.pathname);
  $('modEditor').hidden = true;
  $('modHome').hidden = false;
  document.body.classList.add('mod-fileshome');
  FS.renderFilesHome({
    mount: $('modHome'), kind: 'flow', untitled: t(lang, 'flUntitledFlow'),
    brand: `${t(lang, 'lpModule')} · ${t(lang, 'flFiles')}`,
    onOpen: (id) => openDoc(id),
  });
}
function newDoc() {
  const id = FS.docsCreate('flow', '', { nodes: [], wires: [], grid: true });
  openDoc(id);
  return id;
}

$('modFiles').addEventListener('click', showHome);
$('modTitle').addEventListener('input', touch);
$('modRun').addEventListener('click', () => run());
$('modGrid').addEventListener('click', () => {
  doc.grid = !doc.grid;
  $('modGrid').setAttribute('aria-pressed', String(doc.grid));
  applyView();
  touch();
});
document.querySelectorAll('.mod-add').forEach((b) => b.addEventListener('click', () => {
  if (!docId) return;
  addNode(b.dataset.add);
}));
$('modExport').addEventListener('click', () => { if (docId) { clearTimeout(saveTimer); touch(); setTimeout(() => FS.docsExport(docId), 550); } });
$('modImport').addEventListener('click', () => $('modFile').click());
$('modFile').addEventListener('change', async () => {
  const f = $('modFile').files && $('modFile').files[0];
  if (f) {
    const id = FS.docsImportJSON(await f.text(), 'flow');
    if (id) openDoc(id);
  }
  $('modFile').value = '';
});

/* ---------- language + theme ---------- */
function applyLang(id, persist = true) {
  lang = langOf(id).id;
  const L = langOf(lang);
  document.documentElement.lang = L.locale;
  document.documentElement.dir = L.dir;
  $('langFlag').src = ccFlag(L.flag);
  $('langLabel').textContent = lang === 'zh-Hant' ? '繁中' : lang.toUpperCase();
  $('langBtn').title = langTitleOf(lang);
  $('langList').setAttribute('aria-label', t(lang, 'language'));
  $('btnNight').title = t(lang, 'nightTitle');
  $('clockText').textContent = t(lang, 'lpClock');
  $('btnClock').title = t(lang, 'lpClock');
  $('settingsText').textContent = t(lang, 'settings');
  $('btnSettings').title = t(lang, 'settings');
  $('btnLaunch').title = t(lang, 'launchpad');
  $('modAddT').textContent = t(lang, 'mText');
  $('modAddM').textContent = t(lang, 'mMarkdown');
  $('modAddO').textContent = t(lang, 'mOutput');
  $('modGridT').textContent = t(lang, 'mGrid');
  $('modRunT').textContent = t(lang, 'mRun');
  $('modTitle').placeholder = t(lang, 'flUntitledFlow');
  $('modFiles').title = t(lang, 'flFiles');
  $('modFiles').setAttribute('aria-label', t(lang, 'flFiles'));
  $('modExport').title = t(lang, 'flExport');
  $('modExport').setAttribute('aria-label', t(lang, 'flExport'));
  $('modImport').title = t(lang, 'flImport');
  $('modImport').setAttribute('aria-label', t(lang, 'flImport'));
  $('modTitle').setAttribute('aria-label', t(lang, 'lpModule'));
  $('modZoomIn').setAttribute('aria-label', t(lang, 'zoomIn'));
  $('modZoomOut').setAttribute('aria-label', t(lang, 'zoomOut'));
  $('modGrid').setAttribute('aria-pressed', String(doc.grid));
  if (docId) { for (const n of doc.nodes) renderNode(n); redrawWires(); }
  if (persist) { try { localStorage.setItem('singhoah:lang', lang); } catch { /* ignore */ } }
  document.dispatchEvent(new CustomEvent('singhoah:lang'));
}
$('btnNight').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  const dark = document.documentElement.classList.contains('dark');
  try { localStorage.setItem('singhoah:night', dark ? '1' : '0'); } catch { /* ignore */ }
  updateThemeBtn();
});
function updateThemeBtn() {
  const dark = document.documentElement.classList.contains('dark');
  $('nightText').textContent = t(lang, dark ? 'night' : 'light');
}
document.addEventListener('singhoah:lang', updateThemeBtn);

/* ---------- boot ---------- */
let saved = '';
try { saved = localStorage.getItem('singhoah:lang') || ''; } catch { /* ignore */ }
applyLang(LANGS.some((l) => l.id === saved) ? saved : 'en', false);
makeLangPicker($('langBtn'), $('langPop'), $('langList'), (id) => { applyLang(id); if (!$('modHome').hidden) showHome(); }, '.langwrap');
updateThemeBtn();

const docParam = new URLSearchParams(location.search).get('doc');
if (docParam && FS.docsGet(docParam) && FS.docsGet(docParam).kind === 'flow') openDoc(docParam);
else if (FS.docsList('flow').length === 0) newDoc(); /* first run: straight onto the canvas */
else showHome();

/* SMate + tests drive the app through this surface */
globalThis.__MOD = {
  add: addNode, run, openDoc, newDoc, home: showHome,
  serialize: () => (docId ? FS.docToJSON(docId) : null),
  nodes: () => JSON.parse(JSON.stringify(doc.nodes)),
  wires: () => JSON.parse(JSON.stringify(doc.wires)),
  wire: (a, b) => { doc.wires = doc.wires.filter((w) => w.to !== b); doc.wires.push({ from: a, to: b }); redrawWires(); touch(); },
  removeNode,
  cfg: (id, patch) => { const n = doc.nodes.find((x) => x.id === id); if (n) Object.assign(n.cfg, patch); const el = nodeEl(id); if (el && patch && patch.text !== undefined) { const ta = el.querySelector('.mod-ta'); if (ta) ta.value = patch.text; } if (el && patch && patch.enc !== undefined) { const s = el.querySelector('.mod-enc'); if (s) s.value = patch.enc; } return n ? { ...n.cfg } : null; },
  grid: (v) => { if (v !== undefined) { doc.grid = !!v; $('modGrid').setAttribute('aria-pressed', String(doc.grid)); applyView(); touch(); } return doc.grid; },
  outputText: () => [...world.querySelectorAll('.mod-node .mod-result')].map((r) => r.textContent).join('\n'),
  view: () => ({ ...view }),
};
