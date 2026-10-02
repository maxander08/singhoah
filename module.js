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
  code: { w: 310, color: '#8b5fbf', name: () => t(lang, 'mCode'), hasIn: true, hasOut: true },
  /* Number: a typed numeric source — Integer/Decimal in any base 1–36,
     Decimal arbitrary-precision, Float/Fixed configurable to 100 digits */
  number: { w: 210, color: '#5f9e63', name: () => t(lang, 'mNumber'), hasIn: false, hasOut: true },
  /* Operator: exact math on its two wired operands — +, −, ×, ÷, %, ^.
     Two input nodes (A above, B below); each holds exactly one wire. */
  operator: { w: 210, color: '#b8764a', name: () => t(lang, 'mOperator'), hasIn: true, hasOut: true, inPorts: ['a', 'b'] },
  /* Comparator: exact yes/no over its two wired operands — >, <, ≥, ≤, =, ≠.
     The verdict shows as true/false and flows on as 1/0 (base-10 integer), so
     a comparison can feed the Operator. Same two input nodes as the Operator. */
  comparator: { w: 210, color: '#4a8f9e', name: () => t(lang, 'mComparator'), hasIn: true, hasOut: true, inPorts: ['a', 'b'] },
  /* I/O: one node, one wire — the text typed in it is the Code module's
     stdin, and the Code module's stdout (and red errors) render back into
     its result pane. Fed from a Text module, it previews the Markdown. */
  io: { w: 250, color: '#c9a24a', name: () => t(lang, 'mIO'), hasIn: true, hasOut: false },
};
const nodeOf = (id) => doc.nodes.find((x) => x.id === id);
const ENCS = ['plain', 'b64', 'url', 'hex', 'uni', 'ent', 'rot'];

/* ---------- number module: exact math on BigInt, never floating point ----------
   Numbers are represented with Western digits and a–z only (base 36 max);
   translations apply to the UI labels, never to the numerals themselves. */
const DIGITS36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const digitVal = (ch, base) => {
  const c = ch.charCodeAt(0);
  const v = c <= 57 ? c - 48 : (c >= 97 && c <= 122 ? c - 87 : -1);
  return v >= 0 && v < base ? v : -1;
};
/* integer in base 1–36 (base 1 = unary tally: 111 is three) → BigInt, or null */
function parseIntB(str, base) {
  if (typeof str !== 'string' || !str.trim().length) return null;
  let s = str.trim().toLowerCase();
  let neg = false;
  if (s[0] === '+' || s[0] === '-') { neg = s[0] === '-'; s = s.slice(1); if (!s.length) return null; }
  if (base === 1) {
    if (s === '0') return 0n;
    if (!/^1+$/.test(s)) return null;
    return (neg ? -1n : 1n) * BigInt(s.length);
  }
  if (!/^[0-9a-z]+$/.test(s)) return null;
  let v = 0n;
  const b = BigInt(base);
  for (const ch of s) { const d = digitVal(ch, base); if (d < 0) return null; v = v * b + BigInt(d); }
  return neg ? -v : v;
}
function formatIntB(v, base) {
  if (v === 0n) return '0';
  const neg = v < 0n;
  if (neg) v = -v;
  if (base === 1) return (neg ? '-' : '') + '1'.repeat(Number(v));
  const b = BigInt(base);
  let out = '';
  while (v > 0n) { out = DIGITS36[Number(v % b)] + out; v /= b; }
  return (neg ? '-' : '') + out;
}
/* arbitrary-precision decimal in base 2–36 (base 1: whole tallies only),
   kept EXACTLY as {ip: BigInt, fp: fraction digit string} — never rounded */
function parseDecB(str, base) {
  if (typeof str !== 'string') return null;
  let s = str.trim().toLowerCase();
  let neg = false;
  if (s[0] === '+' || s[0] === '-') { neg = s[0] === '-'; s = s.slice(1); }
  const parts = s.split('.');
  if (parts.length > 2 || !s.length) return null;
  const ip = parts[0] || '', fp = parts[1] || '';
  if (!ip.length && !fp.length) return null;
  if (base === 1) {
    if (fp.length) return null;                      /* unary has no fractions */
    if (ip === '0') return { ip: 0n, fp: '' };
    if (!/^1+$/.test(ip)) return null;
    return { ip: (neg ? -1n : 1n) * BigInt(ip.length), fp: '' };
  }
  for (const ch of ip + fp) if (digitVal(ch, base) < 0) return null;
  const b = BigInt(base);
  let ipN = 0n;
  for (const ch of ip) ipN = ipN * b + BigInt(digitVal(ch, base));
  return { ip: neg ? -ipN : ipN, fp: fp.replace(/0+$/, '') };
}
/* the base-10 equivalent shown as a hint: exact when it terminates, ≈… when not */
function decHint(d, base) {
  const ipStr = formatIntB(d.ip, 10);
  if (!d.fp) return '= ' + ipStr;
  let num = 0n, den = 1n;
  const b = BigInt(base);
  for (const ch of d.fp) { num = num * b + BigInt(digitVal(ch, base)); den *= b; }
  let out = '', n = num;
  for (let i = 0; i < 13 && n > 0n; i++) { n *= 10n; out += DIGITS36[Number(n / den)]; n %= den; }
  return n === 0n ? '= ' + ipStr + '.' + out : '≈ ' + ipStr + '.' + out.slice(0, 12) + '…';
}
/* base-10 mantissa/exponent: value = D × 10^k, D ≥ 0 (accepts 3, 3.5, .5, 1e3) */
function parseDec10(str) {
  if (typeof str !== 'string') return null;
  let s = str.trim().toLowerCase();
  let neg = false;
  if (s[0] === '+' || s[0] === '-') { neg = s[0] === '-'; s = s.slice(1); }
  const m = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(s);
  if (!m) return null;
  const ip = m[1] || '', fp = m[2] || '';
  if (!ip.length && !fp.length) return null;
  const ex = m[3] ? parseInt(m[3], 10) : 0;
  const all = ip + fp;
  if (/^0*$/.test(all)) return { neg: false, D: 0n, k: 0 };
  let digits = all.replace(/^0+/, '');
  let k = ex - fp.length;
  const tz = digits.length - digits.replace(/0+$/, '').length;
  if (tz) { digits = digits.slice(0, digits.length - tz); k += tz; }
  return { neg, D: BigInt(digits), k };
}
/* round to p significant digits, half-up (99995 @ 2 → 100000) */
function roundSig(D, k, p) {
  const ds = D.toString();
  if (ds.length <= p) return { D, k };
  const shift = ds.length - p;
  let R = BigInt(ds.slice(0, p));
  if (ds[p] >= '5') R += 1n;
  let kk = k + shift;
  let rs = R.toString();
  if (rs.length > p) { kk += rs.length - 1; rs = rs[0]; }   /* the carry crossed a power of ten */
  const tz = rs.length - rs.replace(/0+$/, '').length;
  if (tz) { rs = rs.slice(0, rs.length - tz); kk += tz; }
  return { D: BigInt(rs), k: kk };
}
function renderPlain(D, k, neg) {
  if (D === 0n) return '0';
  const ds = D.toString();
  let out;
  if (k >= 0) out = ds + '0'.repeat(k);
  else {
    const fl = -k;
    out = ds.length > fl ? ds.slice(0, ds.length - fl) + '.' + ds.slice(ds.length - fl)
      : '0.' + '0'.repeat(fl - ds.length) + ds;
  }
  return (neg ? '-' : '') + out;
}
/* fixed point: exactly s decimals, rounded half-up (3.5 @ 4 → 3.5000, 0.15 @ 1 → 0.2) */
function fixedFormat(D, k, neg, s) {
  if (D === 0n) neg = false;
  const e = k + s;
  let M;
  if (e >= 0) M = D * 10n ** BigInt(e);
  else {
    const den = 10n ** BigInt(-e);
    M = (D * 2n + den) / (2n * den);   /* floor((D + den/2) / den): half rounds away from zero */
  }
  if (M === 0n) neg = false;
  const ms = M.toString();
  const out = s === 0 ? ms
    : ms.length <= s ? '0.' + '0'.repeat(s - ms.length) + ms
    : ms.slice(0, ms.length - s) + '.' + ms.slice(ms.length - s);
  return (neg ? '-' : '') + out;
}
/* the Number module's single source of truth: cfg → { ok, out, hint, rat }
   rat is the exact value as a fraction {n: BigInt, d: BigInt>0} so the
   Operator module can compute on it without ever touching a double */
