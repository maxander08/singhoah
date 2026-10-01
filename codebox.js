/* codebox.js — SinghoModule's sandbox worker.
   Runs JavaScript (with npm imports via esm.run), Python (Pyodide) and
   C++ (wasm-clang) off the UI thread. Java runs on the main thread via
   CheerpJ (see module.js) because it needs the page environment. */

import API from './wcglue.js';

const CDN = {
  pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  clang: 'https://raw.githubusercontent.com/binji/wasm-clang/master/clang',
  lld: 'https://cdn.jsdelivr.net/gh/binji/wasm-clang@master/lld',
  sysroot: 'https://cdn.jsdelivr.net/gh/binji/wasm-clang@master/sysroot.tar',
  memfs: 'https://cdn.jsdelivr.net/gh/binji/wasm-clang@master/memfs',
};
const V = globalThis.__CODEBOX_V || '';   /* cache-bust, substituted by build.py */

const post = (m) => self.postMessage(m);
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const out = (id, chunk) => post({ id, type: 'out', chunk });
const status = (id, msg) => post({ id, type: 'status', msg });
const done = (id, ok, error, ms) => post({ id, type: 'done', ok, error, ms });

/* ---------------- JavaScript ---------------- */

/* rewrite bare imports to the esm.run CDN so `import _ from 'lodash'` works */
function rewriteImports(code) {
  return code
    .replace(/(\bfrom\s*)(['"])(?!\.|\/|https?:|data:|node:)([^'"]+)\2/g, (m, a, q, spec) => `${a}${q}https://esm.run/${spec}${q}`)
    .replace(/(\bimport\s*\(\s*)(['"])(?!\.|\/|https?:|data:|node:)([^'"]+)\2/g, (m, a, q, spec) => `${a}${q}https://esm.run/${spec}${q}`)
    .replace(/(\bimport\s+)(['"])(?!\.|\/|https?:|data:|node:)([^'"]+)\2/g, (m, a, q, spec) => `${a}${q}https://esm.run/${spec}${q}`);
}

let jsConsolePatched = false;
let jsId = null;   /* console output follows the live request, never the first one */
function patchConsole() {
  if (jsConsolePatched) return;
  jsConsolePatched = true;
  for (const lvl of ['log', 'info', 'warn', 'error']) {
    console[lvl] = (...args) => { out(jsId, args.map(String).join(' ') + '\n'); };
  }
}

async function runJS(id, code, input) {
  jsId = id;
  globalThis.input = input;
  patchConsole();
  const src = rewriteImports(code);
  const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src);
  await import(url);   /* module scope: static + dynamic imports both allowed */
}

/* ---------------- Python (Pyodide) ---------------- */

let pyodide = null;
let pyId = null;   /* the live request: output must follow it, not the first run */
async function py(id) {
  if (pyodide) return pyodide;
  status(id, 'pyodide');
  const mod = await import(/* @vite-ignore */ CDN.pyodide + 'pyodide.mjs');
  pyodide = await mod.loadPyodide({
    indexURL: CDN.pyodide,
    stdout: (s) => out(pyId, s + '\n'),
    stderr: (s) => out(pyId, s + '\n'),
  });
  return pyodide;
}

async function runPython(id, code, input) {
  pyId = id;
  const pyodide = await py(id);
  /* `input` is the wired text AND the builtin input(): a str subclass that
     keeps string behavior for existing flows (input.upper()) and, when
     called like normal Python code (name = input("Enter your name: ")),
     echoes the prompt and returns the next line of the wired text. Empty
     text is an empty stdin: input() raises EOFError, like the real thing. */
  pyodide.globals.set('_sing_stdin_text', String(input ?? ''));
  pyodide.runPython([
    'import sys as _sys',
    'class _SingStdin(str):',
    '    def __new__(cls, s):',
    '        self = super().__new__(cls, s)',
    '        self._lines = s.splitlines()',
    '        self._i = 0',
    '        return self',
    "    def __call__(self, prompt=''):",
    '        if prompt:',
    "            _sys.stdout.write(str(prompt) + '\\n')",
    '        if self._i < len(self._lines):',
    '            line = self._lines[self._i]',
    '            self._i += 1',
    '            return line',
    "        raise EOFError('EOF when reading a line')",
    'input = _SingStdin(_sing_stdin_text)',
    'del _sing_stdin_text',
  ].join('\n'));
  /* libraries: anything the code imports is installed automatically */
  status(id, 'imports');
  try { await pyodide.loadPackagesFromImports(code); } catch { /* best effort */ }
  status(id, 'run');
  await pyodide.runPythonAsync(code);
}

/* ---------------- C++ (wasm-clang) ---------------- */

let cppApi = null;
let cppId = null;   /* same: output follows the live request */
let cppInRun = false, cppFirst = false, cppBuf = '';
async function cpp(id) {
  if (cppApi) return cppApi;
  status(id, 'clang');
  cppApi = new API({
    readBuffer: async (u) => (await fetch(u + V)).arrayBuffer(),
    compileStreaming: async (u) => WebAssembly.compile(await (await fetch(u + V)).arrayBuffer()),
    /* toolchain chatter is status; only the program's own output is output */
    hostWrite: (s) => {
      const clean = stripAnsi(s);
      cppBuf += clean;
      if (cppInRun) {
        if (/^>\s*test\.wasm/.test(clean)) return; /* the run command line, not program output */
        out(cppId, clean);
      } else status(id, 'compile');
    },
    clang: CDN.clang, lld: CDN.lld, sysroot: CDN.sysroot, memfs: CDN.memfs,
  });
  await cppApi.ready;
  return cppApi;
}

async function runCpp(id, code, input) {
  const api = await cpp(id);
  cppId = id;
  cppBuf = ''; cppInRun = false; cppFirst = true;
  try {
    await api.compile({ input: 'test.cc', contents: code, obj: 'test.o' });
    await api.link('test.o', 'test.wasm');
    const buffer = api.memfs.getFileContents('test.wasm');
    const mod = await WebAssembly.compile(buffer);
    status(id, 'run');
    api.memfs.setStdinStr(input || '');
    cppInRun = true;
    await api.run(mod, 'test.wasm');
  } catch (e) {
    /* compile/link failures: show the compiler's own diagnostics */
    const diag = cppInRun ? '' : cppBuf.split('\n').filter((l) => l && !/^> /.test(l) && !/Fetching|Untarring|^done\.$/.test(l)).join('\n');
    throw new Error(diag || String((e && e.message) || e));
  }
}

/* ---------------- dispatch ---------------- */

self.onmessage = async (ev) => {
  const { id, lang, code, input } = ev.data;
  const t0 = Date.now();
  try {
    if (lang === 'js') await runJS(id, code, input);
    else if (lang === 'python') await runPython(id, code, input);
    else if (lang === 'cpp') await runCpp(id, code, input);
    else throw new Error('codebox: unknown language ' + lang);
    done(id, true, null, Date.now() - t0);
  } catch (e) {
    const msg = String((e && e.message) || e);
    done(id, false, msg, Date.now() - t0);
  }
};
