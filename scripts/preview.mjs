import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headers, output, publicFiles } from './build.mjs';
import { defaultIntakeService, MAX_BODY_BYTES } from '../server/intake-service.mjs';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

async function readBoundedRequest(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buf.length;
    if (total > MAX_BODY_BYTES + 1024) {
      return 'X'.repeat(MAX_BODY_BYTES + 2);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Local preview only: binds to loopback and serves the public manifest, never
// the repository root. Production TLS/edge protections belong to the host.
export function createPreviewServer({ allowFraming = false, intakeService = defaultIntakeService } = {}) {
  return http.createServer(async (req, res) => {
    const localHeaders = { ...headers };
    delete localHeaders['Strict-Transport-Security'];
    localHeaders['Content-Security-Policy'] = localHeaders['Content-Security-Policy'].replace('; upgrade-insecure-requests', '');
    if (allowFraming) {
      delete localHeaders['X-Frame-Options'];
      delete localHeaders['Cross-Origin-Opener-Policy'];
      delete localHeaders['Cross-Origin-Resource-Policy'];
      localHeaders['Content-Security-Policy'] = localHeaders['Content-Security-Policy'].replace("; frame-ancestors 'none'", '');
    }
    // Headers are set on every response, including errors.
    Object.entries(localHeaders).forEach(([key, value]) => res.setHeader(key, value));

    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'Bad request');
      return;
    }

    if (pathname === '/api/calendar-availability') {
      res.setHeader('Cache-Control', 'no-store');
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }));
        return;
      }
      const data = JSON.stringify(intakeService.getCalendarAvailability());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : data);
      return;
    }

    if (pathname === '/api/estimate-request') {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }));
        return;
      }
      const rawBody = await readBoundedRequest(req);
      const clientIp = req.socket?.remoteAddress || '127.0.0.1';
      const result = await intakeService.processEstimateRequest({
        rawBody,
        headers: req.headers,
        clientIp
      });
      Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }
    try {
      const file = pathname === '/' ? 'index.html' : pathname.slice(1);
      const approved = publicFiles.includes(file);
      const data = await readFile(resolve(output, approved ? file : '404.html'));
      res.writeHead(approved ? 200 : 404, { 'Content-Type': mime[extname(approved ? file : '404.html')] });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'Bad request');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const server = createPreviewServer({ allowFraming: true });
  server.listen(port, host, () => console.log(`Security preview: http://${host}:${port}`));
}