function computeNumber(cfg) {
  const type = cfg.numtype || 'int';
  const raw = String(cfg.value ?? '').trim();
  if (!raw) return { ok: false };
  if (type === 'int' || type === 'dec') {
    const base = Math.min(36, Math.max(1, cfg.base | 0 || 10));
    if (type === 'int') {
      const v = parseIntB(raw, base);
      if (v === null) return { ok: false };
      return { ok: true, out: formatIntB(v, base), hint: base === 10 ? '' : '= ' + formatIntB(v, 10), rat: { n: v, d: 1n } };
    }
    const d = parseDecB(raw, base);
    if (!d) return { ok: false };
    let num = d.ip, den = 1n;
    if (d.fp) {
      const b = BigInt(base);
      for (const ch of d.fp) { num = num * b + BigInt(digitVal(ch, base)); den *= b; }
    }
    return {
      ok: true,
      out: formatIntB(d.ip, base) + (d.fp ? '.' + d.fp : ''),
      hint: base === 10 ? '' : decHint(d, base),
      rat: { n: num, d: den },   /* d.ip carries the sign; num inherits it */
    };
  }
  const p = parseDec10(raw);
  if (!p) return { ok: false };
  const neg = p.neg && p.D !== 0n;
  const digits = Math.min(100, Math.max(1, cfg.digits | 0 || 6));
  const rat = p.k >= 0
    ? { n: (neg ? -p.D : p.D) * 10n ** BigInt(p.k), d: 1n }
    : { n: neg ? -p.D : p.D, d: 10n ** BigInt(-p.k) };
  if (type === 'float') {
    const r = roundSig(p.D, p.k, digits);
    return { ok: true, out: renderPlain(r.D, r.k, neg), hint: '', rat };
  }
  return { ok: true, out: fixedFormat(p.D, p.k, neg, digits), hint: '', rat };
}

/* ---------- the Operator module: exact math on BigInt fractions ----------
   +, −, ×, ÷, %, ^ — computed on exact rationals, then rendered in the LEFT
   operand's number system (its base/type/digits), so hex stays hex. */
const OPS = {
  add: { sym: '+', name: () => t(lang, 'opAdd') },
  sub: { sym: '−', name: () => t(lang, 'opSub') },
  mul: { sym: '×', name: () => t(lang, 'opMul') },
  div: { sym: '÷', name: () => t(lang, 'opDiv') },
  mod: { sym: '%', name: () => t(lang, 'opMod') },
  pow: { sym: '^', name: () => t(lang, 'opPow') },
};
function ratGcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
function ratNorm(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  let g = ratGcd(n < 0n ? -n : n, d);
  if (!g) g = 1n;
  return { n: n / g, d: d / g };
}
/* any incoming flow value → an exact fraction, or null when it is not a number */
function ratOf(v) {
  if (v && v.num && typeof v.num.n === 'bigint') return ratNorm(v.num.n, v.num.d || 1n);
  const p = parseDec10(String((v && v.text) ?? ''));
  if (!p) return null;
  const neg = p.neg && p.D !== 0n;
  if (p.k >= 0) return { n: (neg ? -p.D : p.D) * 10n ** BigInt(p.k), d: 1n };
  return { n: neg ? -p.D : p.D, d: 10n ** BigInt(-p.k) };
}
/* does the fraction end in base 10? if so, how many decimals it needs */
function decScale(d) {
  let a = 0n, b = 0n, x = d;
  while (x % 2n === 0n) { x /= 2n; a += 1n; }
  while (x % 5n === 0n) { x /= 5n; b += 1n; }
  return x === 1n ? Number(a > b ? a : b) : -1;
}
/* fraction → mantissa D × 10^k (unsigned), exact when it terminates, else
   truncated at `guard` fraction digits (the caller rounds from there) */
function ratMantissa(r, guard) {
  const neg = r.n < 0n;
  const n = neg ? -r.n : r.n;
  const s = decScale(r.d);
  if (s >= 0) {
    const D = n * 10n ** BigInt(s) / r.d;
    return { D, k: -s, neg, exact: true };
  }
  const ip = n / r.d;
  let rem = n % r.d, fr = 0n;
  for (let i = 0; i < guard; i++) { rem *= 10n; fr = fr * 10n + rem / r.d; rem %= r.d; }
  const gl = BigInt(guard);
  return { D: ip * 10n ** gl + fr, k: -guard, neg, exact: false };
}
function computeOperator(cfg, va, vb) {
  if (!va || !vb) return { ok: false, why: 'needAB' };
  const opId = cfg.op || 'add';
  const a = ratOf(va), b = ratOf(vb);
  if (!a || !b) return { ok: false, why: 'bad' };
  let r;
  if (opId === 'add') r = ratNorm(a.n * b.d + b.n * a.d, a.d * b.d);
  else if (opId === 'sub') r = ratNorm(a.n * b.d - b.n * a.d, a.d * b.d);
  else if (opId === 'mul') r = ratNorm(a.n * b.n, a.d * b.d);
  else if (opId === 'div') {
    if (b.n === 0n) return { ok: false, why: 'divzero' };
    r = ratNorm(a.n * b.d, a.d * b.n);
  } else if (opId === 'mod') {
    if (b.n === 0n) return { ok: false, why: 'divzero' };
    const q = (a.n * b.d) / (a.d * b.n);          /* BigInt / truncates toward zero */
    r = ratNorm(a.n * b.d - q * a.d * b.n, a.d * b.d);
  } else if (opId === 'pow') {
    if (b.d !== 1n) return { ok: false, why: 'powint' };
    const e = b.n;
    if (e > 100000n || e < -100000n) return { ok: false, why: 'powint' };
    if (e >= 0n) r = ratNorm(a.n ** e, a.d ** e);
    else {
      if (a.n === 0n) return { ok: false, why: 'divzero' };
      r = ratNorm(a.d ** -e, a.n ** -e);
    }
  } else return { ok: false, why: 'bad' };
  /* render in the LEFT operand's number system when it has one (B's otherwise,
     plain arbitrary-precision decimals when neither came from a Number) */
  const sys = (va.num && va.num.numtype) ? va.num : (vb.num && vb.num.numtype) ? vb.num : { numtype: 'dec' };
  let out;
  if (sys.numtype === 'int') {
    out = formatIntB(r.n / r.d, Math.min(36, Math.max(1, sys.base | 0 || 10)));
  } else if (sys.numtype === 'float' || sys.numtype === 'fixed') {
    const m = ratMantissa(r, 45);
    const dg = Math.min(100, Math.max(1, sys.digits | 0 || 6));
    if (sys.numtype === 'float') { const rr = roundSig(m.D, m.k, dg); out = renderPlain(rr.D, rr.k, m.neg); }
    else out = fixedFormat(m.D, m.k, m.neg, dg);
  } else {
    const m = ratMantissa(r, 45);
    if (m.exact) out = renderPlain(m.D, m.k, m.neg);
    else { const rr = roundSig(m.D, m.k, 30); out = renderPlain(rr.D, rr.k, m.neg); }
  }
  return { ok: true, out, rat: r, sys };
}

/* ---------- the Comparator module: exact yes/no on BigInt fractions ----------
   >, <, ≥, ≤, =, ≠ — the two wired operands compare as exact rationals
   (cross-multiplied, never floats), the verdict renders as true/false and
   flows on as 1/0 so a comparison can chain into arithmetic. true/false are
   values, like digits: never localized. */
const CMPS = {
  gt: { sym: '>', name: () => t(lang, 'cmpGt') },
  lt: { sym: '<', name: () => t(lang, 'cmpLt') },
  gte: { sym: '≥', name: () => t(lang, 'cmpGte') },
  lte: { sym: '≤', name: () => t(lang, 'cmpLte') },
  eq: { sym: '=', name: () => t(lang, 'cmpEq') },
  neq: { sym: '≠', name: () => t(lang, 'cmpNeq') },
};
function computeComparator(cfg, va, vb) {
  if (!va || !vb) return { ok: false, why: 'needAB' };
  const a = ratOf(va), b = ratOf(vb);
  if (!a || !b) return { ok: false, why: 'bad' };
  const l = a.n * b.d, r = b.n * a.d;   /* cross-multiply: exact comparison */
  const id = cfg.cmp || 'gt';
  const v = id === 'gt' ? l > r : id === 'lt' ? l < r : id === 'gte' ? l >= r
    : id === 'lte' ? l <= r : id === 'eq' ? l === r : l !== r;
  return { ok: true, out: v ? 'true' : 'false', val: v };
}

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

