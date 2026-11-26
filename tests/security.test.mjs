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

// Keep build-time unit tests hermetic even when webhook/API keys are set in the deployment environment
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
    calculation: { grandTotal: 200, estimatedHours: 4, frequencySurcharge: 0 }
  });
  assert.equal(envelope.pricingModel, 'WEEKLY_ANCHOR_HYBRID_PRICING');
  assert.equal(envelope.paymentPolicy, 'NO_ONLINE_PAYMENT_REQUIRED');
  assert.equal(envelope.onlinePaymentEnabled, false);
  assert.equal(envelope.frequencySurcharge, 0);
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
  assert.doesNotMatch(csp, /unsafe-|\*/);
  for (const directive of csp.split('; ')) {
    assert.doesNotMatch(directive, /https:/, directive);
  }
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
    const allowedExternalUrls = new Set([
      'https://builtforbusiness.net/',
      'https://share.google/qxRaiWqPZy8jyHRL2'
    ]);
    for (const extHref of html.matchAll(/\bhref="((?:https?:)?\/\/[^"]+)"/gi)) {
      assert.ok(allowedExternalUrls.has(extHref[1]), `Unexpected external URL in ${file}: ${extHref[1]}`);
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
  for (const gbpId of ['nav-gbp-widget', 'drawer-gbp-link', 'bottom-gbp-link', 'footer-gbp-link']) {
    const linkPattern = new RegExp(`<a[^>]*id="${gbpId}"[^>]*>|href="https:\\/\\/share\\.google\\/qxRaiWqPZy8jyHRL2"[^>]*id="${gbpId}"`, 'i');
    assert.match(indexHtml, linkPattern, `Missing Google Business Profile link #${gbpId}`);
  }
  assert.match(indexHtml, /href="https:\/\/share\.google\/qxRaiWqPZy8jyHRL2"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*id="nav-gbp-widget"/);
  assert.match(indexHtml, /id="google-profile"[^>]*aria-labelledby="gbp-section-title"/);
  assert.doesNotMatch(indexHtml, /gbp-map-panel|id="gbp-map-canvas"|id="gbp-map-fallback"|id="gbp-zone-readout"|data-map-city=|gbp-map-legend/);
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
    assert.equal(availData.paymentPolicy, '50% Deposit Required In Person (No Online Payment) • Estimate Sent to Owner Email');
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

    // 7b. Verify Specific Areas (+$50/hr) stacks on top of base services & 2000 sqft Standard ($250) and Deep ($330) quotes
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
    assert.equal(oneHrSpecificQuote.basePrice, 250);
    assert.equal(oneHrSpecificQuote.frequencySurcharge, 65);
    assert.equal(oneHrSpecificQuote.specificAddonHours, 1);
    assert.equal(oneHrSpecificQuote.specificAddonPrice, 50);
    assert.equal(oneHrSpecificQuote.addonsTotal, 50);
    assert.equal(oneHrSpecificQuote.totalEstimatedHours, 6);
    assert.equal(oneHrSpecificQuote.grandTotal, 365);

    const deepPlusSpecificQuote = calculateAuthoritativeQuote({
      serviceCategory: 'residential',
      serviceType: 'deep',
      propertyType: '',
      scopeMode: 'specific',
      specificAreasText: 'Extra detail on master bath & kitchen backsplash',
      specificHours: 2,
      bedrooms: 3,
      fullBaths: 2,
      halfBaths: 0,
      sqft: 2000,
      additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
      frequency: 'onetime',
      addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
    });
    assert.equal(deepPlusSpecificQuote.basePrice, 330);
    assert.equal(deepPlusSpecificQuote.frequencySurcharge, 86);
    assert.equal(deepPlusSpecificQuote.specificAddonHours, 2);
    assert.equal(deepPlusSpecificQuote.specificAddonPrice, 100);
    assert.equal(deepPlusSpecificQuote.addonsTotal, 100);
    assert.equal(deepPlusSpecificQuote.totalEstimatedHours, 7.5);
    assert.equal(deepPlusSpecificQuote.grandTotal, 516);

    const movePlusSpecificQuote = calculateAuthoritativeQuote({
      serviceCategory: 'moveinout',
      serviceType: 'moveinout',
      propertyType: 'House',
      scopeMode: 'specific',
      specificAreasText: 'Garage sweep and patio doors',
      specificHours: 1,
      bedrooms: 3,
      fullBaths: 2,
      halfBaths: 0,
      sqft: 2000,
      additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Empty / Unfurnished', condition: 'Average, normal use' },
      frequency: 'onetime',
      addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
    });
    assert.equal(movePlusSpecificQuote.specificAddonHours, 1);
    assert.equal(movePlusSpecificQuote.specificAddonPrice, 50);
    assert.equal(
      movePlusSpecificQuote.grandTotal,
      movePlusSpecificQuote.basePrice + movePlusSpecificQuote.frequencySurcharge + 50
    );

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
    assert.equal(standard2000Quote.frequencySurcharge, 65);
    assert.equal(standard2000Quote.totalEstimatedHours, 5);
    assert.equal(standard2000Quote.grandTotal, 315);

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
    assert.equal(deep2000Quote.frequencySurcharge, 86);
    assert.equal(deep2000Quote.totalEstimatedHours, 5.5);
    assert.equal(deep2000Quote.grandTotal, 416);

    // 8. Valid weekly anchor request recalculates authoritative total ($275 base + $0 weekly surcharge + $54.99 fridge + $35 pets = $364.99),
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
    assert.equal(validData.verifiedEstimate.grandTotal, 364.99);
    assert.equal(validData.verifiedEstimate.basePrice, 275);
    assert.equal(validData.verifiedEstimate.frequencySurcharge, 0);
    assert.equal(validData.verifiedEstimate.addonsTotal, 89.99);
    assert.equal(validData.verifiedEstimate.pricingModel, 'WEEKLY_ANCHOR_HYBRID_PRICING');
    assert.match(validData.message, /50% deposit is required in person/i);
    assert.doesNotMatch(validData.message, /\bHours?\b/i);
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
    assert.match(sentEmails[0].emailPackage.icsContent, /50% deposit required in person/i);
    assert.doesNotMatch(sentEmails[0].emailPackage.icsContent, /Est\. Cleaning Time:/);
    assert.match(sentEmails[0].emailPackage.finishEarlyUrl, /\/api\/finish-early\?token=/);
    assert.doesNotMatch(sentEmails[0].emailPackage.textBody, /Est\. Cleaning Time:/);
    assert.doesNotMatch(sentEmails[0].emailPackage.htmlBody, /Est\. Cleaning Time:/);
    assert.match(sentEmails[0].emailPackage.htmlBody, /Finish Early/);
    assert.ok(sentEmails[0].emailPackage.customerConfirmation);
    assert.equal(sentEmails[0].emailPackage.customerConfirmation.to, 'jose.garcia@example.com');
    assert.match(sentEmails[0].emailPackage.customerConfirmation.htmlBody, /\$364\.99/);
    assert.match(sentEmails[0].emailPackage.customerConfirmation.htmlBody, /50% deposit is required in person/i);
    assert.doesNotMatch(sentEmails[0].emailPackage.customerConfirmation.textBody, /Est\. Cleaning Time:/i);
    assert.doesNotMatch(sentEmails[0].emailPackage.customerConfirmation.htmlBody, /Est\. Cleaning Time:/i);
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

    // 11a. Submitting the same customer email WITHOUT a signed updateToken cannot overwrite the slot (prevents email-guessing slot hijacking)
    const unverifiedSameEmailOverwriteRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        quote: {
          ...validPayload.quote,
          scopeMode: 'specific',
          specificHours: 4,
          specificAreasText: 'Attempted overwrite without token'
        }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.51'
    });
    assert.equal(unverifiedSameEmailOverwriteRes.status, 409);
    assert.equal(unverifiedSameEmailOverwriteRes.body.code, 'SLOT_ALREADY_BOOKED');

    // 11b. Same customer with their signed updateToken can edit their confirmed request to add Specific Areas (Level 4 = +$200) on top of base Standard Clean ($275) + Fridge ($54.99) + Pets ($35) = $564.99
    const editedSameCustomerRes = await intakeService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...validPayload,
        quote: {
          ...validPayload.quote,
          scopeMode: 'specific',
          specificHours: 4, // +Level 4 * $50 = +$200 add-on stacked on top of $275 base + $54.99 fridge + $35 pets = $564.99
          specificAreasText: 'Kitchen, living room, and master bath'
        },
        updateToken: validData.updateToken
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.51'
    });
    assert.equal(editedSameCustomerRes.status, 200);
    assert.equal(editedSameCustomerRes.body.success, true);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.basePrice, 275);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.specificAddonHours, 4);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.specificAddonPrice, 200);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.addonsTotal, 289.99);
    assert.equal(editedSameCustomerRes.body.verifiedEstimate.grandTotal, 564.99);
    const sameCustEditEmail = sentEmails[sentEmails.length - 1].emailPackage;
    assert.match(sameCustEditEmail.htmlBody, /Residential Standard Clean/);
    assert.match(sameCustEditEmail.htmlBody, /4 Bed, 2 Full Bath, 1 Half Bath/);
    assert.match(sameCustEditEmail.htmlBody, /Specific Areas Add-On/);

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
    const decodedUnconfMailto = decodeURIComponent(unconfRes.body.fallbackMailtoUrl);
    assert.doesNotMatch(decodedUnconfMailto, /finish-early|EARLY COMPLETION CONTROL/i);
    assert.doesNotMatch(unconfRes.body.icsContent || '', /finish-early/i);
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
      frequency: 'weekly',
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

    // 2b. Edit that booking using updateToken to add a fridge (+0.5h -> 6.0 hrs, $384.99) keeping SAME Reference ID
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
    assert.equal(morningEditData.verifiedEstimate.grandTotal, 384.99);
    assert.equal(morningEditData.verifiedEstimate.totalEstimatedHours, 6);
    assert.equal(morningEditData.appointment.scheduledEndLabel, '11:00 AM');
    const morningEmail = sentEmails[sentEmails.length - 1];
    assert.equal(morningEmail.previousReferenceCode, morningDeepData.referenceCode);
    assert.match(morningEmail.emailPackage.subject, /^\[UPDATED\] /);
    assert.match(morningEmail.emailPackage.htmlBody, /#16A34A/);
    assert.match(morningEmail.emailPackage.htmlBody, /#1D4ED8/);
    assert.match(morningEmail.emailPackage.htmlBody, /What Was Added \/ Updated/);
    assert.match(morningEmail.emailPackage.htmlBody, /\+ ADDED/);
    assert.match(morningEmail.emailPackage.htmlBody, /Single Fridge Cleaning/);
    assert.match(morningEmail.emailPackage.htmlBody, /\+1 added \(0x → 1x, \+\$54\.99\)/);
    assert.match(morningEmail.emailPackage.icsContent, /UID:/);
    assert.match(morningEmail.emailPackage.icsContent, /SEQUENCE:1/);
    assert.match(morningEmail.emailPackage.icsContent, /SUMMARY:\\\[UPDATED\\\] |SUMMARY:\[UPDATED\] /);
    assert.match(morningEmail.emailPackage.customerConfirmation.subject, /^\[UPDATED APPOINTMENT\] /);
    assert.match(morningEmail.emailPackage.customerConfirmation.htmlBody, /\$330\.00/);
    assert.match(morningEmail.emailPackage.customerConfirmation.htmlBody, /\$384\.99/);
    assert.doesNotMatch(morningEmail.emailPackage.customerConfirmation.htmlBody, /Finish Early/i);

    // 2c. Edit #2 on top of Edit #1 (adding an Inside Oven +$61.88 -> $446.87) STILL keeps exact same Reference ID & succeeds!
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
    assert.equal(morningEdit2Data.verifiedEstimate.grandTotal, 446.87);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.subject, /^\[UPDATED #2\] /);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.htmlBody, /Inside Oven Cleaning/);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.htmlBody, /\+1 added \(0x → 1x, \+\$61\.88\)/);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.icsContent, /SEQUENCE:2/);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.customerConfirmation.htmlBody, /\$384\.99/);
    assert.match(sentEmails[sentEmails.length - 1].emailPackage.customerConfirmation.htmlBody, /\$446\.87/);

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

    // 2e. Token Crossover Blocked: passing a customer updateToken (kind: 'update') to /api/finish-early is rejected
    const crossoverGetRes = await fetch(
      `${base}/api/finish-early?token=${encodeURIComponent(morningEdit2Data.updateToken)}`
    );
    assert.equal(crossoverGetRes.status, 400);
    const crossoverPostRes = await fetch(`${base}/api/finish-early`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: morningEdit2Data.updateToken, mode: 'release_all' })
    });
    assert.equal(crossoverPostRes.status, 400);

    // 2f. No-Downgrade Floor Enforced: customer cannot downgrade service tier, reduce home size, or remove confirmed add-ons
    const downgradeServiceAttempt = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload({
          quote: {
            serviceType: 'standard',
            addons: { fridge: 1, fridgeDouble: 0, oven: 1, pets: 0 }
          }
        }),
        updateToken: morningEdit2Data.updateToken
      })
    });
    assert.equal(downgradeServiceAttempt.status, 400);
    assert.equal((await downgradeServiceAttempt.json()).code, 'DOWNGRADE_NOT_PERMITTED');

    const removeAddonAttempt = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload({
          quote: {
            addons: { fridge: 1, fridgeDouble: 0, oven: 0, pets: 0 } // trying to remove confirmed oven
          }
        }),
        updateToken: morningEdit2Data.updateToken
      })
    });
    assert.equal(removeAddonAttempt.status, 400);
    assert.equal((await removeAddonAttempt.json()).code, 'DOWNGRADE_NOT_PERMITTED');

    // 2g. Customer Identity Lock Enforced: customer cannot swap email, phone, or name on an existing booking
    const swapEmailAttempt = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload({
          customer: { email: 'victim@example.com' },
          quote: { addons: { fridge: 1, fridgeDouble: 0, oven: 1, pets: 0 } }
        }),
        updateToken: morningEdit2Data.updateToken
      })
    });
    assert.equal(swapEmailAttempt.status, 403);
    assert.equal((await swapEmailAttempt.json()).code, 'CUSTOMER_IDENTITY_LOCKED');

    // 2h. 24-Hour Edit Cutoff Enforced: within 24 hours of appointment start, online edits lock (400 EDIT_WINDOW_CLOSED_24H)
    activeNow = new Date('2026-11-09T15:00:00Z'); // 9:00 AM CST Monday (23 hours before Tuesday 8:00 AM CST)
    const lateEditAttempt = await fetch(`${base}/api/estimate-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makePayload({
          quote: { addons: { fridge: 1, fridgeDouble: 1, oven: 1, pets: 0 } }
        }),
        updateToken: morningEdit2Data.updateToken
      })
    });
    assert.equal(lateEditAttempt.status, 400);
    assert.equal((await lateEditAttempt.json()).code, 'EDIT_WINDOW_CLOSED_24H');
    activeNow = new Date('2026-11-09T14:00:00Z'); // restore clock for remaining tests

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
  let omitCustomerMailFlagNextPost = false;
  const originalFetch = globalThis.fetch;
  // Intentionally include duplicate & non-exact overlapping Google Calendar holds for the customer's locked window
  const remoteEvents = [
    { date: '2026-11-19', startMinutes: 480, endMinutes: 660 },
    { date: '2026-11-19', startMinutes: 480, endMinutes: 810 }
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
      if (omitCustomerMailFlagNextPost) {
        return new Response(JSON.stringify({ ok: true }), {
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
    const fixedNow = new Date('2026-11-17T15:00:00Z'); // 47 hours before 2026-11-19 08:00 AM CST
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
        frequency: 'weekly',
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
    assert.equal(webhookCalls[0].recurrence.isRecurring, true);

    // Also test a Weekly recurring booking edited TWICE in a row (adding Specific Areas +$100 and Inside Oven +$80):
    // verifies previousFrequency='weekly' is sent for Code.gs in-place update, referenceCode stays identical,
    // green + ADDED diff renders for Specific Areas Add-On, and base Deep Clean + specs remain intact.
    const weeklyInitialRes = await webhookService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...basePayload,
        appointment: { preferredDate: '2026-11-24', preferredWindow: '08:00-11:00' },
        quote: { ...basePayload.quote, frequency: 'weekly' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.91'
    });
    assert.equal(weeklyInitialRes.status, 200);
    const weeklyRef = weeklyInitialRes.body.referenceCode;
    const weeklyEdit1Res = await webhookService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...basePayload,
        appointment: { preferredDate: '2026-11-24', preferredWindow: '08:00-11:00' },
        quote: {
          ...basePayload.quote,
          frequency: 'weekly',
          scopeMode: 'specific',
          specificHours: 2,
          specificAreasText: 'Pantry shelves and mudroom baseboards'
        },
        updateToken: weeklyInitialRes.body.updateToken
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.91'
    });
    assert.equal(weeklyEdit1Res.status, 200);
    assert.equal(weeklyEdit1Res.body.referenceCode, weeklyRef);
    assert.equal(weeklyEdit1Res.body.verifiedEstimate.basePrice, 330);
    assert.equal(weeklyEdit1Res.body.verifiedEstimate.specificAddonPrice, 100);
    assert.equal(weeklyEdit1Res.body.verifiedEstimate.grandTotal, 430);
    const weeklyEdit1Webhook = webhookCalls[webhookCalls.length - 1];
    assert.equal(weeklyEdit1Webhook.previousFrequency, 'weekly');
    assert.equal(weeklyEdit1Webhook.recurrence.frequency, 'weekly');
    assert.match(weeklyEdit1Webhook.htmlBody, /#16A34A/);
    assert.match(weeklyEdit1Webhook.htmlBody, /\+ ADDED/);
    assert.match(weeklyEdit1Webhook.htmlBody, /Specific Areas Add-On \(Priority Focus\)/);
    assert.match(weeklyEdit1Webhook.htmlBody, /Residential Deep Clean/);
    assert.match(weeklyEdit1Webhook.htmlBody, /3 Bed, 2 Full Bath/);

    const weeklyEdit2Res = await webhookService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...basePayload,
        appointment: { preferredDate: '2026-11-24', preferredWindow: '08:00-11:00' },
        quote: {
          ...basePayload.quote,
          frequency: 'weekly',
          scopeMode: 'specific',
          specificHours: 2,
          specificAreasText: 'Pantry shelves and mudroom baseboards',
          addons: { fridge: 0, fridgeDouble: 0, oven: 1, pets: 0 }
        },
        updateToken: weeklyEdit1Res.body.updateToken
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.91'
    });
    assert.equal(weeklyEdit2Res.status, 200);
    assert.equal(weeklyEdit2Res.body.referenceCode, weeklyRef);
    assert.equal(weeklyEdit2Res.body.updateCount, 2);
    assert.equal(weeklyEdit2Res.body.verifiedEstimate.grandTotal, 491.88);
    const weeklyEdit2Webhook = webhookCalls[webhookCalls.length - 1];
    assert.equal(weeklyEdit2Webhook.previousFrequency, 'weekly');
    assert.equal(weeklyEdit2Webhook.recurrence.frequency, 'weekly');
    assert.match(weeklyEdit2Webhook.htmlBody, /Inside Oven Cleaning/);

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
    const customerMailFailBody = customerMailFailRes.body;
    assert.equal(customerMailFailBody.code, 'EMAIL_DISPATCH_FAILED');
    assert.doesNotMatch(decodeURIComponent(customerMailFailBody.fallbackMailtoUrl), /finish-early|EARLY COMPLETION CONTROL/i);
    assert.doesNotMatch(customerMailFailBody.icsContent || '', /finish-early/i);
    failCustomerMailNextPost = false;

    // If an older Apps Script deployment returns { ok: true } without customerEmailSent: true, fail closed with 502
    omitCustomerMailFlagNextPost = true;
    const staleScriptRes = await webhookService.processEstimateRequest({
      rawBody: JSON.stringify({
        ...basePayload,
        appointment: { preferredDate: '2026-11-23', preferredWindow: '08:00-11:00' }
      }),
      headers: { 'content-type': 'application/json' },
      clientIp: '10.0.0.86'
    });
    assert.equal(staleScriptRes.status, 502);
    const staleScriptBody = staleScriptRes.body;
    assert.equal(staleScriptBody.code, 'EMAIL_DISPATCH_FAILED');
    assert.doesNotMatch(decodeURIComponent(staleScriptBody.fallbackMailtoUrl), /finish-early|EARLY COMPLETION CONTROL/i);
    omitCustomerMailFlagNextPost = false;

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
    assert.doesNotMatch(decodeURIComponent(htmlFailureRes.body.fallbackMailtoUrl), /finish-early|EARLY COMPLETION CONTROL/i);
  } finally {
    delete process.env.EMAIL_WEBHOOK_URL;
    globalThis.fetch = originalFetch;
  }
});

test('extra living room, service details validation/diffs, all 8 Starting From add-ons, and 50% in-person deposit policy work end-to-end', async () => {
  const fixedNow = new Date('2026-11-04T15:00:00Z');
  const sentEmails = [];
  const service = createIntakeService({
    nowFn: () => fixedNow,
    includeBaselineSchedule: false,
    rateLimitMax: 25,
    finishEarlySecret: 'addons-living-details-secret-32-chars-ok',
    mailTransport: async (emailPackage, record, referenceCode) => {
      sentEmails.push({ emailPackage, record, referenceCode });
      return { delivered: true, provider: 'test-double' };
    }
  });

  // 1. Authoritative calculation checks: Extra Living Room (+0.5 hr) + all 8 custom add-ons with clean cent rounding
  const fullAddonsQuote = calculateAuthoritativeQuote({
    serviceCategory: 'residential',
    serviceType: 'standard',
    propertyType: '',
    scopeMode: 'full',
    specificAreasText: '',
    specificHours: 1,
    serviceDetails: 'Please wipe baseboards in sunroom and fold spare linens.',
    bedrooms: 3,
    fullBaths: 2,
    halfBaths: 1,
    extraLivingRooms: 1,
    sqft: 1800, // 1.5 + 1.5 + 1.0 + 0.25 + 0.5 + 0.8 = 5.55 -> rounds to 5.5 hrs * $50 = $275 base
    additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
    frequency: 'weekly',
    addons: {
      fridge: 1, // 54.99
      fridgeDouble: 1, // 64.99
      oven: 1, // 61.88
      laundry: 1, // 48.98
      organizing: 1, // 29.60
      dishes: 1, // 24.78
      windows: 4, // 32.00
      powerWashWindows: 2, // 50.00
      pets: 0
    }
  });
  assert.equal(fullAddonsQuote.basePrice, 275);
  assert.equal(fullAddonsQuote.addonsTotal, 367.22);
  assert.equal(fullAddonsQuote.grandTotal, 642.22);

  const validBase = {
    customer: {
      firstName: 'Nadia',
      lastName: 'Comaneci',
      phone: '(318) 555-0131',
      email: 'nadia@example.com',
      notes: 'Side door unlocked.'
    },
    appointment: {
      preferredDate: '2026-11-06',
      preferredWindow: '08:00-11:00'
    },
    quote: {
      serviceCategory: 'residential',
      serviceType: 'standard',
      propertyType: '',
      scopeMode: 'full',
      specificAreasText: '',
      specificHours: 1,
      serviceDetails: 'Focus on living area baseboards and inside pantry shelves.',
      bedrooms: 3,
      fullBaths: 2,
      halfBaths: 1,
      extraLivingRooms: 1,
      sqft: 1800,
      additionalInfo: {
        hasPets: 'no',
        lastCleaned: '1-3 Months ago',
        occupancy: 'Occupied, we live there',
        condition: 'Average, normal use'
      },
      frequency: 'weekly',
      addons: {
        fridge: 0,
        fridgeDouble: 0,
        oven: 0,
        laundry: 1,
        organizing: 1,
        dishes: 1,
        windows: 30,
        powerWashWindows: 0,
        pets: 0
      }
    },
    companyWebsite: ''
  };

  // 2. Bounds & security rejections for extraLivingRooms, serviceDetails, and new add-ons
  const badLivingRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({ ...validBase, quote: { ...validBase.quote, extraLivingRooms: 5 } }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.10'
  });
  assert.equal(badLivingRes.status, 400);
  assert.equal(badLivingRes.body.code, 'INVALID_PROPERTY_BOUNDS');

  const badWindowRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: { ...validBase.quote, addons: { ...validBase.quote.addons, windows: 31 } }
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.11'
  });
  assert.equal(badWindowRes.status, 400);
  assert.equal(badWindowRes.body.code, 'INVALID_ADDON_COUNTS');

  const badLaundryRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: { ...validBase.quote, addons: { ...validBase.quote.addons, laundry: 6 } }
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.12'
  });
  assert.equal(badLaundryRes.status, 400);
  assert.equal(badLaundryRes.body.code, 'INVALID_ADDON_COUNTS');

  const tooLongDetailsRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: { ...validBase.quote, serviceDetails: 'a'.repeat(501) }
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.13'
  });
  assert.equal(tooLongDetailsRes.status, 400);
  assert.equal(tooLongDetailsRes.body.code, 'INVALID_SERVICE_DETAILS');

  const phishingDetailsRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: { ...validBase.quote, serviceDetails: 'Check list at https://evil-site.example/list' }
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.14'
  });
  assert.equal(phishingDetailsRes.status, 400);
  assert.equal(phishingDetailsRes.body.code, 'PHISHING_LINK_REJECTED');

  const cardDetailsRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: { ...validBase.quote, serviceDetails: 'Bill 4532 0151 1283 0366 for extras' }
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.15'
  });
  assert.equal(cardDetailsRes.status, 400);
  assert.equal(cardDetailsRes.body.code, 'SENSITIVE_DATA_REJECTED');

  // 3. Valid submission saves extraLivingRooms, serviceDetails, new add-ons, and includes 50% deposit policy
  const okRes = await service.processEstimateRequest({
    rawBody: JSON.stringify(validBase),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.20'
  });
  assert.equal(okRes.status, 200);
  // 275 + 48.98 + 29.60 + 24.78 + (30 * 8 = 240) = 618.36
  assert.equal(okRes.body.verifiedEstimate.addonsTotal, 343.36);
  assert.equal(okRes.body.verifiedEstimate.grandTotal, 618.36);
  assert.match(okRes.body.message, /50% deposit is required in person/i);
  assert.doesNotMatch(okRes.body.message, /\bHours?\b/i);

  const initialEmail = sentEmails[sentEmails.length - 1].emailPackage;
  assert.match(initialEmail.textBody, /1 Extra Living Room/);
  assert.match(initialEmail.textBody, /Focus on living area baseboards and inside pantry shelves/);
  assert.match(initialEmail.textBody, /50% Deposit Required In Person/);
  assert.match(initialEmail.customerConfirmation.htmlBody, /Focus on living area baseboards and inside pantry shelves/);
  assert.match(initialEmail.customerConfirmation.htmlBody, /50% deposit is required in person/i);
  assert.match(initialEmail.customerConfirmation.htmlBody, /Laundry Load — Wash, dry, and fold \(from \$48\.98\/load\)/);
  assert.match(initialEmail.customerConfirmation.htmlBody, /Organizing per Area \(from \$29\.60\/area\)/);
  assert.doesNotMatch(initialEmail.customerConfirmation.htmlBody, /Est\. Cleaning Time:/i);
  assert.match(initialEmail.icsContent, /50% deposit required in person/i);

  // 4. Editing via updateToken locks extraLivingRooms and prevents downgrading laundry/windows, while allowing additions & serviceDetails edits
  const downgradeLivingRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: { ...validBase.quote, extraLivingRooms: 0 },
      updateToken: okRes.body.updateToken
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.20'
  });
  assert.equal(downgradeLivingRes.status, 400);
  assert.equal(downgradeLivingRes.body.code, 'DOWNGRADE_NOT_PERMITTED');

  const downgradeLaundryRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: {
        ...validBase.quote,
        addons: { ...validBase.quote.addons, laundry: 0 }
      },
      updateToken: okRes.body.updateToken
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.20'
  });
  assert.equal(downgradeLaundryRes.status, 400);
  assert.equal(downgradeLaundryRes.body.code, 'DOWNGRADE_NOT_PERMITTED');

  const addPowerWashEdit = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      ...validBase,
      quote: {
        ...validBase.quote,
        serviceDetails: 'Focus on living area baseboards, pantry shelves, and patio glass.',
        addons: { ...validBase.quote.addons, powerWashWindows: 2 }
      },
      updateToken: okRes.body.updateToken
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.2.20'
  });
  assert.equal(addPowerWashEdit.status, 200);
  assert.equal(addPowerWashEdit.body.verifiedEstimate.grandTotal, 668.36);
  const editedEmail = sentEmails[sentEmails.length - 1].emailPackage;
  assert.match(editedEmail.htmlBody, /Power Wash Window Sets/);
  assert.match(editedEmail.htmlBody, /from \$25\/set/);
  assert.match(editedEmail.htmlBody, /Details on What Is Needed/);
  assert.doesNotMatch(editedEmail.customerConfirmation.htmlBody, /Estimated Cleaning Duration/i);
});


test('weekly-anchor hybrid pricing, Commercial-only Overnight Mon-Fri tentative scheduling, midnight-crossing .ics, and daytime vs overnight isolation', async () => {
  // 1. Hybrid pricing formula across $250 residential base, $400 larger residential base, Airbnb turnover, and Commercial overnight
  const resBaseQuote = (frequency) => calculateAuthoritativeQuote({
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
    frequency,
    addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
  });
  assert.equal(resBaseQuote('weekly').grandTotal, 250);
  assert.equal(resBaseQuote('weekly').frequencySurcharge, 0);
  assert.equal(resBaseQuote('biweekly').frequencySurcharge, 30);
  assert.equal(resBaseQuote('biweekly').grandTotal, 280);
  assert.equal(resBaseQuote('monthly').frequencySurcharge, 50);
  assert.equal(resBaseQuote('monthly').grandTotal, 300);
  assert.equal(resBaseQuote('onetime').frequencySurcharge, 65);
  assert.equal(resBaseQuote('onetime').grandTotal, 315);

  const largeBaseQuote = (frequency) => calculateAuthoritativeQuote({
    serviceCategory: 'residential',
    serviceType: 'standard',
    propertyType: '',
    scopeMode: 'full',
    specificAreasText: '',
    specificHours: 1,
    bedrooms: 5,
    fullBaths: 4,
    halfBaths: 0,
    sqft: 3000, // 1.5 + 2.5 + 2.0 + 2.0 = 8 hrs * $50 = $400 base
    additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
    frequency,
    addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
  });
  assert.equal(largeBaseQuote('weekly').grandTotal, 400);
  assert.equal(largeBaseQuote('biweekly').frequencySurcharge, 48);
  assert.equal(largeBaseQuote('biweekly').grandTotal, 448);
  assert.equal(largeBaseQuote('monthly').frequencySurcharge, 80);
  assert.equal(largeBaseQuote('monthly').grandTotal, 480);
  assert.equal(largeBaseQuote('onetime').frequencySurcharge, 104);
  assert.equal(largeBaseQuote('onetime').grandTotal, 504);

  const airbnbTurnover = calculateAuthoritativeQuote({
    serviceCategory: 'airbnb',
    serviceType: 'airbnb',
    propertyType: '',
    scopeMode: 'full',
    specificAreasText: '',
    specificHours: 1,
    bedrooms: 3,
    fullBaths: 2,
    halfBaths: 0,
    sqft: 2000,
    additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
    frequency: 'turnover',
    addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
  });
  assert.equal(airbnbTurnover.basePrice, 250);
  assert.equal(airbnbTurnover.frequencySurcharge, 0);
  assert.equal(airbnbTurnover.grandTotal, 250);

  const commercialOvernightQuote = calculateAuthoritativeQuote({
    serviceCategory: 'commercial',
    serviceType: 'commercial',
    propertyType: '',
    scopeMode: 'full',
    specificAreasText: '',
    specificHours: 1,
    bedrooms: 3,
    fullBaths: 2,
    halfBaths: 0,
    sqft: 1800,
    additionalInfo: { hasPets: '', lastCleaned: '', occupancy: '', condition: '' },
    frequency: 'overnight',
    addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
  });
  assert.equal(commercialOvernightQuote.basePrice, 0);
  assert.equal(commercialOvernightQuote.frequencySurcharge, 0);
  assert.equal(commercialOvernightQuote.grandTotal, 0);
  assert.equal(commercialOvernightQuote.customQuoteAtWalkthrough, true);
  assert.equal(commercialOvernightQuote.priceDisplay, 'Custom Quote at Walkthrough');

  // 2. Non-commercial overnight requests fail closed; window mismatches fail closed
  let activeNow = new Date('2026-11-04T15:00:00Z');
  const sentEmails = [];
  const service = createIntakeService({
    nowFn: () => activeNow,
    includeBaselineSchedule: false,
    rateLimitMax: 20,
    finishEarlySecret: 'overnight-test-secret-minimum-32-chars-ok',
    mailTransport: async (emailPackage, record, referenceCode) => {
      sentEmails.push({ emailPackage, record, referenceCode });
      return { delivered: true, provider: 'test-double' };
    }
  });

  const nonCommercialOvernight = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      customer: {
        firstName: 'Sam',
        lastName: 'Homeowner',
        phone: '(318) 555-0141',
        email: 'sam@example.com',
        notes: ''
      },
      appointment: { preferredDate: '2026-11-06', preferredWindow: '21:00-01:00' },
      quote: {
        serviceCategory: 'residential',
        serviceType: 'standard',
        scopeMode: 'full',
        bedrooms: 3,
        fullBaths: 2,
        halfBaths: 0,
        sqft: 2000,
        additionalInfo: { hasPets: 'no', lastCleaned: '1-3 Months ago', occupancy: 'Occupied, we live there', condition: 'Average, normal use' },
        frequency: 'overnight',
        addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
      },
      companyWebsite: ''
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.1.10'
  });
  assert.equal(nonCommercialOvernight.status, 400);
  assert.equal(nonCommercialOvernight.body.code, 'OVERNIGHT_COMMERCIAL_ONLY');

  const commercialDaytimeWithOvernightWin = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      customer: {
        firstName: 'Pat',
        lastName: 'Manager',
        phone: '(318) 555-0142',
        email: 'pat@example.com',
        notes: ''
      },
      appointment: { preferredDate: '2026-11-06', preferredWindow: '21:00-01:00' },
      quote: {
        serviceCategory: 'commercial',
        serviceType: 'commercial',
        scopeMode: 'full',
        frequency: 'weekly',
        addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
      },
      companyWebsite: ''
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.1.11'
  });
  assert.equal(commercialDaytimeWithOvernightWin.status, 400);
  assert.equal(commercialDaytimeWithOvernightWin.body.code, 'INVALID_ARRIVAL_WINDOW');

  const commercialOvernightWithDayWin = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      customer: {
        firstName: 'Pat',
        lastName: 'Manager',
        phone: '(318) 555-0142',
        email: 'pat@example.com',
        notes: ''
      },
      appointment: { preferredDate: '2026-11-06', preferredWindow: '08:00-11:00' },
      quote: {
        serviceCategory: 'commercial',
        serviceType: 'commercial',
        scopeMode: 'full',
        frequency: 'overnight',
        addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
      },
      companyWebsite: ''
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.1.12'
  });
  assert.equal(commercialOvernightWithDayWin.status, 400);
  assert.equal(commercialOvernightWithDayWin.body.code, 'INVALID_ARRIVAL_WINDOW');

  // 3. Valid Commercial Overnight Mon-Fri booking (9:00 PM - 1:00 AM crossing midnight to Nov 7)
  const overnightBookRes = await service.processEstimateRequest({
    rawBody: JSON.stringify({
      customer: {
        firstName: 'Dana',
        lastName: 'Director',
        phone: '(318) 555-0190',
        email: 'dana@example.com',
        notes: 'Suite 200 lobby and executive conference rooms.'
      },
      appointment: { preferredDate: '2026-11-06', preferredWindow: '21:00-01:00' },
      quote: {
        serviceCategory: 'commercial',
        serviceType: 'commercial',
        scopeMode: 'full',
        frequency: 'overnight',
        addons: { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 }
      },
      companyWebsite: ''
    }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.1.13'
  });
  assert.equal(overnightBookRes.status, 200);
  assert.equal(overnightBookRes.body.verifiedEstimate.basePrice, 0);
  assert.equal(overnightBookRes.body.verifiedEstimate.frequencySurcharge, 0);
  assert.equal(overnightBookRes.body.verifiedEstimate.grandTotal, 0);
  assert.equal(overnightBookRes.body.verifiedEstimate.customQuoteAtWalkthrough, true);
  assert.equal(overnightBookRes.body.verifiedEstimate.priceDisplay, 'Custom Quote at Walkthrough');
  assert.equal(overnightBookRes.body.verifiedEstimate.isOvernight, true);
  assert.equal(overnightBookRes.body.appointment.isOvernight, true);
  assert.equal(overnightBookRes.body.appointment.scheduledEndLabel, '1:00 AM');
  assert.equal(overnightBookRes.body.appointment.endIso, '2026-11-07T01:00:00-06:00');
  assert.match(overnightBookRes.body.message, /\(318\) 564-4360/);

  const overnightEmail = sentEmails[sentEmails.length - 1].emailPackage;
  assert.match(overnightEmail.subject, /\[TENTATIVE OVERNIGHT REQUEST\]/);
  assert.doesNotMatch(overnightEmail.icsContent, /RRULE:/);
  assert.match(overnightEmail.icsContent, /DTSTART;TZID=America\/Chicago:20261106T210000/);
  assert.match(overnightEmail.icsContent, /DTEND;TZID=America\/Chicago:20261107T010000/);
  assert.match(overnightEmail.icsContent, /Custom Quote at Walkthrough/);
  assert.doesNotMatch(overnightEmail.icsContent, /\$\d+/);
  assert.match(overnightEmail.htmlBody, /SPECIAL OVERNIGHT COMMERCIAL REQUEST/);
  assert.match(overnightEmail.htmlBody, /Custom Quote at Walkthrough/);
  assert.doesNotMatch(overnightEmail.textBody, /\$\d+/);
  assert.doesNotMatch(overnightEmail.htmlBody, /\$\d+/);
  assert.match(overnightEmail.customerConfirmation.subject, /\[TENTATIVE OVERNIGHT REQUEST\]/);
  assert.match(overnightEmail.customerConfirmation.htmlBody, /\(318\) 564-4360/);
  assert.match(overnightEmail.customerConfirmation.htmlBody, /Custom Quote at Walkthrough/);
  assert.doesNotMatch(overnightEmail.customerConfirmation.textBody, /\$\d+/);
  assert.doesNotMatch(overnightEmail.customerConfirmation.htmlBody, /\$\d+/);
  assert.equal(sentEmails[sentEmails.length - 1].record.appointment.recurrence.isRecurring, false);

  // Verify daytime slots stay AVAILABLE on 2026-11-06 and next Friday overnight does NOT auto-recur
  const availCheck = service.getCalendarAvailability();
  const nov06 = availCheck.availableDates.find(d => d.date === '2026-11-06');
  const nov13 = availCheck.availableDates.find(d => d.date === '2026-11-13');
  assert.ok(nov06 && nov13);
  assert.equal(nov06.openSlotCount, 3);
  assert.equal(nov06.overnightSlots.find(s => s.slotId === '21:00-01:00').status, 'BOOKED');
  assert.equal(nov06.overnightSlots.find(s => s.slotId === '18:00-22:00').status, 'BOOKED'); // overlaps 9 PM - 10 PM
  assert.equal(nov06.overnightSlots.find(s => s.slotId === '23:00-03:00').status, 'BOOKED'); // overlaps 11 PM - 1 AM
  assert.equal(nov13.overnightSlots.find(s => s.slotId === '21:00-01:00').status, 'AVAILABLE');
  const upcomingNightChip = availCheck.upcomingBookings.find(b => b.date === '2026-11-06' && b.slotId === '21:00-01:00');
  assert.ok(upcomingNightChip && upcomingNightChip.isOvernight === true);

  // 4. Finish-Early works cleanly post-midnight (12:20 AM CST on Nov 7 = 2026-11-07T06:20:00Z)
  activeNow = new Date('2026-11-07T06:20:00Z');
  const finishEarlyToken = new URL(overnightEmail.finishEarlyUrl).searchParams.get('token');
  const finishNightEarly = await service.processFinishEarlyRequest({
    method: 'POST',
    rawBody: JSON.stringify({ token: finishEarlyToken, mode: 'now' }),
    headers: { 'content-type': 'application/json' },
    clientIp: '10.0.1.14'
  });
  assert.equal(finishNightEarly.status, 200);
  assert.equal(finishNightEarly.body.earlyEndLabel, '12:30 AM');

  // 5. Remote Google Calendar doGet sync marks overnight interval booked while preserving daytime availability
  const origFetch = globalThis.fetch;
  process.env.EMAIL_WEBHOOK_URL = 'https://script.google.com/macros/s/test-overnight-sync/exec';
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://script.google.com/') && (init.method || 'GET').toUpperCase() === 'GET') {
      return new Response(JSON.stringify({
        ok: true,
        busyIntervals: [
          { date: '2026-11-12', startMinutes: 1260, endMinutes: 1500 } // 9:00 PM - 1:00 AM (+1 day)
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return origFetch(url, init);
  };
  try {
    const remoteSyncService = createIntakeService({
      nowFn: () => new Date('2026-11-04T15:00:00Z'),
      includeBaselineSchedule: false
    });
    const remoteAvail = await remoteSyncService.getCalendarAvailabilityAsync();
    const nov12 = remoteAvail.availableDates.find((d) => d.date === '2026-11-12');
    assert.ok(nov12);
    assert.equal(nov12.openSlotCount, 3); // Daytime slots unaffected
    assert.equal(nov12.overnightSlots.find((s) => s.slotId === '21:00-01:00').status, 'BOOKED');
    assert.equal(nov12.overnightSlots.find((s) => s.slotId === '18:00-22:00').status, 'BOOKED');
    assert.equal(nov12.overnightSlots.find((s) => s.slotId === '23:00-03:00').status, 'BOOKED');
    const remoteNightChip = remoteAvail.upcomingBookings.find(
      (b) => b.date === '2026-11-12' && b.slotId === '21:00-01:00'
    );
    assert.ok(remoteNightChip && remoteNightChip.isOvernight === true);
  } finally {
    delete process.env.EMAIL_WEBHOOK_URL;
    globalThis.fetch = origFetch;
  }
});


