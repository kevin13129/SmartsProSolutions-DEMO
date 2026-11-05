import { defaultIntakeService, MAX_BODY_BYTES } from '../server/intake-service.mjs';
import { headers as securityHeaders } from '../scripts/build.mjs';

/**
 * Reads the raw request body up to MAX_BODY_BYTES + 1 bytes so oversized payloads
 * are rejected at the transport boundary with HTTP 413.
 */
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
 * Vercel Serverless Function: POST /api/estimate-request
 * Validates customer contact details, recalculates authoritative flat-rate estimate,
 * verifies calendar slot availability, and dispatches automated email + .ics calendar invite.
 */
export default async function handler(req, res) {
  Object.entries(securityHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }));
    return;
  }

  const rawBody = await readBoundedBody(req);
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0].trim()
    : req.socket?.remoteAddress || '127.0.0.1';

  const result = await defaultIntakeService.processEstimateRequest({
    rawBody,
    headers: req.headers,
    clientIp
  });

  Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(result.body));
}