/* ---------- code engines: JavaScript, Python, C++ in a sandbox worker;
   Java on the main thread through CheerpJ + the ECJ compiler.
   Every runtime downloads on demand, the first time it is used. ---------- */
const CODE_LANGS = [['js', 'JavaScript'], ['python', 'Python'], ['cpp', 'C++'], ['java', 'Java']];
const CODE_DEFAULTS = {
  js: "// input = the text wired into this node\nconsole.log('Hello from JavaScript!');\nconsole.log(input.toUpperCase());",
  python: "# input = the text wired into this node\nprint('Hello from Python!')\nprint(input.upper())",
  cpp: '#include <iostream>\n#include <string>\nint main() {\n  std::string s;\n  std::getline(std::cin, s);\n  std::cout << "Hello from C++! " << s << "\\n";\n}',
  java: 'public class Main {\n  public static void main(String[] a) throws Exception {\n    System.out.println("Hello from Java!");\n    System.out.println(new String(System.in.readAllBytes()).trim());\n  }\n}',
};
const BUILD = '1f524b75';
const BV = BUILD === '1f524b75' ? '' : '?v=' + BUILD;
const WORKER_TIMEOUT = { js: 10000, python: 120000, cpp: 180000 };
const codeWorkers = {};

function codeWorker(lid) {
  if (codeWorkers[lid]) return codeWorkers[lid];
  const w = new Worker('codebox.js' + BV, { type: 'module' });
  const S = { w, next: 1, pending: new Map() };
  w.onmessage = (ev) => {
    const msg = ev.data;
    const p = S.pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'out') p.out += msg.chunk;
    else if (msg.type === 'status') { if (p.onStatus) p.onStatus(msg.msg); }
    else if (msg.type === 'needin') {
      /* the program is asking for a line of stdin: the pane answers it. The
         typed line joins the run's stdout in chronological order, so the
         pane renders a real terminal transcript */
      const reply = (line) => {
        if (line !== null && line !== undefined) p.out += msg.prompt + line + '\n';
        try { S.w.postMessage({ type: 'providein', line }); } catch { /* worker gone */ }
      };
      if (p.onNeedIn) p.onNeedIn(msg.prompt, reply);
      else reply(null);   /* no pane attached (API runs): end of input */
    }
    else if (msg.type === 'done') {
      S.pending.delete(msg.id);
      clearTimeout(p.timer);
      p.resolve({ ok: msg.ok, output: p.out, error: msg.error, ms: msg.ms });
    }
  };
  codeWorkers[lid] = S;
  return S;
}

function workerRun(lid, code, input, onStatus, onNeedIn) {
  const S = codeWorker(lid);
  const id = S.next++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      S.pending.delete(id);
      try { S.w.terminate(); } catch { /* already gone */ }
      codeWorkers[lid] = null; /* respawn fresh next time */
      resolve({ ok: false, output: '', error: '', ms: WORKER_TIMEOUT[lid], timeout: true });
    }, WORKER_TIMEOUT[lid] || 120000);
    S.pending.set(id, { resolve, timer, out: '', onStatus, onNeedIn });
    S.w.postMessage({ id, lang: lid, code, input });
  });
}

/* Java: CheerpJ's OpenJDK 17 runtime + the Eclipse compiler (vendored ecj.jar). */
const JAVA = { phase: 'idle', Files: null, Paths: null, compiled: new Map() };
const RUNNER_SRC = (cls) => `import java.io.*;
public class Runner {
  static volatile Throwable err;
  public static void main(String[] args) throws Exception {
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    ByteArrayOutputStream eb = new ByteArrayOutputStream();
    System.setOut(new PrintStream(buf, true, "UTF-8"));
    System.setErr(new PrintStream(eb, true, "UTF-8"));
    System.setIn(new ByteArrayInputStream(args[0].getBytes("UTF-8")));
    Thread t = new Thread(() -> { try { ${cls}.main(args); } catch (Throwable x) { err = x; } });
    t.setDaemon(true);
    t.start();
    t.join(15000);
    int code = 0;
    if (err != null) { err.printStackTrace(); code = 1; }
    else if (t.isAlive()) { System.err.println("timeout: still running after 15 s"); code = 124; }
    try (Writer w = new OutputStreamWriter(new FileOutputStream("/files/stdout.txt"), "UTF-8")) { w.write(buf.toString("UTF-8")); }
    try (Writer w = new OutputStreamWriter(new FileOutputStream("/files/stderr.txt"), "UTF-8")) { w.write(eb.toString("UTF-8")); }
    System.exit(code);
  }
}`;

async function jRead(path) {
  const s = await JAVA.Files.readString(await JAVA.Paths.get(path));
  return String(s);
}

async function javaRun(code, input, onStatus) {
  const t0 = Date.now();
  if (!globalThis.cheerpjInit) {
    onStatus('load');
    await new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cjrtnc.leaningtech.com/4.3/loader.js';
      sc.onload = res;
      sc.onerror = () => rej(new Error('cheerpj loader failed'));
      document.head.appendChild(sc);
    });
  }
  if (JAVA.phase === 'idle') {
    JAVA.phase = 'init';
    try {
      onStatus('init');
      await cheerpjInit({ version: 17, status: 'none' });
      const lib = await cheerpjRunLibrary('');
      JAVA.Files = await lib.java.nio.file.Files;
      JAVA.Paths = await lib.java.nio.file.Paths;
      const StdCopy = await lib.java.nio.file.StandardCopyOption;
      onStatus('jdk');
      /* a writable JDK-shaped dir: the runtime's modules image + jrt-fs + release */
      await JAVA.Files.createDirectories(await JAVA.Paths.get('/files/jdk/lib'));
      await JAVA.Files.copy(await JAVA.Paths.get('/lt/17/lib/modules'), await JAVA.Paths.get('/files/jdk/lib/modules'), [StdCopy.REPLACE_EXISTING]);
      cheerpOSAddStringFile('/str/ecj.jar', new Uint8Array(await (await fetch('ecj.jar' + BV)).arrayBuffer()));
      cheerpOSAddStringFile('/str/jrtfs.jar', new Uint8Array(await (await fetch('jrt-fs.jar' + BV)).arrayBuffer()));
      await JAVA.Files.copy(await JAVA.Paths.get('/str/jrtfs.jar'), await JAVA.Paths.get('/files/jdk/lib/jrt-fs.jar'), [StdCopy.REPLACE_EXISTING]);
      cheerpOSAddStringFile('/str/release', 'JAVA_VERSION="17"');
      await JAVA.Files.copy(await JAVA.Paths.get('/str/release'), await JAVA.Paths.get('/files/jdk/release'), [StdCopy.REPLACE_EXISTING]);
      JAVA.phase = 'ready';
    } catch (e) {
      JAVA.phase = 'idle';
      throw e;
    }
  }
  while (JAVA.phase === 'init') await new Promise((r) => setTimeout(r, 300)); /* another run is setting up */

  const cls = (code.match(/public\s+class\s+([A-Za-z_$][\w$]*)/) || code.match(/class\s+([A-Za-z_$][\w$]*)/) || [, 'Main'])[1];
  const key = cls + '\u0000' + code;
  if (!JAVA.compiled.has(key)) {
    cheerpOSAddStringFile('/str/' + cls + '.java', code);
    cheerpOSAddStringFile('/str/Runner.java', RUNNER_SRC(cls));
    onStatus('compile');
    const r = await cheerpjRunMain('org.eclipse.jdt.internal.compiler.batch.Main', '/str/ecj.jar:/files',
      '--system', '/files/jdk', '-d', '/files', '-log', '/files/ecj.txt', '/str/' + cls + '.java', '/str/Runner.java');
    if (r !== 0) {
      let log = '';
      try { log = await jRead('/files/ecj.txt'); } catch { /* no log written */ }
      if (log.startsWith('<?xml') || log.startsWith('<')) log = log.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return { ok: false, output: '', error: log, ms: Date.now() - t0 };
    }
    JAVA.compiled.set(key, 1);
  }
  onStatus('run');
  const r = await cheerpjRunMain('Runner', '/files', input);
  let stdout = '', stderr = '';
  try { stdout = await jRead('/files/stdout.txt'); } catch { /* nothing written */ }
  try { stderr = await jRead('/files/stderr.txt'); } catch { /* nothing written */ }
  return { ok: r === 0, output: stdout, error: r === 124 ? 'timeout' : stderr, ms: Date.now() - t0 };
}

