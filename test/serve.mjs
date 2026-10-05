#!/usr/bin/node
/* Static file server for the test suite, port 4173.
   Run:  HERMETIC=1 node test/serve.mjs     (battery/sync — refuses the AI model)
         node test/serve.mjs                (probes that need the real model)

   The AI engine is same-origin now: its 137MB model lives in this repo, and
   a plain static server would happily stream it to every test context. With
   HERMETIC=1 the model directory is refused (503) so no test context ever
   downloads a model — the suite's hermetic rule. */
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join, normalize } from 'path';

const ROOT = join(import.meta.dirname, '..');
const HERMETIC = !!process.env.HERMETIC;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (HERMETIC && /^\/models\/smol135-q8\//.test(url.pathname)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('hermetic: model files refused');
  }
  let st;
  try { st = statSync(file); } catch { res.writeHead(404); return res.end('not found'); }
  if (!st.isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, {
    'content-type': MIME[extname(file)] || 'application/octet-stream',
    'content-length': st.size,
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(4173, '0.0.0.0', () => console.log(`serve.mjs up on 4173 (${HERMETIC ? 'HERMETIC — model refused' : 'model served'})`));
