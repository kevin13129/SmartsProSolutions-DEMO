import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Script, createContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { build, root, output, publicFiles, deployment, headers } from '../scripts/build.mjs';
import { createPreviewServer } from '../scripts/preview.mjs';
import {
  calculateAuthoritativeQuote,
  createIntakeService,
  isSafeWebhookUrl,
  validateUsPhoneNanp,
  verifyEmailDomainHasMx
} from '../server/intake-service.mjs';

// Keep build-time unit tests hermetic even when EMAIL_WEBHOOK_URL or RESEND_API_KEY is set in Vercel build environment
delete process.env.EMAIL_WEBHOOK_URL;
delete process.env.RESEND_API_KEY;

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
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
  assert.match(headers['Strict-Transport-Security'], /^max-age=31536000$/);
  assert.match(headers['Permissions-Policy'], /camera=\(\).*geolocation=\(\).*microphone=\(\).*payment=\(\)/);
  const fallback = csp.replace("; frame-ancestors 'none'; upgrade-insecure-requests", '');
  for (const file of ['index.html', '404.html']) {
    const html = await read(file);
    assert.equal(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1], fallback);
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('</head>'));
  }
});

test('public HTML has no static personal-data forms when JS is off, no inline code, no external executable resources, valid alt text on all images, and complete legal/privacy disclosures', async () => {
  for (const file of ['index.html', '404.html']) {
    const html = await read(file);
    assert.doesNotMatch(html, /<form\b|<textarea\b|type="(?:text|email|tel|date|password|file)"/i);
    assert.doesNotMatch(html, /\s(?:on\w+|style)\s*=|javascript:|<base\b|<iframe\b/i);
    assert.doesNotMatch(html, /leads-modal|leads-table|link-open-leads|success-ref-code|book-name/);
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.equal(script[2].trim(), '');
      assert.match(script[1], /^ src="assets\/js\/[a-z-]+\.js"$/);
    }
    for (const img of html.matchAll(/<img\b([^>]*)>/gi)) {
      const altMatch = img[1].match(/\balt="([^"]*)"/i);
      assert.ok(altMatch && altMatch[1].trim().length > 0, `Image missing descriptive alt text in ${file}: <img${img[1]}>`);
    }
    for (const asset of html.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g)) {
      assert.ok(publicFiles.includes(asset[1]), 'Unpublished asset: ' + asset[1]);
    }
    assert.doesNotMatch(html, /\bsrc="(?:https?:)?\/\//i);
    for (const extHref of html.matchAll(/\bhref="((?:https?:)?\/\/[^"]+)"/gi)) {
      assert.equal(extHref[1], 'https://builtforbusiness.net/');
    }
  }
  const indexHtml = await read('index.html');
  assert.match(indexHtml, /Privacy Policy/i);
  assert.match(indexHtml, /Terms of Service/i);
  assert.match(indexHtml, /Refund Policy/i);
  assert.match(indexHtml, /10% fee/i);
  assert.match(indexHtml, /Cookie Policy/i);
  assert.match(indexHtml, /18 years of age or older/i);
  assert.match(indexHtml, /Data Deletion/i);
  assert.match(indexHtml, /smartsprosolutions@gmail\.com/);
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