/* status text for the node's little status line */
function phaseText(ph, name) {
  if (ph === 'pyodide' || ph === 'clang' || ph === 'load' || ph === 'init' || ph === 'jdk') return t(lang, 'mSetup', { name });
  if (ph === 'imports') return t(lang, 'mSetup', { name });
  return t(lang, 'mBusy');
}

/* the Operator node: computes on its two wired operands, reports the
   equation in the hint line and any failure in the red status line */
function runOperatorNode(n, va, vb) {
  const el = nodeEl(n.id);
  const stat = el && el.querySelector('.mod-cstat');
  const hint = el && el.querySelector('.mod-ophint');
  const setStat = (txt, cls) => { if (stat) { stat.textContent = txt; stat.className = 'mod-cstat' + (cls ? ' ' + cls : ''); } };
  const r = computeOperator(n.cfg, va, vb);
  const op = OPS[n.cfg.op || 'add'];
  const whyText = { needAB: t(lang, 'mNeedAB'), bad: t(lang, 'mBadOperand'), divzero: t(lang, 'mDivZero'), powint: t(lang, 'mPowInt') };
  if (!r.ok) {
    if (hint) hint.textContent = '';
    setStat(whyText[r.why] || t(lang, 'mBadOperand'), 'bad');
    return { text: '', err: '' };
  }
  if (hint) hint.textContent = `${(va && va.text) ?? '?'} ${op.sym} ${(vb && vb.text) ?? '?'} = ${r.out}`;
  setStat('', '');
  /* the result keeps the operand's number system, so chained operators stay in it */
  return { text: r.out, num: { numtype: r.sys.numtype, base: r.sys.base | 0 || 10, digits: r.sys.digits | 0 || 6, n: r.rat.n, d: r.rat.d } };
}

/* the Comparator node: the verdict shows in the hint line (a sym b = true),
   any failure in the red status line; true/false flows on as 1/0 so chained
   operators can compute with the outcome of a comparison */
function runComparatorNode(n, va, vb) {
  const el = nodeEl(n.id);
  const stat = el && el.querySelector('.mod-cstat');
  const hint = el && el.querySelector('.mod-ophint');
  const setStat = (txt, cls) => { if (stat) { stat.textContent = txt; stat.className = 'mod-cstat' + (cls ? ' ' + cls : ''); } };
  const r = computeComparator(n.cfg, va, vb);
  const cmp = CMPS[n.cfg.cmp || 'gt'];
  const whyText = { needAB: t(lang, 'mNeedAB'), bad: t(lang, 'mBadOperand') };
  if (!r.ok) {
    if (hint) hint.textContent = '';
    setStat(whyText[r.why] || t(lang, 'mBadOperand'), 'bad');
    return { text: '', err: '' };
  }
  if (hint) hint.textContent = `${(va && va.text) ?? '?'} ${cmp.sym} ${(vb && vb.text) ?? '?'} = ${r.out}`;
  setStat('', '');
  return { text: r.out, num: { numtype: 'int', base: 10, digits: 6, n: r.val ? 1n : 0n, d: 1n } };
}

async function runCodeNode(n, ins) {
  const el = nodeEl(n.id);
  const stat = el && el.querySelector('.mod-cstat');
  const input = ins.map((x) => x.text ?? '').join('\n');
  const lid = n.cfg.lang || 'js';
  const name = (CODE_LANGS.find((l) => l[0] === lid) || [, 'Code'])[1];
  const setStat = (s, st) => { if (stat) { stat.textContent = s; stat.className = 'mod-cstat' + (st ? ' ' + st : ''); } };
  const flash = () => { if (el) { el.classList.remove('ran'); requestAnimationFrame(() => el.classList.add('ran')); } };
  /* a new run supersedes any prompt the previous run left open */
  const staleAsk = world.querySelector('.mod-ioask');
  if (staleAsk && staleAsk.__reply) staleAsk.__reply(null);
  setStat(t(lang, 'mSetup', { name }), 'busy');
  let r;
  try {
    r = lid === 'java'
      ? await javaRun(n.cfg.code || '', input, (ph) => setStat(phaseText(ph, name), 'busy'))
      : await workerRun(lid, n.cfg.code || '', input, (ph) => setStat(phaseText(ph, name), 'busy'),
        lid === 'python' ? (prompt, reply) => askInIo(n, prompt, reply) : undefined);
  } catch (e) {
    r = { ok: false, output: '', error: String((e && e.message) || e), ms: 0 };
  }
  /* a program that reads past its input gets a plain-language hint, not just
     a bare traceback: the input belongs in the connected I/O node */
  if (r.error && /EOFError|NoSuchElementException|NoLineFoundException/.test(r.error)) {
    r.error += '\n\n' + t(lang, 'mFeedHint');
  }
  /* no inline output field: the status dot reports the outcome on the node,
     and the connected Output module renders stdout plus the error in red */
  if (r.timeout) {
    setStat(t(lang, 'mStopped'), 'bad');
    flash();
    return { text: '', err: t(lang, 'mStopped') };
  }
  if (!r.ok && !r.output && !r.error) {
    setStat(t(lang, 'mNetErr', { name }), 'bad');
    flash();
    return { text: '', err: t(lang, 'mNetErr', { name }) };
  }
  setStat(t(lang, 'mMs', { ms: r.ms || 0 }), r.ok ? 'ok' : 'bad');
  flash();
  /* stdout keeps flowing as data; the error is display-only, so it never
     reaches a second Code node wired downstream */
  return { text: r.output || '', err: r.error || '' };
}

/* the program asked for stdin: the connected I/O node's pane turns into a
   live prompt — type the answer, the program continues. If the code node has
   no I/O terminal yet, one is created and wired right there. */
function askInIo(n, prompt, reply) {
  let io = null;
  for (const w of doc.wires) {
    const tgt = nodeOf(w.to);
    if (w.from === n.id && tgt && tgt.type === 'io') { io = tgt; break; }
  }
  if (!io) {
    io = addNode('io', n.x + TYPES[n.type].w + 80, n.y);
    globalThis.__MOD.wire(n.id, io.id);
  }
  const el = nodeEl(io.id);
  const box = el && el.querySelector('.mod-result');
  if (!box) { reply(null); return; }
  const stale = world.querySelector('.mod-ioask');
  if (stale && stale.__reply) stale.__reply(null);
  world.querySelectorAll('.mod-ioask').forEach((r) => r.remove());
  const row = document.createElement('div');
  row.className = 'mod-ioask';
  row.__reply = reply;
  const lbl = document.createElement('span');
  lbl.className = 'mod-iop';
  lbl.textContent = prompt;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'mod-ioin';
  inp.autocomplete = 'off';
  inp.setAttribute('aria-label', t(lang, 'mIO'));
  const finish = (line) => {
    row.remove();
    box.scrollTop = box.scrollHeight;
    reply(line);   /* the typed line joins the run's stdout: chronological transcript */
  };
  const submit = () => finish(inp.value);
  /* like a real terminal: no button, no box - Enter sends, Escape ends */
  inp.addEventListener('keydown', (e) => {
    if (e.isComposing) return;   /* IME mid-composition: not a submit */
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(null); }   /* end of input */
  });
  row.append(lbl, inp);
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
  requestAnimationFrame(() => { try { inp.focus(); } catch { /* detached */ } });
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

/* the exact center of a connection square, in world coordinates. The
   square's offset WITHIN its node never moves with pan or zoom, so that
   offset is measured from the rendered square and added to the node's own
   world position — the anchor stays true whatever the theme, the zoom or
   the CSS, and no stale canvas transform can displace it. (The offset math
   below is only a fallback for squares that are not laid out.) */
function portPos(id, which) {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return [0, 0];
  const el = nodeEl(id);
  const p = el && el.querySelector(which === 'out' ? '.mod-port.out' : `.mod-port.in[data-port="${which === 'in:b' ? 'b' : 'a'}"]`);
  if (p && el && view.z) {
    const pr = p.getBoundingClientRect(), nr = el.getBoundingClientRect();
    if (nr.width > 0 || nr.height > 0) {
      return [n.x + (pr.x + pr.width / 2 - nr.x) / view.z, n.y + (pr.y + pr.height / 2 - nr.y) / view.z];
    }
  }
  if (which === 'out') return [n.x + TYPES[n.type].w - 1, n.y + 22];
  if (which === 'in:b') return [n.x + 1, n.y + 54];   /* the second input node, 32px below the first */
  return [n.x + 1, n.y + 22];   /* the first input node: the standard height, like every module */
}
/* square connectors only: H-V-H polylines, sharp 90° corners, no curves */
function wirePath(a, b, toPort) {
  const [x1, y1] = portPos(a, 'out');
  const [x2, y2] = portPos(b, toPort === 'b' ? 'in:b' : 'in');
  const mid = Math.round((x1 + x2) / 2);
  return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
}

