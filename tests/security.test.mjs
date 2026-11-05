import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Script, createContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { build, root, output, publicFiles, deployment, headers } from '../scripts/build.mjs';
import { createPreviewServer } from '../scripts/preview.mjs';
import { createIntakeService } from '../server/intake-service.mjs';

const read = file => readFile(resolve(root, file), 'utf8');

test('the browser boundary cleans legacy storage, rejects unvalidated legacy submitBooking, and models no-online-payment email/calendar dispatch', async () => {
  const removed = [];
  const records = new Map([['smartspro_leads_v1', 'legacy personal data'], ['unrelated', 'keep']]);
  const context = createContext({
    window: {},
    localStorage: { removeItem(key) { removed.push(key); records.delete(key); } },
    console: new Proxy({}, { get() { throw new Error('Unexpected logging'); } }),
    fetch() { throw new Error('Unexpected transmission during init'); }
  });
  new Script(await read('assets/js/api.js')).runInContext(context);
  const api = context.window.SmartsProBackend;
  const hostileInput = new Proxy({}, { get() { throw new Error('Personal data must not be read by legacy submitBooking'); } });
  const result = await api.submitBooking(hostileInput, hostileInput);
  assert.equal(result.success, false);
  assert.equal(result.code, 'INTAKE_UNAVAILABLE');
  assert.equal(result.referenceCode, undefined);
  assert.equal(api.intakeAvailable, true);
  assert.equal(api.onlinePaymentsEnabled, false);
  assert.equal(api.getLeads, undefined);
  assert.equal(api.exportLeadsCSV, undefined);
  assert.equal(api.config, undefined);
  assert.ok(Object.isFrozen(api));
  const dispatch = context.window.SmartsProDispatchFramework;
  assert.ok(Object.isFrozen(dispatch));
  const envelope = dispatch.buildJobEnvelope({
    state: { serviceCategory: 'residential', frequency: 'weekly' },
    calculation: { grandTotal: 200, estimatedHours: 4 }
  });
  assert.equal(envelope.pricingModel, 'FLAT_RATE_NO_RECURRING_DISCOUNTS');
  assert.equal(envelope.paymentPolicy, 'NO_ONLINE_PAYMENT_REQUIRED');
  assert.equal(envelope.onlinePaymentEnabled, false);
  assert.equal(envelope.recurringDiscountRate, 0);
  assert.equal(envelope.estimatedTotal, 200);
  assert.equal(envelope.adapters.calendarAvailabilityFeed, '/api/calendar-availability');
  assert.equal(envelope.adapters.ownerEmailAndCalendarDispatch, '/api/estimate-request');
  assert.equal(envelope.adapters.onlinePaymentCollection, 'DISABLED_BY_OWNER_POLICY');
  assert.deepEqual(removed, ['smartspro_leads_v1']);
  assert.deepEqual([...records], [['unrelated', 'keep']]);
});

test('unavailable browser storage never breaks initialization or fabricates confirmation', async () => {
  const context = createContext({ window: {} });
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('Access denied'); } });
  new Script(await read('assets/js/api.js')).runInContext(context);
  assert.equal((await context.window.SmartsProBackend.submitBooking()).success, false);
  assert.equal((await context.window.SmartsProBackend.submitEstimateRequest(null)).success, false);
});

