/* Tiny in-memory Firestore stand-in for the sync e2e test (CORS-open). */
import http from 'node:http';

const docs = new Map();

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const m = req.url.match(/^\/doc\/(.+)$/);
  if (!m) { res.statusCode = 404; res.end(); return; }
  const id = decodeURIComponent(m[1]);
  if (req.method === 'GET') {
    const d = docs.get(id);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(d ? { exists: true, data: d } : { exists: false, data: null }));
    return;
  }
  if (req.method === 'PUT') {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const j = JSON.parse(b || '{}');
      const prev = docs.get(id) || {};
      docs.set(id, j.merge ? Object.assign(prev, j.data) : j.data);
      res.setHeader('content-type', 'application/json');
      res.end('{}');
    });
    return;
  }
  res.statusCode = 405;
  res.end();
}).listen(4199, '0.0.0.0', () => console.log('fbstore up on 4199'));