function redrawWires() {
  const sel = selectedWire;
  wiresSvg.innerHTML = doc.wires.map((w, i) =>
    `<path d="${wirePath(w.from, w.to, w.toPort)}" class="mod-wire${i === sel ? ' sel' : ''}" data-i="${i}"/>`).join('');
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

/* ---------- the code editor: Saans with the MONO axis on (Saans Mono),
   a highlight layer under a transparent textarea, and a line-number
   gutter that scrolls in sync. No external editor library. ---------- */
const GRAMMARS = {
  js: {
    line: '//', block: ['/*', '*/'],
    kw: 'const let var function class return if else for while do switch case break continue new this typeof instanceof in of null undefined true false async await import export from default try catch finally throw yield delete void static get set super extends'.split(' '),
    builtins: 'console Math JSON Object Array String Number Boolean Promise Map Set Date RegExp window document'.split(' '),
  },
  python: {
    line: '#',
    kw: 'def class return if elif else for while break continue pass import from as with try except finally raise lambda global nonlocal assert yield del in is not and or None True False async await match case'.split(' '),
    builtins: 'print int str list dict set tuple float bool range len enumerate zip map filter sum min max abs sorted input type isinstance self super'.split(' '),
    anno: true,
  },
  cpp: {
    line: '//', block: ['/*', '*/'], pre: true,
    kw: 'int float double char bool void long short unsigned signed auto const constexpr struct class union enum public private protected virtual override final return if else for while do switch case break continue new delete this nullptr true false using namespace template typename try catch throw operator sizeof explicit friend noexcept static_cast'.split(' '),
    builtins: 'std cout cin cerr endl string vector map set array size_t move forward'.split(' '),
  },
  java: {
    line: '//', block: ['/*', '*/'], anno: true,
    kw: 'public private protected static final abstract class interface enum extends implements return if else for while do switch case break continue new this null true false void int long double float char byte short boolean try catch finally throw throws import package synchronized volatile transient instanceof super var record'.split(' '),
    builtins: 'System String Math Integer Double Float Long Boolean Character List ArrayList Map HashMap Object Thread Exception Runnable StringBuilder'.split(' '),
  },
};

function highlight(src, langId) {
  const G = GRAMMARS[langId] || GRAMMARS.js;
  const kw = new Set(G.kw);
  const bi = new Set(G.builtins || []);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const out = [];
  const push = (cls, text) => out.push(cls ? `<span class="tok-${cls}">${esc(text)}</span>` : esc(text));
  let i = 0;
  const n = src.length;
  while (i < n) {
    const rest = src.slice(i);
    if (G.block && rest.startsWith(G.block[0])) {
      let e = src.indexOf(G.block[1], i + 2); if (e < 0) e = n; else e += 2;
      push('c', src.slice(i, e)); i = e; continue;
    }
    if (G.line && rest.startsWith(G.line)) {
      const e = src.indexOf('\n', i); const end = e < 0 ? n : e;
      push('c', src.slice(i, end)); i = end; continue;
    }
    if (G.pre && src[i] === '#' && (i === 0 || src[i - 1] === '\n')) {
      const e = src.indexOf('\n', i); const end = e < 0 ? n : e;
      push('p', src.slice(i, end)); i = end; continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) { j++; break; }
        if (src[j] === '\n' && ch !== '`') break;
        j++;
      }
      push('s', src.slice(i, j)); i = j; continue;
    }
    let mm = /^(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (mm) { push('n', mm[0]); i += mm[0].length; continue; }
    mm = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (mm) {
      const w = mm[0];
      push(kw.has(w) ? 'k' : bi.has(w) ? 'b' : '', w);
      i += w.length; continue;
    }
    if (G.anno && ch === '@' && (mm = /^@\w+/.exec(rest))) { push('k', mm[0]); i += mm[0].length; continue; }
    push('', ch); i++;
  }
  return out.join('');
}

