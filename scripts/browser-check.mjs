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
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
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
  assert.deepEqual(await evaluate('window.__violations'), [], 'Legitimate page triggered CSP');
  assert.deepEqual(exceptions, [], 'Runtime errors');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 180);
  assert.equal(await evaluate('localStorage.getItem("smartspro_leads_v1")'), null);
  assert.equal(await evaluate('localStorage.getItem("unrelated")'), 'keep');
  assert.equal(await evaluate('document.querySelectorAll("form, textarea, input[type=email], input[type=tel]").length'), 0);
  assert.equal(await evaluate('(async () => (await SmartsProBackend.submitBooking({name:"test"}, {})).success)()'), false);
  assert.equal(await evaluate('typeof SmartsProBackend.getLeads'), 'undefined');
  assert.equal(await evaluate('typeof SmartsProModal.openLeadsViewer'), 'undefined');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", {key:"L", shiftKey:true}))');
  assert.equal(await evaluate('document.querySelectorAll(".modal-overlay.open").length'), 0);
  // Step 1 validation: cannot advance until a Type of Service is selected
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 1);
  assert.equal(await evaluate('document.getElementById("step1-service-grid").classList.contains("wizard-field-missing")'), true);

  // Commercial flow: selecting Commercial and clicking Next skips directly to Cleaning Frequency (Step 2 of 2)
  await evaluate('document.getElementById("card-cat-commercial").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.dispatchEnvelope.workflow.id'), 'commercial_walkthrough_pipeline');
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 3);
  assert.equal(await evaluate('document.getElementById("calc-step-total").textContent'), '2');
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

  // Residential flow: select Residential Homes, advance to Step 2, and test pricing & modal
  await evaluate('document.getElementById("card-cat-residential").click()');
  await evaluate('document.getElementById("btn-wizard-next").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 2);
  await evaluate('document.getElementById("btn-bed-plus").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 200);
  await evaluate('document.getElementById("btn-wizard-prev").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.wizardStep'), 1);
  await evaluate('document.getElementById("btn-fridge-plus").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 265);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("summary-addons-row")).display'), 'flex');
  for (const [input, expected] of [['-100', 400], ['999999', 6000], ['', 400], ['1800', 1800]]) {
    await evaluate(`(() => { const field = document.getElementById('input-sqft'); field.value = ${JSON.stringify(input)}; field.dispatchEvent(new Event('input')); })()`);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.state.sqft'), expected);
  }
  await evaluate('document.getElementById("btn-book-quote-now").click()');
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), true);
  assert.equal(await evaluate('document.getElementById("modal-recap-total").textContent'), '$265.00');
  assert.equal(await evaluate('document.activeElement.id'), 'modal-close-btn', await evaluate(`JSON.stringify({ active: document.activeElement.outerHTML.slice(0, 150), modalVisibility: getComputedStyle(document.getElementById('booking-modal-overlay')).visibility, buttonVisibility: getComputedStyle(document.getElementById('modal-close-btn')).visibility, rect: document.getElementById('modal-close-btn').getBoundingClientRect().toJSON() })`));
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
  const modalCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(artifacts, 'estimate-mobile.png'), Buffer.from(modalCapture.data, 'base64'));
  await evaluate('SmartsProModal.closeBookingModal(); document.getElementById("contact-intake-notice").scrollIntoView({behavior:"instant", block:"center"})');
  await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
  const contactCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(artifacts, 'contact-mobile.png'), Buffer.from(contactCapture.data, 'base64'));
  assert.deepEqual(await evaluate('window.__violations'), [], 'Interactions triggered CSP');
  assert.ok(responses.filter(response => response.url.startsWith(base)).every(response => response.status === 200), 'A page asset failed to load');
  assert.ok(requests.every(url => url.startsWith(base)), 'Unexpected third-party network request');
  assert.equal(await evaluate('[...document.fonts].filter(font => font.status === "loaded").length'), 3);
  console.log('PASS calculator, estimate modal, mobile layout, local fonts, legacy cleanup, and unavailable intake');

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
  assert.equal(await evaluate(`fetch('${base}/api/bookings', {method:'POST', body:'probe'}).then(() => false, () => true)`), true);
  await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
  const violations = await evaluate('window.__violations');
  assert.ok(violations.includes('script-src-elem'));
  assert.ok(violations.includes('script-src-attr'));
  assert.ok(violations.includes('connect-src'));
  console.log('PASS inline script, inline event handler, and network submission blocked by CSP');

  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: base });
  await new Promise(resolve => setTimeout(resolve, 500));
  const document = await send('DOM.getDocument');
  const forms = await send('DOM.querySelectorAll', { nodeId: document.root.nodeId, selector: 'form, textarea, input[type=email], input[type=tel]' });
  assert.equal(forms.nodeIds.length, 0);
  console.log('PASS no personal-data intake when JavaScript is disabled');
} finally {
  if (socket) socket.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