test('deployments publish only the explicit public manifest and never expose source maps', async () => {
  assert.equal(deployment.outputDirectory, 'dist');
  assert.equal(deployment.buildCommand, 'npm run build');
  assert.match(deployment.installCommand, /--ignore-scripts/);
  assert.equal(new Set(publicFiles).size, publicFiles.length);
  assert.equal(publicFiles.some(f => f.endsWith('.map')), false);
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
  const builtFiles = (await walk(output)).sort();
  assert.deepEqual(builtFiles, [...publicFiles, '_headers'].sort());
  assert.equal(builtFiles.some(f => f.endsWith('.map')), false);
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
    // 1. Check GET /api/calendar-availability returns no-store, Mon-Fri 8:00 AM - 4:30 PM, and all of Nov 2026 + all of Dec 2026
    const availRes = await fetch(`${base}/api/calendar-availability`);
    assert.equal(availRes.status, 200);
    assert.equal(availRes.headers.get('cache-control'), 'no-store');
    const availData = await availRes.json();
    assert.equal(availData.businessHours, 'Mon – Fri · 8:00 AM – 4:30 PM');
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

    // 6b. Reject phishing links in notes, disposable/typo email domains, and fake US phone numbers
    const phishingInNotes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        customer: { ...validPayload.customer, notes: 'Click here https://evil-phishing-site.com/login to claim' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.12'
    });
    assert.equal(phishingInNotes.status, 400);
    assert.equal(phishingInNotes.body.code, 'PHISHING_LINK_REJECTED');

    const burnerEmail = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        customer: { ...validPayload.customer, email: 'spammer@mailinator.com' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.12'
    });
    assert.equal(burnerEmail.status, 400);
    assert.equal(burnerEmail.body.code, 'UNVERIFIED_EMAIL_DOMAIN');

    assert.equal(validateUsPhoneNanp('3185644360').valid, true);
    assert.equal(validateUsPhoneNanp('3185644360').formatted, '(318) 564-4360');
    assert.equal(validateUsPhoneNanp('5555555555').valid, false);
    assert.equal(validateUsPhoneNanp('3181111111').valid, false);
    assert.equal(validateUsPhoneNanp('1234567890').valid, false);
    assert.equal(
      await verifyEmailDomainHasMx('user@realdomain.org', async () => [{ exchange: 'mx1.realdomain.org', priority: 10 }]),
      true
    );
    assert.equal(
      await verifyEmailDomainHasMx('user@nullmx.org', async () => [{ exchange: '.', priority: 0 }]),
      false
    );
    assert.equal(
      await verifyEmailDomainHasMx('user@nonexistent.invalid', async () => {
        throw new Error('ENOTFOUND');
      }),
      false
    );

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
        appointment: { preferredDate: '2028-02-29', preferredWindow: '08:00-11:00' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.15'
    });
    assert.equal(leapYearRes.status, 200);
    assert.equal(leapYearRes.body.appointment.preferredDate, '2028-02-29');

    // 7b. Verify updated pricing rules: $50 min (no 2-hr/$120 min) & higher 2000 sqft Standard ($250) and Deep ($330) quotes
    const oneHrSpecificQuote = calculateAuthoritativeQuote({
      serviceCategory: 'residential',
      serviceType: 'standard',
      propertyType: '',
      scopeMode: 'specific',
      specificAreasText: 'Kitchen counters and sink',
      specificHours: 1,
      bedrooms: 3,
      fullBaths: 2,
      halfBaths: 0,
      sqft: 2000,
      additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
      frequency: 'onetime',
      addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
    });
    assert.equal(oneHrSpecificQuote.grandTotal, 50);

    const standard2000Quote = calculateAuthoritativeQuote({
      serviceCategory: 'residential',
      serviceType: 'standard',
      propertyType: '',
      scopeMode: 'full',
      specificAreasText: '',
      specificHours: 1,
      bedrooms: 3,
      fullBaths: 2,
      halfBaths: 0,
      sqft: 2000,
      additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
      frequency: 'onetime',
      addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
    });
    assert.equal(standard2000Quote.basePrice, 250);
    assert.equal(standard2000Quote.totalEstimatedHours, 5);
    assert.ok(standard2000Quote.grandTotal > 200);

    const deep2000Quote = calculateAuthoritativeQuote({
      serviceCategory: 'residential',
      serviceType: 'deep',
      propertyType: '',
      scopeMode: 'full',
      specificAreasText: '',
      specificHours: 1,
      bedrooms: 3,
      fullBaths: 2,
      halfBaths: 0,
      sqft: 2000,
      additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
      frequency: 'onetime',
      addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
    });
    assert.equal(deep2000Quote.basePrice, 330);
    assert.equal(deep2000Quote.totalEstimatedHours, 5.5);
    assert.ok(deep2000Quote.grandTotal > 275);

    // 8. Valid request recalculates authoritative flat-rate total ($275 base + $65 fridge + $35 pets = $375),
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
    assert.equal(validRes.headers.get('access-control-allow-origin'), null);
    const validData = await validRes.json();
    assert.equal(validData.success, true);
    assert.match(validData.referenceCode, /^SPS-[0-9A-F]{10}$/);
    assert.equal(validData.verifiedEstimate.grandTotal, 375);
    assert.equal(validData.verifiedEstimate.basePrice, 275);
    assert.equal(validData.verifiedEstimate.addonsTotal, 100);
    assert.equal(validData.verifiedEstimate.pricingModel, 'FLAT_RATE_NO_ONLINE_PAYMENT');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].emailPackage.to, 'smartsprosolutions@gmail.com');
    assert.equal(sentEmails[0].emailPackage.replyTo, 'jose.garcia@example.com');
    assert.match(sentEmails[0].emailPackage.textBody, /José García-López/);
    assert.match(sentEmails[0].emailPackage.textBody, /\(318\) 555-0142/);
    assert.match(sentEmails[0].emailPackage.textBody, /Friendly golden retriever in backyard/);
    assert.match(sentEmails[0].emailPackage.textBody, /Privacy, Opt-Out & Data Deletion/i);
    assert.match(sentEmails[0].emailPackage.htmlBody, /Privacy, Opt-Out &amp; Data Deletion/i);
    assert.match(sentEmails[0].emailPackage.icsContent, /BEGIN:VCALENDAR/);
    assert.match(sentEmails[0].emailPackage.icsContent, /DTSTART;TZID=America\/Chicago:20261106T080000/);
    assert.match(sentEmails[0].emailPackage.icsContent, /DTEND;TZID=America\/Chicago:20261106T110000/);
    assert.match(sentEmails[0].emailPackage.icsContent, /RRULE:FREQ=WEEKLY/);
    assert.match(sentEmails[0].emailPackage.finishEarlyUrl, /\/api\/finish-early\?token=/);
    assert.match(sentEmails[0].emailPackage.textBody, /Est\. Cleaning Time:/);
    assert.match(sentEmails[0].emailPackage.htmlBody, /Finish Early/);
    assert.ok(sentEmails[0].emailPackage.customerConfirmation);
    assert.equal(sentEmails[0].emailPackage.customerConfirmation.to, 'jose.garcia@example.com');
    assert.match(sentEmails[0].emailPackage.customerConfirmation.htmlBody, /\$375\.00/);
    assert.doesNotMatch(sentEmails[0].emailPackage.customerConfirmation.textBody, /finish-early/i);
    assert.doesNotMatch(sentEmails[0].emailPackage.customerConfirmation.htmlBody, /Finish Early/i);

    // 8b. SSRF webhook URL guard blocks non-HTTPS, localhost, cloud metadata (169.254.169.254), and private IP literals
    assert.equal(isSafeWebhookUrl('https://script.google.com/macros/s/example/exec'), true);
    assert.equal(isSafeWebhookUrl('http://script.google.com/macros/s/example/exec'), false);
    assert.equal(isSafeWebhookUrl('https://localhost/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://127.0.0.1/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://169.254.169.254/latest/meta-data/'), false);
    assert.equal(isSafeWebhookUrl('https://10.0.0.1/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://192.168.1.1/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://[::1]/webhook'), false);

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
        appointment: { preferredDate: '2026-11-06', preferredWindow: '11:00-14:00' }
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

    // 11b. Same customer (matching email) can edit their confirmed request (e.g., longer hours or additional info/add-ons) and receive auto-adjusted server total
    const editedSameCustomerRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        quote: {
          ...validPayload.quote,
          scopeMode: 'specific',
          specificHours: 4, // 4 hrs * $50 = $200 base + $65 fridge + $35 pets = $300
          specificAreasText: 'Kitchen, living room, and master bath'
        }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.51'
    });
    assert.equal(editedSameCustomerRes.status, 200);
    assert.equal(editedSameCustomerRes.body.success, true);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.basePrice, 200);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.addonsTotal, 100);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.grandTotal, 300);

    // 12. Verify GET /api/calendar-availability now shows the initial date AND recurring weekly dates as BOOKED with zero customer PII
    const availAfter = await (await fetch(`${base}/api/calendar-availability`)).json();
    const bookedEntry = availAfter.upcomingBookings.find(
      b => b.date === '2026-11-06' && b.slotId === '08:00-11:00'
    );
    assert.ok(bookedEntry);
    assert.equal(bookedEntry.status, 'BOOKED');
    const nextWeekRecurring = availAfter.availableDates.find(d => d.date === '2026-11-13');
    assert.ok(nextWeekRecurring);
    assert.equal(nextWeekRecurring.slots.find(s => s.slotId === '08:00-11:00').status, 'BOOKED');
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

