import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headers, output, publicFiles } from './build.mjs';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// Local preview only: binds to loopback and serves the public manifest, never
// the repository root. Production TLS/edge protections belong to the host.
export function createPreviewServer() {
  return http.createServer(async (req, res) => {
    const localHeaders = { ...headers };
    delete localHeaders['Strict-Transport-Security'];
    localHeaders['Content-Security-Policy'] = localHeaders['Content-Security-Policy'].replace('; upgrade-insecure-requests', '');
    // Headers are set on every response, including errors.
    Object.entries(localHeaders).forEach(([key, value]) => res.setHeader(key, value));
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
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
  const server = createPreviewServer();
  server.listen(port, '127.0.0.1', () => console.log(`Security preview: http://127.0.0.1:${port}`));
}