test('security policy denies injection, framing, third-party connections, and form posts while allowing same-origin API requests', async () => {
  const csp = headers['Content-Security-Policy'];
  for (const directive of ["default-src 'none'", "script-src 'self'", "script-src-attr 'none'", "style-src 'self'", "style-src-attr 'none'", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", 'upgrade-insecure-requests']) {
    assert.ok(csp.split('; ').includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-|https:|\*/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.match(headers['Strict-Transport-Security'], /^max-age=31536000$/);
  assert.match(headers['Permissions-Policy'], /camera=\(\).*geolocation=\(\).*microphone=\(\).*payment=\(\)/);
  const fallback = csp.replace("; frame-ancestors 'none'; upgrade-insecure-requests", '');
  for (const file of ['index.html', '404.html']) {
    const html = await read(file);
    assert.equal(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1], fallback);
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('</head>'));
  }
});

test('public HTML has no static personal-data forms when JS is off, no inline code, and no external executable resources', async () => {
  for (const file of ['index.html', '404.html']) {
    const html = await read(file);
    assert.doesNotMatch(html, /<form\b|<textarea\b|type="(?:text|email|tel|date|password|file)"/i);
    assert.doesNotMatch(html, /\s(?:on\w+|style)\s*=|javascript:|<base\b|<iframe\b/i);
    assert.doesNotMatch(html, /leads-modal|leads-table|link-open-leads|success-ref-code|book-name/);
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.equal(script[2].trim(), '');
      assert.match(script[1], /^ src="assets\/js\/[a-z-]+\.js"$/);
    }
    for (const asset of html.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g)) {
      assert.ok(publicFiles.includes(asset[1]), 'Unpublished asset: ' + asset[1]);
    }
    assert.doesNotMatch(html, /\bsrc="(?:https?:)?\/\//i);
    for (const extHref of html.matchAll(/\bhref="((?:https?:)?\/\/[^"]+)"/gi)) {
      assert.equal(extHref[1], 'https://builtforbusiness.net/');
    }
  }
});

