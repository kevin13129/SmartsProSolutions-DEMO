import { defaultIntakeService } from '../server/intake-service.mjs';
import { headers as securityHeaders } from '../scripts/build.mjs';

/**
 * Vercel Serverless Function: GET /api/calendar-availability
 * Returns anonymized upcoming cleaning bookings and available arrival windows.
 * Never returns any customer personal data.
 */
export default async function handler(req, res) {
  Object.entries(securityHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }));
    return;
  }

  const payload = defaultIntakeService.getCalendarAvailability();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
}