test('fixed calendar time blocks, recurring monthly/weekly blocking, updateToken [UPDATED] replacement, and /api/finish-early work end-to-end', async () => {
  let activeNow = new Date('2026-11-09T14:00:00Z'); // Monday 8:00 AM CST (Nov 9, 2026)
  const sentEmails = [];
  const calendarActions = [];

  const service = createIntakeService({
    nowFn: () => activeNow,
    includeBaselineSchedule: false,
    rateLimitMax: 20,
    finishEarlySecret: 'test-finish-early-secret-32-chars-minimum',
    mailTransport: async (emailPackage, record, referenceCode) => {
      sentEmails.push({
        emailPackage,
        record,
        referenceCode,
        previousReferenceCode: record.previousReferenceCode || ''
      });
      return { delivered: true, provider: 'test-double' };
    },
    calendarActionTransport: async (payload) => {
      calendarActions.push(payload);
      return { delivered: true, provider: 'test-double' };
    }
  });

  const server = createPreviewServer({ intakeService: service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const makePayload = (overrides = {}) => ({
    customer: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '(318) 555-0188',
      email: 'ada@example.com',
      notes: '',
      ...(overrides.customer || {})
    },
    appointment: {
      preferredDate: '2026-11-10', // Tuesday
      preferredWindow: '08:00-11:00',
      ...(overrides.appointment || {})
    },
    quote: {
      serviceCategory: 'residential',
      serviceType: 'deep',
      propertyType: '',
      scopeMode: 'full',
      specificAreasText: '',
      specificHours: 2,
      bedrooms: 3,
      fullBaths: 2,
      halfBaths: 0,
      sqft: 2000,
      additionalInfo: {
        hasPets: 'no',
        lastCleaned: '1-3 Months ago',
        occupancy: 'Occupied, we live there',
        condition: 'Average, normal use'
      },
      frequency: 'onetime',
      addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 },
      ...(overrides.quote || {})
    },
    companyWebsite: ''
  });

  try {
    // 1. All arrival windows remain selectable regardless of estimated hours (unless already booked)
    const lateAfternoonDeepRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        makePayload({
          customer: { email: 'latewin@example.com', firstName: 'Late', lastName: 'Window', phone: '(318) 555-0166' },
          appointment: { preferredDate: '2026-11-11', preferredWindow: '14:00-16:30' }
        })
      )
    });
    assert.equal(lateAfternoonDeepRes.status, 200);
    const lateAfternoonData = await lateAfternoonDeepRes.json();
    assert.equal(lateAfternoonData.appointment.preferredWindow, '14:00-16:30');
    assert.ok(lateAfternoonData.updateToken);

    const middayDeepFridgeRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        makePayload({
          customer: { email: 'middaywin@example.com', firstName: 'Mid', lastName: 'Window', phone: '(318) 555-0167' },
          appointment: { preferredDate: '2026-11-13', preferredWindow: '11:00-14:00' },
          quote: { addons: { fridge: 1, fridgeDouble: 0, oven: 0, pets: 0 } }
        })
      )
    });
    assert.equal(middayDeepFridgeRes.status, 200);

    // 2. Book 5.5-hour Deep Clean at 08:00-11:00 (fixed time block stays 8:00 AM - 11:00 AM)
    const emailIdxBeforeMorning = sentEmails.length;
    const morningDeepRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makePayload())
    });
    assert.equal(morningDeepRes.status, 200);
    const morningDeepData = await morningDeepRes.json();
    assert.equal(morningDeepData.verifiedEstimate.totalEstimatedHours, 5.5);
    assert.equal(morningDeepData.appointment.scheduledEndLabel, '11:00 AM');
    assert.match(sentEmails[emailIdxBeforeMorning].emailPackage.icsContent, /DTEND;TZID=America\/Chicago:20261110T110000/);

    // 2b. Edit that booking using updateToken to add a fridge (+0.5h -> 6.0 hrs, $395) keeping SAME Reference ID
    const morningEditRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload({ quote: { addons: { fridge: 1, fridgeDouble: 0, oven: 0, pets: 0 } } }),
        updateToken: morningDeepData.updateToken
      })
    });
    assert.equal(morningEditRes.status, 200);
    const morningEditData = await morningEditRes.json();
    assert.equal(morningEditData.isUpdated, true);
    assert.equal(morningEditData.updateCount, 1);
    assert.equal(morningEditData.referenceCode, morningDeepData.referenceCode);
    assert.equal(morningEditData.verifiedEstimate.grandTotal, 395);
    assert.equal(morningEditData.verifiedEstimate.totalEstimatedHours, 6);
    assert.equal(morningEditData.appointment.scheduledEndLabel, '11:00 AM');
    const morningEmail = sentEmails[sentEmails.length - 1];
    assert.equal(morningEmail.previousReferenceCode, morningDeepData.referenceCode);
    assert.match(morningEmail.emailPackage.subject, /^\[UPDATED\] /);
    assert.match(morningEmail.emailPackage.htmlBody, /#16A34A/);
    assert.match(morningEmail.emailPackage.htmlBody, /#1D4ED8/);
    assert.match(morningEmail.emailPackage.icsContent, /UID:/);
    assert.match(morningEmail.emailPackage.icsContent, /SEQUENCE:1/);
    assert.match(morningEmail.emailPackage.icsContent, /SUMMARY:\\\[UPDATED\\\] |SUMMARY:\[UPDATED\] /);
    assert.match(morningEmail.emailPackage.customerConfirmation.subject, /^\[UPDATED APPOINTMENT\] /);
    assert.match(morningEmail.emailPackage.customerConfirmation.htmlBody, /\$330\.00/);
    assert.match(morningEmail.emailPackage.customerConfirmation.htmlBody, /\$395\.00/);
    assert.doesNotMatch(morningEmail.emailPackage.customerConfirmation.htmlBody, /Finish Early/i);

    // 2c. Edit #2 on top of Edit #1 (adding an Inside Oven -> $475) STILL keeps exact same Reference ID & succeeds!
    const morningEdit2Res = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload({ quote: { addons: { fridge: 1, fridgeDouble: 0, oven: 1, pets: 0 } } }),
        updateToken: morningEditData.updateToken
      })
    });
    assert.equal(morningEdit2Res.status, 200);
    const morningEdit2Data = await morningEdit2Res.json();
    assert.equal(morningEdit2Data.referenceCode, morningDeepData.referenceCode);
    assert.equal(morningEdit2Data.updateCount, 2);
    assert.equal(morningEdit2Data.verifiedEstimate.grandTotal, 475);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.subject, /^\[UPDATED #2\] /);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.icsContent, /SEQUENCE:2/);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.customerConfirmation.htmlBody, /\$395\.00/);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.customerConfirmation.htmlBody, /\$475\.00/);

    // 2d. Locked date & window check: editing updateToken with a different date or time block is rejected (400 APPOINTMENT_TIME_LOCKED)
    const timeChangeAttempt = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload({
          appointment: { preferredDate: '2026-11-12', preferredWindow: '11:00-14:00' }
        }),
        updateToken: morningEdit2Data.updateToken
      })
    });
    assert.equal(timeChangeAttempt.status, 400);
    assert.equal((await timeChangeAttempt.json()).code, 'APPOINTMENT_TIME_LOCKED');

    // Tampered updateToken must fail closed with 400 INVALID_UPDATE_TOKEN
    const badUpdateRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload(),
        updateToken: `${morningEdit2Data.updateToken}tamper`
      })
    });
    assert.equal(badUpdateRes.status, 400);
    assert.equal((await badUpdateRes.json()).code, 'INVALID_UPDATE_TOKEN');

    // 3. Another customer cannot book the SAME 08:00-11:00 slot on 2026-11-10 (409 SLOT_ALREADY_BOOKED),
    //    but CAN book 11:00-14:00 or 14:00-16:30 because calendar blocks remain discrete!
    const sameWindowConflictRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        makePayload({
          customer: { email: 'bob@example.com', firstName: 'Bob', lastName: 'Smith', phone: '(318) 555-0123' },
          appointment: { preferredDate: '2026-11-10', preferredWindow: '08:00-11:00' },
          quote: { scopeMode: 'specific', specificHours: 2, specificAreasText: 'Kitchen and 1 bath' }
        })
      )
    });
    assert.equal(sameWindowConflictRes.status, 409);
    assert.equal((await sameWindowConflictRes.json()).code, 'SLOT_ALREADY_BOOKED');

    const afternoonSpecificRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        makePayload({
          customer: { email: 'carol@example.com', firstName: 'Carol', lastName: 'Jones', phone: '(318) 555-0144' },
          appointment: { preferredDate: '2026-11-10', preferredWindow: '14:00-16:30' },
          quote: { scopeMode: 'specific', specificHours: 2, specificAreasText: 'Kitchen and 1 bath' }
        })
      )
    });
    assert.equal(afternoonSpecificRes.status, 200);
    const afternoonData = await afternoonSpecificRes.json();
    assert.equal(afternoonData.appointment.scheduledEndLabel, '4:30 PM');

    // 3b. Monthly recurring clean on 2026-11-18 emits RRULE:FREQ=MONTHLY and blocks 2026-12-18
    const monthlyEmailIdx = sentEmails.length;
    const monthlyRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        makePayload({
          customer: { email: 'monthly@example.com', firstName: 'Mona', lastName: 'Ray', phone: '(318) 555-0133' },
          appointment: { preferredDate: '2026-11-18', preferredWindow: '11:00-14:00' },
          quote: { frequency: 'monthly' }
        })
      )
    });
    assert.equal(monthlyRes.status, 200);
    assert.match(sentEmails[monthlyEmailIdx].emailPackage.icsContent, /RRULE:FREQ=MONTHLY/);
    const availMonthlyCheck = await (await fetch(`${base}/api/calendar-availability`)).json();
    const dec18 = availMonthlyCheck.availableDates.find(d => d.date === '2026-12-18');
    assert.ok(dec18);
    assert.equal(dec18.slots.find(s => s.slotId === '11:00-14:00').status, 'BOOKED');

    // 4. Two-step Finish Early verification on updated morning Deep Clean
    const finishEarlyUrl = new URL(morningEmail.emailPackage.finishEarlyUrl);
    const token = finishEarlyUrl.searchParams.get('token');
    assert.ok(token);

    // 4a. GET /api/finish-early?token=... renders safe HTML confirmation page without any mutation
    const getPageRes = await fetch(`${base}/api/finish-early?token=${encodeURIComponent(token)}`);
    assert.equal(getPageRes.status, 200);
    assert.ok(getPageRes.headers.get('content-security-policy').includes("form-action 'none'"));
    const pageHtml = await getPageRes.text();
    assert.doesNotMatch(pageHtml, /<form\b/i);
    assert.match(pageHtml, /btn-finish-now/);
    assert.equal(calendarActions.length, 0);

    // 4b. Tampered token is rejected cleanly on POST
    const badTokenPost = await fetch(`${base}/api/finish-early`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: `${token}tamper`, mode: 'now' })
    });
    assert.equal(badTokenPost.status, 400);

    // 4c. Advance clock to 9:20 AM CST on Tuesday 2026-11-10 (15:20Z) and confirm Finished Early Now
    activeNow = new Date('2026-11-10T15:20:00Z');
    const finishNowRes = await fetch(`${base}/api/finish-early`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, mode: 'now' })
    });
    assert.equal(finishNowRes.status, 200);
    const finishNowData = await finishNowRes.json();
    assert.equal(finishNowData.success, true);
    assert.equal(finishNowData.earlyEndLabel, '9:30 AM');
    assert.ok(finishNowData.openWindowsNow.includes('11:00 AM – 2:00 PM'));
    assert.equal(calendarActions.length, 1);
    assert.equal(calendarActions[0].action, 'finishEarly');
    assert.equal(calendarActions[0].releaseAll, false);

    // 4d. busyIntervals now reflects 2026-11-10 morning block shortened to 570 (9:30 AM), leaving 11:00 AM free!
    const availAfterEarly = await (await fetch(`${base}/api/calendar-availability`)).json();
    const shortenedMorning = availAfterEarly.busyIntervals.find(
      b => b.date === '2026-11-10' && b.startMinutes === 480
    );
    assert.ok(shortenedMorning);
    assert.equal(shortenedMorning.endMinutes, 570);

    // 4e. Also verify release_all on a future weekday (Thursday 2026-11-12) restores 08:00-11:00 to AVAILABLE in availableDates
    const thursdayRes = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        makePayload({
          customer: { email: 'dana@example.com', firstName: 'Dana', lastName: 'Lee', phone: '(318) 555-0155' },
          appointment: { preferredDate: '2026-11-12', preferredWindow: '08:00-11:00' }
        })
      )
    });
    assert.equal(thursdayRes.status, 200);
    const thursdayAvailBefore = await (await fetch(`${base}/api/calendar-availability`)).json();
    const thuBefore = thursdayAvailBefore.availableDates.find(d => d.date === '2026-11-12');
    assert.equal(thuBefore.slots.find(s => s.slotId === '08:00-11:00').status, 'BOOKED');
    assert.equal(thuBefore.slots.find(s => s.slotId === '11:00-14:00').status, 'AVAILABLE');

    const thuToken = new URL(sentEmails[sentEmails.length - 1].emailPackage.finishEarlyUrl).searchParams.get('token');
    const releaseAllRes = await fetch(`${base}/api/finish-early`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: thuToken, mode: 'release_all' })
    });
    assert.equal(releaseAllRes.status, 200);
    const releaseAllJson = await releaseAllRes.json();
    assert.equal(releaseAllJson.releaseAll, true);
    assert.equal(releaseAllJson.openWindowsNow.length, 3);

    const thursdayAvailAfter = await (await fetch(`${base}/api/calendar-availability`)).json();
    const thuAfter = thursdayAvailAfter.availableDates.find(d => d.date === '2026-11-12');
    assert.equal(thuAfter.slots.find(s => s.slotId === '08:00-11:00').status, 'AVAILABLE');
    assert.equal(thuAfter.slots.find(s => s.slotId === '11:00-14:00').status, 'AVAILABLE');

    // 5. Verified edits bypass the strict unverified rate limit (allowing unlimited adjustments),
    //    while unverified requests still block past rateLimitMax.
    const strictLimitService = createIntakeService({
      nowFn: () => new Date('2026-11-09T14:00:00Z'),
      includeBaselineSchedule: false,
      rateLimitMax: 2,
      finishEarlySecret: 'strict-limit-test-secret-32-chars-minimum',
      mailTransport: async () => ({ delivered: true, provider: 'test-double' })
    });

    const initialBook = await strictLimitService.processEstimateRequest({
      rawBody: JSON.stringify(
        makePayload({
          customer: { email: 'repeat.editor@example.com', firstName: 'Repeat', lastName: 'Editor', phone: '(318) 555-0171' },
          appointment: { preferredDate: '2026-11-17', preferredWindow: '08:00-11:00' }
        })
      ),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.210'
    });
    assert.equal(initialBook.status, 200);
    let activeToken = initialBook.body.updateToken;

    for (let editIdx = 1; editIdx <= 4; editIdx++) {
      const editResp = await strictLimitService.processEstimateRequest({
        rawBody: JSON.stringify({
          ...makePayload({
            customer: { email: 'repeat.editor@example.com', firstName: 'Repeat', lastName: 'Editor', phone: '(318) 555-0171' },
            appointment: { preferredDate: '2026-11-17', preferredWindow: '08:00-11:00' },
            quote: { addons: { fridge: editIdx, fridgeDouble: 0, oven: 0, pets: 0 } }
          }),
          updateToken: activeToken
        }),
        headers: { 'content-type': 'application/json' },
        clientIp: '10.0.0.210'
      });
      assert.equal(editResp.status, 200);
      assert.equal(editResp.body.updateCount, editIdx);
      assert.equal(editResp.body.referenceCode, initialBook.body.referenceCode);
      activeToken = editResp.body.updateToken;
    }

    // Two unverified new attempts from the same IP hit 429 on the 2nd (1 initial + 1 more = 2, 3rd returns 429)
    const secondUnverified = await strictLimitService.processEstimateRequest({
      rawBody: JSON.stringify(
        makePayload({
          customer: { email: 'spam2@example.com', firstName: 'Spam', lastName: 'Two', phone: '(318) 555-0172' },
          appointment: { preferredDate: '2026-11-19', preferredWindow: '11:00-14:00' }
        })
      ),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.210'
    });
    assert.equal(secondUnverified.status, 200);

    const thirdUnverified = await strictLimitService.processEstimateRequest({
      rawBody: JSON.stringify(
        makePayload({
          customer: { email: 'spam3@example.com', firstName: 'Spam', lastName: 'Three', phone: '(318) 555-0173' },
          appointment: { preferredDate: '2026-11-20', preferredWindow: '14:00-16:30' }
        })
      ),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.210'
    });
    assert.equal(thirdUnverified.status, 429);
    assert.equal(thirdUnverified.body.code, 'RATE_LIMITED');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('remote Google Calendar webhook mode keeps same referenceCode across edits, skips all own holds, verifies customerEmailSent, and fails closed on HTML responses', async () => {
  const webhookCalls = [];
  let failHtmlNextPost = false;
  let failCustomerMailNextPost = false;
  const originalFetch = globalThis.fetch;
  // Intentionally include duplicate Google Calendar holds for the customer's locked window
  const remoteEvents = [
    { date: '2026-11-19', startMinutes: 480, endMinutes: 660 },
    { date: '2026-11-19', startMinutes: 480, endMinutes: 660 }
  ];

  process.env.EMAIL_WEBHOOK_URL = 'https://script.google.com/macros/s/test-deploy-id/exec';
  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr.startsWith('https://script.google.com/')) {
      if ((init.method || 'GET').toUpperCase() === 'GET') {
        return new Response(JSON.stringify({ ok: true, busyIntervals: remoteEvents }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      webhookCalls.push(JSON.parse(init.body));
      if (failHtmlNextPost) {
        return new Response('<!DOCTYPE html><html><body>Sign in</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      if (failCustomerMailNextPost) {
        return new Response(JSON.stringify({ ok: true, customerEmailSent: false, customerEmailError: 'Quota limit' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: true, customerEmailSent: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(url, init);
  };

  try {
    const fixedNow = new Date('2026-11-18T15:00:00Z');
    const webhookService = createIntakeService({
      nowFn: () => fixedNow,
      finishEarlySecret: 'remote-webhook-test-secret-32-chars-minimum'
    });

    const basePayload = {
      customer: {
        firstName: 'Kevin',
        lastName: 'Tester',
        phone: '(318) 555-0177',
        email: 'kevin@example.com',
        notes: 'testing'
      },
      appointment: {
        preferredDate: '2026-11-19',
        preferredWindow: '08:00-11:00'
      },
      quote: {
        serviceCategory: 'residential',
        serviceType: 'deep',
        propertyType: '',
        scopeMode: 'full',
        specificAreasText: '',
        specificHours: 1,
        bedrooms: 3,
        fullBaths: 2,
        halfBaths: 0,
        sqft: 2000,
        additionalInfo: {
          hasPets: 'no',
          lastCleaned: '1-3 Months ago',
          occupancy: 'Occupied, we live there',
          condition: 'Heavy buildup'
        },
        frequency: 'onetime',
        addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
      },
      companyWebsite: ''
    };

    // Simulate editing an already-synced Google Calendar booking using updateToken from prior confirmation
    const { createBookingUpdateToken } = await import('../server/intake-service.mjs');
    const priorToken = createBookingUpdateToken(
      {
        v: 1,
        ref: 'SPS-PRIOR12345',
        date: '2026-11-19',
        startMin: 480,
        endMin: 660,
        updateCount: 0,
        prevTotal: 375,
        exp: Date.parse('2026-11-25T00:00:00Z')
      },
      'remote-webhook-test-secret-32-chars-minimum'
    );

    const updateRes = await webhookService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...basePayload,
        quote: {
          ...basePayload.quote,
          addons: { fridge: 1, fridgeDouble: 1, oven: 0, pets: 0 }
        },
        updateToken: priorToken
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.88'
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
    assert.equal(updateRes.body.referenceCode, 'SPS-PRIOR12345');
    assert.equal(updateRes.body.updateCount, 1);
    assert.equal(webhookCalls.length, 1);
    assert.equal(webhookCalls[0].referenceCode, 'SPS-PRIOR12345');
    assert.equal(webhookCalls[0].previousReferenceCode, 'SPS-PRIOR12345');
    assert.equal(webhookCalls[0].previousDate, '2026-11-19');
    assert.equal(webhookCalls[0].isUpdated, true);
    assert.equal(webhookCalls[0].updateCount, 1);
    assert.equal(webhookCalls[0].previousTotal, 375);
    assert.ok(webhookCalls[0].customerEmail);
    assert.equal(webhookCalls[0].customerEmail.to, 'kevin@example.com');
    assert.ok(webhookCalls[0].recurrence);
    assert.equal(webhookCalls[0].recurrence.isRecurring, false);

    // If Apps Script reports customerEmailSent: false, fail closed with 502 EMAIL_DISPATCH_FAILED
    failCustomerMailNextPost = true;
    const customerMailFailRes = await webhookService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...basePayload,
        appointment: { preferredDate: '2026-11-20', preferredWindow: '08:00-11:00' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.87'
    });
    assert.equal(customerMailFailRes.status, 502);
    assert.equal(customerMailFailRes.body.code, 'EMAIL_DISPATCH_FAILED');
    failCustomerMailNextPost = false;

    // If Apps Script returns HTTP 200 HTML (e.g. "Who has access" or MailApp auth outage), fail closed with 502!
    failHtmlNextPost = true;
    const htmlFailureRes = await webhookService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...basePayload,
        appointment: { preferredDate: '2026-11-20', preferredWindow: '11:00-14:00' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.89'
    });
    assert.equal(htmlFailureRes.status, 502);
    assert.equal(htmlFailureRes.body.code, 'EMAIL_DISPATCH_FAILED');
  } finally {
    delete process.env.EMAIL_WEBHOOK_URL;
    globalThis.fetch = originalFetch;
  }
});