test('browser scripts have no unsafe HTML sinks, credential signatures, or browser storage writes, and only api.js performs same-origin fetch calls', async () => {
  for (const file of publicFiles.filter(file => file.endsWith('.js'))) {
    const source = await read(file);
    new Script(source, { filename: file });
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/);
    assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon|WebSocket|\.setItem\s*\(|indexedDB|document\.cookie/);
    if (file !== 'assets/js/api.js') {
      assert.doesNotMatch(source, /\bfetch\s*\(/);
    }
    assert.doesNotMatch(source, /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{30,}/);
  }
  for (const file of publicFiles.filter(file => file.endsWith('.css'))) {
    assert.doesNotMatch(await read(file), /https?:|url\(\s*['"]?(?:\/\/|data:)/i);
  }
});

test('deployments publish only the explicit public manifest', async () => {
  assert.equal(deployment.outputDirectory, 'dist');
  assert.equal(deployment.buildCommand, 'npm run build');
  assert.match(deployment.installCommand, /--ignore-scripts/);
  assert.equal(new Set(publicFiles).size, publicFiles.length);
  await build();
  async function walk(directory, prefix = '') {
    const paths = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.equal(entry.isSymbolicLink(), false);
      const file = prefix + entry.name;
      if (entry.isDirectory()) paths.push(...await walk(resolve(directory, entry.name), file + '/'));
      else paths.push(file);
    }
    return paths;
  }
  assert.deepEqual((await walk(output)).sort(), [...publicFiles, '_headers'].sort());
  const hostHeaders = await readFile(resolve(output, '_headers'), 'utf8');
  for (const [key, value] of Object.entries(headers)) assert.ok(hostHeaders.includes(`${key}: ${value}`));
});

test('vendored fonts match recorded source hashes and include redistribution licenses', async () => {
  const sources = JSON.parse(await read('assets/fonts/provenance.json'));
  assert.equal(sources.length, 3);
  for (const source of sources) {
    const slug = source.family.toLowerCase().replaceAll(' ', '');
    const bytes = await readFile(resolve(root, `assets/fonts/${slug}-latin.woff2`));
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    assert.match(await read(`assets/fonts/${slug}-OFL.txt`), /SIL OPEN FONT LICENSE/);
  }
});

test('preview serves hardened assets, rejects writes to static routes, and does not expose repository files', async () => {
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/', '/index.html', '/assets/js/api.js', '/assets/css/fonts.css']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.ok(response.headers.get('content-security-policy').includes("connect-src 'self'"));
      await response.arrayBuffer();
    }
    for (const path of ['/.env', '/.env.example', '/.git/config', '/.vercel/project.json', '/package.json', '/README.md', '/security/public-files.json', '/scripts/build.mjs', '/server/intake-service.mjs', '/_headers', '/api/bookings', '/admin', '/assets/../.env', '/%2e%2e%2f.env']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      await response.arrayBuffer();
    }
    const rejected = await fetch(base + '/', { method: 'POST', body: 'test' });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get('allow'), 'GET, HEAD');
    await rejected.arrayBuffer();
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('server intake API enforces SECURITY-ROADMAP Section 1 validation, price recalculation, calendar slot locking, idempotency, rate limits, and email+.ics generation', async () => {
  const sentEmails = [];
  const fixedNow = new Date('2026-11-04T15:00:00Z'); // Wednesday
  const intakeService = createIntakeService({
    nowFn: () => fixedNow,
    includeBaselineSchedule: false,
    rateLimitMax: 5,
    mailTransport: async (emailPackage, record, referenceCode) => {
      sentEmails.push({ emailPackage, record, referenceCode });
      return { delivered: true, provider: 'test-double' };
    }
  });

  const server = createPreviewServer({ intakeService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const validPayload = {
    customer: {
      firstName: 'José',
      lastName: 'García-López',
      phone: '(318) 555-0142',
      email: 'jose.garcia@example.com',
      notes: 'Please focus on kitchen counters and master bath. Friendly golden retriever in backyard.'
    },
    appointment: {
      preferredDate: '2026-11-06', // Friday
      preferredWindow: '08:00-11:00'
    },
    quote: {
      serviceCategory: 'residential',
      serviceType: 'standard',
      propertyType: '',
      scopeMode: 'full',
      specificAreasText: '',
      specificHours: 2,
      bedrooms: 4,
      fullBaths: 2,
      halfBaths: 1,
      sqft: 1800,
      additionalInfo: {
        hasPets: 'yes',
        lastCleaned: '1-3 Months ago',
        occupancy: 'Occupied, we live there',
        condition: 'Average, normal use'
      },
      frequency: 'weekly',
      addons: {
        fridge: 1,
        fridgeDouble: 0,
        oven: 0,
        pets: 1
      }
    },
    companyWebsite: ''
  };

  try {
    // 1. Check GET /api/calendar-availability returns no-store, Mon-Fri 8:00 AM - 5:30 PM, and all of Nov 2026 + all of Dec 2026
    const availRes = await fetch(`${base}/api/calendar-availability`);
    assert.equal(availRes.status, 200);
    assert.equal(availRes.headers.get('cache-control'), 'no-store');
    const availData = await availRes.json();
    assert.equal(availData.businessHours, 'Mon – Fri · 8:00 AM – 5:30 PM');
    assert.equal(availData.maxAdvanceDate, '2026-12-31');
    assert.equal(availData.paymentPolicy, 'No Online Payment Required • Flat-Rate Estimate Sent to Owner Email');
    assert.ok(Array.isArray(availData.availableDates));
    assert.ok(availData.availableDates.some(d => d.date === '2026-11-30'));
    assert.ok(availData.availableDates.some(d => d.date === '2026-12-31'));
    assert.ok(Array.isArray(availData.calendarMonths));
    assert.equal(availData.calendarMonths.length, 2);
    assert.equal(availData.calendarMonths[0].monthKey, '2026-11');
    assert.equal(availData.calendarMonths[1].monthKey, '2026-12');
    // Verify Thanksgiving (2026-11-26) and Day After Thanksgiving (2026-11-27) are automatically excluded from availableDates
    assert.equal(availData.availableDates.some(d => d.date === '2026-11-26' || d.date === '2026-11-27'), false);

    // 2. Reject unsupported HTTP methods and Content-Types
    const getOnPostRoute = await fetch(`${base}/api/estimate-request`);
    assert.equal(getOnPostRoute.status, 405);

    const wrongTypeRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validPayload)
    });
    assert.equal(wrongTypeRes.status, 415);

    // 3. Reject cross-site Sec-Fetch-Site and foreign Origin headers
    const crossSiteRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site'
      },
      body: JSON.stringify(validPayload)
    });
    assert.equal(crossSiteRes.status, 403);

    // 4. Reject oversized payloads (> 16 KiB)
    const oversizedRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, padding: 'A'.repeat(17000) })
    });
    assert.equal(oversizedRes.status, 413);

    // 5. Reject client-supplied price or privilege fields (tampering test)
    const tamperedPrice = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({ ...validPayload, grandTotal: 1 }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.10'
    });
    assert.equal(tamperedPrice.status, 400);
    assert.equal(tamperedPrice.body.code, 'CLIENT_PRICE_REJECTED');

    // 6. Reject credit-card numbers in notes and HTML/control-char injection without echoing input
    const cardInNotes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        customer: { ...validPayload.customer, notes: 'Charge my card 4532 0151 1283 0366 please' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.11'
    });
    assert.equal(cardInNotes.status, 400);
    assert.equal(cardInNotes.body.code, 'SENSITIVE_DATA_REJECTED');
    assert.doesNotMatch(JSON.stringify(cardInNotes.body), /4532/);

    const xssName = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        customer: { ...validPayload.customer, firstName: '<script>alert(1)</script>' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.12'
    });
    assert.equal(xssName.status, 400);
    assert.doesNotMatch(JSON.stringify(xssName.body), /<script>/);

    // 7. Reject past dates, dates beyond the next calendar month (e.g. Jan 2027 while in Nov 2026), weekends, holidays, and non-leap-year Feb 29
    const pastDateRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2026-11-01', preferredWindow: '08:00-11:00' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.13'
    });
    assert.equal(pastDateRes.status, 400);
    assert.equal(pastDateRes.body.code, 'DATE_OUT_OF_RANGE');

    const overNextMonthRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2027-01-04', preferredWindow: '08:00-11:00' } // Beyond Dec 2026 while in Nov 2026
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.13'
    });
    assert.equal(overNextMonthRes.status, 400);
    assert.equal(overNextMonthRes.body.code, 'DATE_OUT_OF_RANGE');

    // Verify that when it turns Dec 1, 2026, the customer can select any open date in all of December 2026 and January 2027
    const decFirstService = createIntakeService({
      nowFn: () => new Date('2026-12-01T15:00:00Z'),
      includeBaselineSchedule: false,
      mailTransport: async () => ({ delivered: true, provider: 'test-double' })
    });
    const decFirstAvail = decFirstService.getCalendarAvailability();
    assert.equal(decFirstAvail.maxAdvanceDate, '2027-01-31');
    assert.equal(decFirstAvail.calendarMonths[0].monthKey, '2026-12');
    assert.equal(decFirstAvail.calendarMonths[1].monthKey, '2027-01');
    assert.ok(decFirstAvail.availableDates.some(d => d.date === '2027-01-29'));

    const saturdayRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2026-11-07', preferredWindow: '08:00-11:00' } // Saturday
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.13'
    });
    assert.equal(saturdayRes.status, 400);
    assert.equal(saturdayRes.body.code, 'WEEKEND_CLOSED');

    const sundayRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2026-11-08', preferredWindow: '08:00-11:00' } // Sunday
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.13'
    });
    assert.equal(sundayRes.status, 400);
    assert.equal(sundayRes.body.code, 'WEEKEND_CLOSED');

    const holidayRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2026-11-26', preferredWindow: '08:00-11:00' } // Thanksgiving Day
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.14'
    });
    assert.equal(holidayRes.status, 400);
    assert.equal(holidayRes.body.code, 'HOLIDAY_CLOSED');

    const nonLeapFeb29 = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2027-02-29', preferredWindow: '08:00-11:00' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.14'
    });
    assert.equal(nonLeapFeb29.status, 400);
    assert.equal(nonLeapFeb29.body.code, 'INVALID_CALENDAR_DATE');

    // Verify leap-year Feb 29 (Tuesday 2028-02-29) is accepted when clock is in Feb 2028
    const leapYearService = createIntakeService({
      nowFn: () => new Date('2028-02-20T15:00:00Z'),
      includeBaselineSchedule: false,
      mailTransport: async () => ({ delivered: true, provider: 'test-double' })
    });
    const leapYearRes = await leapYearService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2028-02-29', preferredWindow: '14:30-17:30' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.15'
    });
    assert.equal(leapYearRes.status, 200);
    assert.equal(leapYearRes.body.appointment.preferredDate, '2028-02-29');

    // 8. Valid request recalculates authoritative flat-rate total ($220 base + $65 fridge + $35 pets = $320),
    // sends automated email + .ics invite to smartsprosolutions@gmail.com, and locks the calendar slot!
    const idemKey = 'sps-test-idempotency-key-0001';
    const validRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey
      },
      body: JSON.stringify(validPayload)
    });
    assert.equal(validRes.status, 200);
    assert.equal(validRes.headers.get('cache-control'), 'no-store');
    const validData = await validRes.json();
    assert.equal(validData.success, true);
    assert.match(validData.referenceCode, /^SPS-[0-9A-F]{10}$/);
    assert.equal(validData.verifiedEstimate.grandTotal, 320);
    assert.equal(validData.verifiedEstimate.basePrice, 220);
    assert.equal(validData.verifiedEstimate.addonsTotal, 100);
    assert.equal(validData.verifiedEstimate.pricingModel, 'FLAT_RATE_NO_ONLINE_PAYMENT');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].emailPackage.to, 'smartsprosolutions@gmail.com');
    assert.equal(sentEmails[0].emailPackage.replyTo, 'jose.garcia@example.com');
    assert.match(sentEmails[0].emailPackage.textBody, /José García-López/);
    assert.match(sentEmails[0].emailPackage.textBody, /\(318\) 555-0142/);
    assert.match(sentEmails[0].emailPackage.textBody, /Friendly golden retriever in backyard/);
    assert.match(sentEmails[0].emailPackage.icsContent, /BEGIN:VCALENDAR/);
    assert.match(sentEmails[0].emailPackage.icsContent, /DTSTART;TZID=America\/Chicago:20261106T080000/);

    // 9. Idempotent retry with same key and payload returns cached 200 without sending duplicate email
    const replayRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey
      },
      body: JSON.stringify(validPayload)
    });
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.headers.get('x-idempotent-replay'), 'true');
    const replayData = await replayRes.json();
    assert.equal(replayData.referenceCode, validData.referenceCode);
    assert.equal(sentEmails.length, 1);

    // 10. Reusing same Idempotency-Key with a different payload returns 409 Conflict
    const conflictIdemRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey
      },
      body: JSON.stringify({
        ...validPayload,
        appointment: { preferredDate: '2026-11-06', preferredWindow: '11:30-14:30' }
      })
    });
    assert.equal(conflictIdemRes.status, 409);

    // 11. Second booking for the same date+window from another customer is rejected (409 SLOT_ALREADY_BOOKED)
    const doubleBookRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        customer: {
          firstName: 'Marie',
          lastName: 'Curie',
          phone: '(318) 555-0199',
          email: 'marie@example.com',
          notes: ''
        }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.50'
    });
    assert.equal(doubleBookRes.status, 409);
    assert.equal(doubleBookRes.body.code, 'SLOT_ALREADY_BOOKED');

    // 12. Verify GET /api/calendar-availability now shows the slot as BOOKED with zero customer PII
    const availAfter = await (await fetch(`${base}/api/calendar-availability`)).json();
    const bookedEntry = availAfter.upcomingBookings.find(
      b => b.date === '2026-11-06' && b.slotId === '08:00-11:00'
    );
    assert.ok(bookedEntry);
    assert.equal(bookedEntry.status, 'BOOKED');
    assert.doesNotMatch(JSON.stringify(availAfter), /José|García|jose\.garcia|555-0142/);

    // 13. Rate limit check: exceeding 5 requests per window from same IP returns 429 + Retry-After
    for (let i = 0; i < 5; i++) {
      await intakeService.processEstimateRequest({
        rawBody: 'malformed',
        headers: { 'content-type': 'application/json' },
        clientIp: '10.0.0.99'
      });
    }
    const rateLimited = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.99'
    });
    assert.equal(rateLimited.status, 429);
    assert.ok(Number(rateLimited.headers['Retry-After']) > 0);

    // 14. Fail-closed check when no mail provider is configured
    const unconfiguredService = createIntakeService({
      nowFn: () => fixedNow,
      includeBaselineSchedule: false
    });
    const unconfRes = await unconfiguredService.processEstimateRequest({
      rawBody: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.77'
    });
    assert.equal(unconfRes.status, 503);
    assert.equal(unconfRes.body.success, false);
    assert.equal(unconfRes.body.code, 'EMAIL_PROVIDER_UNCONFIGURED');
    assert.match(unconfRes.body.fallbackMailtoUrl, /^mailto:smartsprosolutions%40gmail\.com/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
