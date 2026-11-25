import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { relay } from '../worker/handler.js';

const root = resolve(import.meta.dirname, '../dist');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.avif':'image/avif', '.jpeg':'image/jpeg' };
const server = http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://127.0.0.1:4173');
    if (url.pathname === '/api/ai') {
      const origin = incoming.headers.host === 'localhost:4173' ? 'http://localhost:4173' : 'http://127.0.0.1:4173';
      const controller = new AbortController();
      const cancel = () => controller.abort();
      incoming.once('aborted', cancel);
      outgoing.once('close', () => { if (!outgoing.writableFinished) cancel(); });
      const request = new Request(origin + incoming.url, { method: incoming.method, headers: incoming.headers,
        signal: controller.signal,
        ...(['GET','HEAD'].includes(incoming.method) ? {} : { body: incoming, duplex: 'half' }) });
      const response = await relay(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!['GET','HEAD'].includes(incoming.method)) { outgoing.writeHead(405); outgoing.end(); return; }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep) || path.includes('/server/') || path.includes('/.')) { outgoing.writeHead(404); outgoing.end(); return; }
    const content = await readFile(path);
    outgoing.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    outgoing.end(incoming.method === 'HEAD' ? undefined : content);
  } catch { outgoing.writeHead(404); outgoing.end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('人生 CFO preview: http://127.0.0.1:4173/ (same-origin AI relay enabled)'));