function wireCodeEditor(el, n) {
  const ta = el.querySelector('.mod-codeta');
  const codeEl = el.querySelector('.mod-hl code');
  const hlPre = el.querySelector('.mod-hl');
  const gut = el.querySelector('.mod-gut-in');
  if (!ta || !codeEl || !hlPre || !gut) return;
  const syncActive = () => {
    const line = ta.value.slice(0, ta.selectionStart).split('\n').length;
    [...gut.children].forEach((s, k) => s.classList.toggle('on', k === line - 1));
  };
  const refresh = () => {
    n.cfg.code = ta.value;
    codeEl.innerHTML = highlight(ta.value, n.cfg.lang || 'js') || '\u00a0';
    const lines = ta.value.split('\n').length;
    if (gut.childElementCount !== lines) gut.innerHTML = Array.from({ length: lines }, (_, k) => `<span>${k + 1}</span>`).join('');
    syncActive();
    touch();
  };
  const sync = () => {
    hlPre.scrollTop = ta.scrollTop; hlPre.scrollLeft = ta.scrollLeft;
    gut.style.transform = `translateY(${-ta.scrollTop}px)`;
  };
  const ins = (txt) => {
    if (!document.execCommand('insertText', false, txt)) {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.setRangeText(txt, s, e, 'end');
    }
  };
  ta.addEventListener('input', refresh);
  ta.addEventListener('scroll', sync);
  for (const ev of ['click', 'keyup', 'select']) ta.addEventListener(ev, syncActive);
  ta.addEventListener('keydown', (e) => {
    if (e.isComposing) return;   /* never fight the IME (CJK input) */
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ins('  '); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const line = ta.value.slice(0, ta.selectionStart).split('\n').pop() || '';
      const ind = (line.match(/^[ \t]*/) || [''])[0];
      const extra = /[{([]\s*$/.test(line) ? '  ' : '';
      ins('\n' + ind + extra);
    }
  });
  refresh();
}

/* Singhoah's dropdown, miniaturized for node settings: a borderless chip that
   turns a solid blue on hover, and a sharp popup panel below, left-aligned,
   clamped to the viewport on small screens. No native <select> anywhere. */
function modDropdown(n, key, label, options, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'mod-dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mod-dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', label);
  const txt = document.createElement('span');
  txt.className = 'mod-dd-txt';
  txt.textContent = (options.find((o) => o[0] === (n.cfg[key] || options[0][0])) || options[0])[1];
  btn.appendChild(txt);
  btn.insertAdjacentHTML('beforeend', '<svg class="mod-dd-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 9 7 7 7-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  const list = document.createElement('div');
  list.className = 'mod-dd-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  list.hidden = true;
  const cur = () => n.cfg[key] || options[0][0];
  const sync = () => {
    txt.textContent = (options.find((o) => o[0] === cur()) || options[0])[1];
    [...list.children].forEach((b, i) => {
      const sel = options[i][0] === cur();
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-selected', String(sel));
    });
  };
  for (const [v, l] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mod-dd-opt';
    b.setAttribute('role', 'option');
    b.innerHTML = `<span class="mod-dd-lab"></span><svg class="mod-dd-chk" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 12.5 5.5 5.5L20 6.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    b.querySelector('.mod-dd-lab').textContent = l;
    b.addEventListener('click', (e) => { e.stopPropagation(); onPick(v); sync(); close(); });
    list.appendChild(b);
  }
  sync();
  const close = () => {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    const node = wrap.closest('.mod-node');
    if (node) node.classList.remove('dd-open');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const open = () => {
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const node = wrap.closest('.mod-node');
    if (node) node.classList.add('dd-open');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {   /* clamp inside the viewport, mobile included */
      const r = list.getBoundingClientRect();
      let dx = 0, dy = 0;
      if (r.right > innerWidth - 8) dx = innerWidth - 8 - r.right;
      if (r.left + dx < 8) dx = 8 - r.left;
      if (r.bottom > innerHeight - 8) dy = innerHeight - 8 - r.bottom;
      if (r.top + dy < 8) dy = 8 - r.top;
      list.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
    });
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (list.hidden) open(); else close(); });
  wrap.append(btn, list);
  return wrap;
}

/* A Singhoah number stepper: a mono field with a stacked up/down control —
   type any value, tap or hold the arrows, or use the arrow keys. The buttons
   repeat while held, so base 1–36 and 1–100 digits never need a long scroll. */
function modStepper(n, key, label, min, max, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'mod-step';
  const lab = document.createElement('span');
  lab.className = 'mod-step-lab';
  lab.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'mod-stepin';
  inp.inputMode = 'numeric';
  inp.setAttribute('aria-label', label);
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const cur = () => clamp(n.cfg[key] | 0 || min);
  const up = document.createElement('button');
  const dn = document.createElement('button');
  const apply = (v) => {
    const c = clamp(v);
    n.cfg[key] = c;
    inp.value = String(c);
    up.disabled = c >= max;
    dn.disabled = c <= min;
    onChange(c);
    touch();
  };
  up.type = 'button';
  up.className = 'mod-stepbtn';
  up.setAttribute('aria-label', t(lang, 'zoomIn'));
  up.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 15 7-7 7 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  dn.type = 'button';
  dn.className = 'mod-stepbtn';
  dn.setAttribute('aria-label', t(lang, 'zoomOut'));
  dn.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 9 7 7 7-7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  /* hold to repeat: a long press sweeps the range, no scrolling through lists */
  const hold = (btn, dir) => {
    let iv = 0;
    let lastPtr = 0;
    const stop = () => { clearInterval(iv); iv = 0; };
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      lastPtr = Date.now();
      apply(cur() + dir);
      iv = setInterval(() => apply(cur() + dir), 90);
      const done = () => { stop(); document.removeEventListener('pointerup', done, true); document.removeEventListener('pointercancel', done, true); };
      document.addEventListener('pointerup', done, true);
      document.addEventListener('pointercancel', done, true);
    });
    btn.addEventListener('pointerleave', stop);
    /* keyboard or synthetic activation still steps once; a real tap already
       stepped on pointerdown, so the click that follows is ignored */
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (Date.now() - lastPtr < 700) return; apply(cur() + dir); });
  };
  hold(up, 1);
  hold(dn, -1);
  const commit = () => { const m = /^-?\d{1,4}$/.exec(inp.value.trim()); apply(m ? parseInt(inp.value, 10) : cur()); };
  inp.addEventListener('change', commit);
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); apply(cur() + 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); apply(cur() - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(); }
  });
  const btns = document.createElement('span');
  btns.className = 'mod-stepbtns';
  btns.append(up, dn);
  wrap.append(lab, inp, btns);
  requestAnimationFrame(() => { inp.value = String(cur()); up.disabled = cur() >= max; dn.disabled = cur() <= min; });
  return wrap;
}

function renderNode(n) {
  const T = TYPES[n.type];
  if (!T) return;   /* retired module types are migrated on open; be safe anyway */
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
    body = `<div class="mod-body"><textarea class="mod-ta" rows="4" placeholder="${t(lang, 'mText')}…"></textarea><div class="mod-dd-slot"></div><p class="mod-hint"># &nbsp;**b** &nbsp;*i* &nbsp;\`c\`</p></div>`;
  } else if (n.type === 'code') {
    /* no inline output field: results and errors render in the connected
       Output module, stdin comes from Text modules and Input modules */
    body = `<div class="mod-body"><div class="mod-dd-slot"></div><div class="mod-ed"><div class="mod-gut" aria-hidden="true"><div class="mod-gut-in"></div></div><div class="mod-edstack"><pre class="mod-hl" aria-hidden="true"><code></code></pre><textarea class="mod-ta mod-codeta" rows="7" wrap="off" spellcheck="false" placeholder="${t(lang, 'mCodePh')}" aria-label="${t(lang, 'mCode')}"></textarea></div></div><div class="mod-cstat" aria-live="polite"></div></div>`;
  } else if (n.type === 'operator' || n.type === 'comparator') {
    /* the Operator and Comparator share one body: an operation select over
       the two wired operands. A lone control spans its row exactly, like
       the Code module's language select (12px insets, symmetric); the hint
       line shows the equation or verdict, the status line turns red on bad
       input — and stays silent while the module is simply waiting */
    body = `<div class="mod-body"><div class="mod-dd-slot"></div><p class="mod-numhint mod-ophint"></p><div class="mod-cstat" aria-live="polite"></div></div>`;
  } else if (n.type === 'number') {
    /* the Number module: type select + base select (Integer/Decimal) or digit
       count (Float/Fixed), a mono value field, and a base-10 hint. The value
       itself is always plain digits a–z — never localized numerals. */
    body = `<div class="mod-body"><div class="mod-ddrow mod-dd-slot"></div><input class="mod-numin" spellcheck="false" autocomplete="off" placeholder="${t(lang, 'mValue')}" aria-label="${t(lang, 'mValue')}"><p class="mod-numhint"></p><div class="mod-cstat"></div></div>`;
  } else if (n.type === 'io') {
    /* a terminal, recognizable at a glance: traffic-light dots, always-dark
       screen, monospace type, a > prompt marking the input line */
    body = `<div class="mod-body mod-term"><div class="mod-tbar" aria-hidden="true"><span></span><span></span><span></span></div><div class="mod-tscreen"><div class="mod-result"><span class="mod-empty">${t(lang, 'mResult')} —</span></div><div class="mod-tin"><span class="mod-tp">&gt;</span><textarea class="mod-ta mod-inta" rows="3" placeholder="${t(lang, 'mIOPh')}" aria-label="${t(lang, 'mIO')}"></textarea></div></div></div>`;
  } else {
    body = `<div class="mod-body"><div class="mod-result"><span class="mod-empty">${t(lang, 'mResult')} —</span></div></div>`;
  }
  /* connection nodes sit on the module's edge exactly like every other
     module's: the first input node at the standard height (the same spot as
     the I/O and Code modules' input, in line with the out node), the second
     input node just below it on the same 32px rhythm */
  const inPortsHtml = T.inPorts
    ? T.inPorts.map((pt, i) => `<span class="mod-port in p${pt}" data-port="${pt}" style="top:${13 + i * 32}px"></span>`).join('')
    : (T.hasIn ? '<span class="mod-port in" data-port="a"></span>' : '');
  el.innerHTML = head + body + inPortsHtml + (T.hasOut ? '<span class="mod-port out"></span>' : '');
  el.querySelectorAll('.mod-port').forEach((p) => { p.style.borderColor = T.color; });

  const ta = el.querySelector('.mod-ta');
  if (ta) {
    ta.value = n.cfg.text || '';
    ta.addEventListener('input', () => { n.cfg.text = ta.value; touch(); });
  }
  const cta = el.querySelector('.mod-codeta');
  if (cta) {
    cta.value = n.cfg.code || '';
    wireCodeEditor(el, n);
  }
  const slot = el.querySelector('.mod-dd-slot');
  if (slot && n.type === 'text') {
    slot.appendChild(modDropdown(n, 'enc', t(lang, 'mText'),
      ENCS.map((e) => [e, t(lang, 'enc' + ({ plain: 'Plain', b64: 'B64', url: 'Url', hex: 'Hex', uni: 'Uni', ent: 'Ent', rot: 'Rot' }[e]))]),
      (v) => { n.cfg.enc = v; touch(); }));
  } else if (slot && n.type === 'code') {
    slot.appendChild(modDropdown(n, 'lang', t(lang, 'mLang'), CODE_LANGS, (v) => {
      const prev = n.cfg.lang || 'js';
      if ((n.cfg.code || '') === (CODE_DEFAULTS[prev] || '')) n.cfg.code = CODE_DEFAULTS[v] || '';
      n.cfg.lang = v;
      if (cta) { cta.value = n.cfg.code || ''; cta.dispatchEvent(new Event('input', { bubbles: true })); }
      touch();
    }));
  } else if (slot && n.type === 'number') {
    /* live validation: the hint shows the base-10 equivalent, the status line
       turns red when the value does not parse in the chosen type and base */
    const revalidate = () => {
      const r = computeNumber(n.cfg);
      const hint = el.querySelector('.mod-numhint');
      const stat = el.querySelector('.mod-cstat');
      if (hint) hint.textContent = r.ok ? (r.hint || '') : '';
      if (stat) {
        stat.textContent = r.ok ? '' : t(lang, 'mInvalid');
        stat.className = 'mod-cstat' + (r.ok ? '' : ' bad');
      }
    };
    const NUM_TYPES = [['int', t(lang, 'mInt')], ['dec', t(lang, 'mDec')], ['float', t(lang, 'mFloat')], ['fixed', t(lang, 'mFixed')]];
    const nt = n.cfg.numtype || 'int';
    slot.appendChild(modDropdown(n, 'numtype', t(lang, 'mType'), NUM_TYPES,
      (v) => { n.cfg.numtype = v; renderNode(n); }));   /* rebuild: the second dropdown depends on the type */
    if (nt === 'int' || nt === 'dec') {
      slot.appendChild(modStepper(n, 'base', t(lang, 'mBase'), 1, 36, () => revalidate()));
    } else {
      slot.appendChild(modStepper(n, 'digits', t(lang, 'mDigits'), 1, 100, () => revalidate()));
    }
    const nin = el.querySelector('.mod-numin');
    if (nin) {
      nin.value = n.cfg.value ?? '0';
      nin.addEventListener('input', () => { n.cfg.value = nin.value; revalidate(); touch(); });
    }
    revalidate();
  } else if (slot && n.type === 'operator') {
    slot.appendChild(modDropdown(n, 'op', t(lang, 'mOperator'),
      Object.entries(OPS).map(([id, o]) => [id, `${o.sym}  ${o.name()}`]),
      (v) => { n.cfg.op = v; touch(); }));
  } else if (slot && n.type === 'comparator') {
    slot.appendChild(modDropdown(n, 'cmp', t(lang, 'mComparator'),
      Object.entries(CMPS).map(([id, c]) => [id, `${c.sym}  ${c.name()}`]),
      (v) => { n.cfg.cmp = v; touch(); }));
  }
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
          const tPort = target.dataset.port || 'a';
          const tn = nodeOf(tNode);
          const okPort = !TYPES[tn.type].inPorts || TYPES[tn.type].inPorts.includes(tPort);
          if (tNode !== n.id && okPort) {
            /* one wire per node, both ends: this node's previous wire moves with the new drop */
            doc.wires = doc.wires.filter((w) => !(w.to === tNode && (w.toPort || 'a') === tPort) && w.from !== n.id);
            doc.wires.push({ from: n.id, to: tNode, toPort: tPort });
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
  /* adding with no canvas on screen (files home) would silently mutate a
     hidden, unsaved doc — start a fresh one instead so the addition is real */
  if ($('modEditor').hidden) newDoc();
  /* no explicit spot: land the module in whatever the user is looking at —
     a set point relative to the CURRENT view (cascading so repeats never
     stack), clamped inside the world — never a fixed far-off coordinate */
  if (x == null || y == null) {
    const vl = -view.x / view.z, vt = -view.y / view.z;   /* the visible world rect */
    const c = (seq % 5) * 26;
    x = vl + 60 + c;
    y = vt + 40 + c;
  }
  x = Math.min(Math.max(x, 0), Math.max(0, 4000 - TYPES[type].w - 24));
  y = Math.min(Math.max(y, 0), 2800);
  const n = {
    id: 'n' + (++seq) + Date.now().toString(36).slice(-3),
    type, x: snap(x), y: snap(y),
    cfg: type === 'text' ? { text: '', enc: 'plain' } : type === 'io' ? { text: '' } : type === 'code' ? { lang: 'js', code: CODE_DEFAULTS.js } : type === 'number' ? { numtype: 'int', base: 10, digits: 6, value: '0' } : type === 'operator' ? { op: 'add' } : type === 'comparator' ? { cmp: 'gt' } : {},
  };
  doc.nodes.push(n);
  renderNode(n);
  redrawWires();
  touch();
  return n;
}

/* pan the canvas; zoom anchors at the cursor (wheel) or between the fingers
   (pinch) — the world point under the anchor stays under it, like every
   canvas tool. The zoom buttons anchor at the viewport center. */
function zoomAt(cx, cy, z) {
  const r = canvas.getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  const wx = (px - view.x) / view.z, wy = (py - view.y) / view.z;   /* world point under the anchor */
  view.z = Math.min(1.8, Math.max(0.4, Math.round(z * 100) / 100));
  view.x = px - wx * view.z;
  view.y = py - wy * view.z;
  applyView();
  $('modZoomR').textContent = `${Math.round(view.z * 100)}%`;
}
function setZoom(z) {
  const r = canvas.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, z);
}
const cpts = new Map();   /* live canvas pointers: one pans, two pinch */
let pinch = null, panMoved = false;
canvas.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.mod-node') || e.target.closest('.mod-zoom')) return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events carry no real pointer */ }
  cpts.set(e.pointerId, { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY });
  panMoved = false;
  if (cpts.size === 2) {
    const [a, b] = [...cpts.values()];
    const r = canvas.getBoundingClientRect();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: view.z,
      wx: (mx - r.left - view.x) / view.z, wy: (my - r.top - view.y) / view.z };
  }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = cpts.get(e.pointerId);
  if (!prev) return;
  cpts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && cpts.size >= 2) {
    const [a, b] = [...cpts.values()];
    const r = canvas.getBoundingClientRect();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    view.z = Math.min(1.8, Math.max(0.4, Math.round(pinch.z * d / pinch.d * 100) / 100));
    view.x = mx - r.left - pinch.wx * view.z;
    view.y = my - r.top - pinch.wy * view.z;
    applyView();
    $('modZoomR').textContent = `${Math.round(view.z * 100)}%`;
  } else if (!pinch) {
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (dx || dy) {
      if (Math.abs(e.clientX - prev.sx) + Math.abs(e.clientY - prev.sy) > 3) panMoved = true;
      view.x += dx;
      view.y += dy;
      applyView();
    }
  }
});
const endPtr = (e) => {
  cpts.delete(e.pointerId);
  if (cpts.size < 2) pinch = null;
  if (cpts.size === 0 && !panMoved && selectedWire !== -1) { selectedWire = -1; redrawWires(); }
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, view.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
}, { passive: false });
$('modZoomIn').addEventListener('click', () => setZoom(view.z * 1.2));
$('modZoomOut').addEventListener('click', () => setZoom(view.z / 1.2));
$('modZoomR').addEventListener('click', () => { view = { x: 40, y: 20, z: 1 }; setZoom(1); applyView(); });

