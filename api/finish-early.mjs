import { defaultIntakeService, MAX_BODY_BYTES } from '../server/intake-service.mjs';
import { headers as securityHeaders } from '../scripts/build.mjs';

async function readBoundedBody(req) {
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString('utf8');
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES + 1024) {
      return 'X'.repeat(MAX_BODY_BYTES + 2);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Vercel Serverless Function: GET / POST /api/finish-early
 * Two-step HMAC-signed owner workflow to mark a cleaning job finished early
 * and re-open remaining weekday slots on Google Calendar and smartsprosolutions.com.
 */
export default async function handler(req, res) {
  Object.entries(securityHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' || req.method === 'HEAD') {
    const parsedUrl = new URL(req.url || '/api/finish-early', 'https://www.smartsprosolutions.com');
    const token = parsedUrl.searchParams.get('token') || '';
    const page = defaultIntakeService.renderFinishEarlyPage(token);
    res.statusCode = page.status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(req.method === 'HEAD' ? undefined : page.html);
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }));
    return;
  }

  const rawBody = await readBoundedBody(req);
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp =
    typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.socket?.remoteAddress || '127.0.0.1';

  const result = await defaultIntakeService.processFinishEarlyRequest({
    rawBody,
    headers: req.headers,
    clientIp
  });

  Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(result.body));
}
