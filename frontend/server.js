import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type':'application/json' }); res.end('{"status":"ok"}'); return; }
  if (url.pathname.startsWith('/api/')) {
    const target = new URL(`http://127.0.0.1:${process.env.API_PORT || 3000}${url.pathname}${url.search}`);
    const upstream = http.request(target, { method:req.method, headers:{ ...req.headers, host:target.host } }, response => {
      res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type':'application/json' }); res.end('{"code":"API_UNAVAILABLE","message":"The clinic API is unavailable. Start the backend and try again."}'); });
    req.pipe(upstream); return;
  }
  let file = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403); res.end('Forbidden'); return; }
  try { if (!(await stat(file)).isFile()) throw new Error('not file'); }
  catch { file = path.join(root, 'index.html'); }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type':mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' }); res.end(body); }
  catch { res.writeHead(404); res.end('Not found'); }
});
const port = Number(process.env.FRONTEND_PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`Clinic POS frontend: http://127.0.0.1:${port}`));