/* ---------- run the flow: Text → [Code] → Markdown → Output ---------- */
let running = false;
async function run() {
  if (running) return [];
  if ($('modEditor').hidden) return [];   /* never run a flow that is not on screen */
  running = true;
  $('modRun').disabled = true;
  try {
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
      if (n.type === 'text') {
        /* Markdown is native: plain text renders as Markdown downstream */
        v = { text: encode(n.cfg.enc || 'plain', n.cfg.text || '') };
        if ((n.cfg.enc || 'plain') === 'plain') v.html = mdToHtml(n.cfg.text || '');
      }
      else if (n.type === 'number') {
        /* the number flows on exactly as shown in its own representation —
           and carries its exact rational + number system for the Operator */
        const r = computeNumber(n.cfg);
        v = { text: r.ok ? r.out : '' };
        if (r.ok) v.num = { numtype: n.cfg.numtype || 'int', base: n.cfg.base | 0 || 10, digits: n.cfg.digits | 0 || 6, n: r.rat.n, d: r.rat.d };
      }
      else if (n.type === 'operator') {
        /* each input node feeds one operand: A (top) and B (bottom) */
        const wa = doc.wires.find((w) => w.to === n.id && (w.toPort || 'a') === 'a');
        const wb = doc.wires.find((w) => w.to === n.id && w.toPort === 'b');
        v = runOperatorNode(n, wa ? val[wa.from] : undefined, wb ? val[wb.from] : undefined);
      }
      else if (n.type === 'comparator') {
        /* same two-node shape as the Operator: A above, B below */
        const wa = doc.wires.find((w) => w.to === n.id && (w.toPort || 'a') === 'a');
        const wb = doc.wires.find((w) => w.to === n.id && w.toPort === 'b');
        v = runComparatorNode(n, wa ? val[wa.from] : undefined, wb ? val[wb.from] : undefined);
      }
      else if (n.type === 'code') {
        /* stdin: the text typed into attached I/O nodes first, then whatever
           Text modules wire into the left port. An empty I/O pane contributes
           nothing — it must not shift the input with blank lines. */
        const ioTexts = doc.wires
          .filter((w) => w.from === n.id && nodeOf(w.to) && nodeOf(w.to).type === 'io' && String(nodeOf(w.to).cfg.text || '').length > 0)
          .map((w) => ({ text: String(nodeOf(w.to).cfg.text) }));
        v = await runCodeNode(n, [...ioTexts, ...ins]);
      }
      else {
        const texts = ins.map((x) => x.text ?? '').join('\n');
        const errs = ins.map((x) => x && x.err).filter(Boolean).join('\n');
        v = { text: texts };   /* the error is display-only: it never flows on as data */
        const el = nodeEl(n.id);
        if (el) {
          const box = el.querySelector('.mod-result');
          if (box) {
            if (ins.length === 1 && ins[0].html !== undefined && !errs) box.innerHTML = `<div class="mod-md">${ins[0].html}</div>`;
            else {
              box.textContent = '';
              if (texts) { const d = document.createElement('div'); d.className = 'mod-out'; d.textContent = texts; box.appendChild(d); }
              if (errs) { const d = document.createElement('div'); d.className = 'mod-err'; d.textContent = errs; box.appendChild(d); }
              if (!texts && !errs) box.innerHTML = `<span class="mod-empty">${t(lang, 'mResult')} —</span>`;
            }
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
  } finally { running = false; $('modRun').disabled = false; }
}

/* ---------- persistence: a flow is a document ---------- */
let pendingSave = false;   /* unsaved local edits keep authority over remote changes */
function touch() {
  clearTimeout(saveTimer);
  pendingSave = true;
  saveTimer = setTimeout(() => {
    pendingSave = false;
    if (!docId) return;
    FS.docsSave(docId, { title: $('modTitle').value, data: { nodes: doc.nodes, wires: doc.wires, grid: doc.grid, seq } });
  }, 500);
}
/* Markdown used to be its own module; it lives in Text now. Old flows get
   their markdown nodes spliced out: every input is wired straight through to
   every output, so Text → Markdown → Output becomes Text → Output. */
function migrateDoc() {
  let changed = false;
  /* the Input and Output modules merged into the I/O node */
  for (const n of doc.nodes) {
    if (n.type === 'input' || n.type === 'output') { n.type = 'io'; changed = true; }
  }
  const gone = new Set(doc.nodes.filter((n) => !TYPES[n.type]).map((n) => n.id));
  let wires = doc.wires;
  if (gone.size) {
    const nw = [];
    for (const w of doc.wires) {
      if (gone.has(w.to)) {
        /* splice: wire this input straight through to the retired node's outputs */
        for (const w2 of doc.wires) {
          if (w2.from === w.to && !gone.has(w2.to) && !nw.some((x) => x.from === w.from && x.to === w2.to)) {
            nw.push({ from: w.from, to: w2.to });
          }
        }
      } else if (!gone.has(w.from) && !nw.some((x) => x.from === w.from && x.to === w.to)) {
        nw.push(w);
      }
    }
    doc.nodes = doc.nodes.filter((n) => !gone.has(n.id));
    wires = nw.filter((w) => !gone.has(w.from) && !gone.has(w.to));   /* nothing dangling, ever */
    changed = true;
  }
  /* one wire per node, on both ends: a connection node holds exactly one wire,
     so keep only the newest wire leaving each out node and entering each in node */
  const kept = [];
  for (const w of wires) {
    const iOut = kept.findIndex((x) => x.from === w.from);
    if (iOut >= 0) { kept.splice(iOut, 1); changed = true; }
    const iIn = kept.findIndex((x) => x.to === w.to && (x.toPort || 'a') === (w.toPort || 'a'));
    if (iIn >= 0) { kept.splice(iIn, 1); changed = true; }
    kept.push(w);
  }
  doc.wires = kept;
  return changed;
}

function openDoc(id) {
  const d = FS.docsGet(id);
  if (!d || d.kind !== 'flow') return showHome();
  if (docId) { clearTimeout(saveTimer); }
  docId = id;
  doc = { nodes: (d.data && d.data.nodes) || [], wires: (d.data && d.data.wires) || [], grid: d.data ? d.data.grid !== false : true };
  const migrated = migrateDoc();
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
  /* the world transform must settle BEFORE any wire is drawn — a wire's
     anchor is measured from the rendered squares, so drawing them under the
     previous document's pan/zoom would land them off their squares */
  applyView();
  setZoom(1);
  redrawWires();
  requestAnimationFrame(redrawWires);   /* and once more when layout is fully in — correct every time */
  if (migrated) touch();   /* save the migrated shape so it never migrates twice */
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
  $('modAddIO').textContent = t(lang, 'mIO');
  $('modAddC').textContent = t(lang, 'mCode');
  $('modAddN').textContent = t(lang, 'mNumber');
  $('modAddO').textContent = t(lang, 'mOperator');
  $('modAddCmp').textContent = t(lang, 'mComparator');
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

/* cloud sync (Google account): documents created, edited or deleted on
   another signed-in device arrive as singhoah:docs on the page that adopted
   them — and, when a sibling tab did the adopting, as a storage event here.
   The files home repaints live; an open flow refreshes only when the user
   is not mid-edit and nothing is unsaved — local edits always win until
   their own save pushes back. */
function docsChangedRemote(changedIds) {
  if (!$('modHome').hidden) { showHome(); return; }
  if (!docId || pendingSave) return;
  const editing = document.activeElement && document.activeElement.closest('.mod-node, #modTitle');
  if (editing) return;
  if (changedIds && !changedIds.includes(docId)) return;
  const L = FS.docsGet(docId);
  if (!L) { showHome(); return; }   /* deleted on another device */
  const same = JSON.stringify({ n: doc.nodes, w: doc.wires }) === JSON.stringify({ n: L.data.nodes || [], w: L.data.wires || [] })
    && (L.title || '') === $('modTitle').value;
  if (!same) openDoc(docId);
}
document.addEventListener('singhoah:docs', (e) => docsChangedRemote((e.detail && e.detail.changedIds) || null));
addEventListener('storage', (e) => {
  if (e.key === 'singhoah:docs' && e.newValue !== e.oldValue) docsChangedRemote(null);
});

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
  wire: (a, b, port = 'a') => {
    /* standardized with the canvas: the source needs an out node, the target an in node */
    const A = nodeOf(a), B = nodeOf(b);
    if (!A || !B || !TYPES[A.type].hasOut || !TYPES[B.type].hasIn) return false;
    if (TYPES[B.type].inPorts && !TYPES[B.type].inPorts.includes(port)) return false;
    /* one wire per port, both ends: rewiring moves the connection */
    doc.wires = doc.wires.filter((w) => !(w.to === b && (w.toPort || 'a') === port) && w.from !== a);
    doc.wires.push({ from: a, to: b, toPort: port });
    redrawWires(); touch();
    return true;
  },
  removeNode,
  cfg: (id, patch) => { const n = doc.nodes.find((x) => x.id === id); if (!n) return null; Object.assign(n.cfg, patch); const el = nodeEl(id); if (el && patch && patch.text !== undefined) { const ta = el.querySelector('.mod-ta'); if (ta) ta.value = patch.text; } if (el && patch && patch.code !== undefined) { const ta = el.querySelector('.mod-codeta'); if (ta) { ta.value = patch.code; ta.dispatchEvent(new Event('input', { bubbles: true })); } } if (el && patch.value !== undefined) { const ni = el.querySelector('.mod-numin'); if (ni) { ni.value = patch.value; ni.dispatchEvent(new Event('input', { bubbles: true })); } }
  if (el && (patch.enc !== undefined || patch.lang !== undefined || patch.numtype !== undefined || patch.base !== undefined || patch.digits !== undefined || patch.op !== undefined || patch.cmp !== undefined)) renderNode(n); touch();   /* programmatic edits (SMate, flows) persist and sync like typed ones */ return { ...n.cfg }; },
  grid: (v) => { if (v !== undefined) { doc.grid = !!v; $('modGrid').setAttribute('aria-pressed', String(doc.grid)); applyView(); touch(); } return doc.grid; },
  outputText: () => [...world.querySelectorAll('.mod-node .mod-result')].map((r) => r.textContent).join('\n'),
  view: () => ({ ...view }),
  latest: () => { const l = FS.docsList('flow'); return l.length ? l[0].id : null; },
  runCode: (lid, code, input) => (lid === 'java' ? javaRun(code, input || '', () => {}) : workerRun(lid, code, input || '', () => {})),
};
