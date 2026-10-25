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
  const embeddedImages = [];
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
      if (message.method === 'Network.requestWillBeSent') {
        const url = message.params.request.url;
        // Native time controls render a browser-supplied data SVG clock icon.
        // This has no network destination; application data URLs remain banned.
        if (url.startsWith('data:image/svg+xml;base64,')) embeddedImages.push(message.params);
        else requests.push(url);
      }
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
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), null);
  assert.equal(await evaluate('document.querySelectorAll("input[type=radio]:checked").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll("select, option").length'), 0);
  assert.equal(await evaluate('document.querySelector("[data-required=serviceType]").classList.contains("needs-answer")'), true);
  assert.equal(await evaluate('document.querySelectorAll("#hero-reel .hero-reel-slide video").length'), 4);
  assert.equal(await evaluate('window.SmartsProReel.getCurrentIndex()'), 0);
  await evaluate('window.SmartsProReel.selectSlide(1)');
  assert.equal(await evaluate('window.SmartsProReel.getCurrentIndex()'), 1);
  assert.match(await evaluate('document.getElementById("hero-reel-title").textContent'), /Bathrooms, Glass/i);
  await evaluate('window.SmartsProReel.togglePause(true)');
  assert.equal(await evaluate('document.getElementById("hero-reel-toggle").getAttribute("aria-pressed")'), 'true');
  await evaluate('window.SmartsProReel.togglePause(false)');
  assert.equal(await evaluate('document.getElementById("hero-reel-toggle").getAttribute("aria-pressed")'), 'false');
  await evaluate('window.SmartsProReel.selectSlide(0)');
  const choose = async (id, value) => evaluate(`(() => { const field = document.getElementById(${JSON.stringify(id)}); const radio = field.querySelector('input[type=radio][value=' + JSON.stringify(${JSON.stringify(value)}) + ']'); if (radio) radio.click(); else { field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('change', {bubbles:true})); } })()`);
  const click = async selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await click('input[name=service_type][value=residential]');
  assert.equal(await evaluate('document.querySelector("[data-required=serviceType]").classList.contains("needs-answer")'), false);
  assert.equal(await evaluate('document.getElementById("pets").classList.contains("needs-answer")'), true);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("pets")).borderTopColor'), 'rgb(220, 38, 38)');
  assert.notEqual(await evaluate('getComputedStyle(document.getElementById("pets")).boxShadow'), 'none');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#pets .scope-answer span")].map(el => el.textContent)'), ['No', 'Yes']);
  assert.equal(await evaluate('document.querySelectorAll("input[name=frequency_choice]:checked").length'), 0);
  await choose('cleaningLevel', 'standard');
  await choose('condition', 'routine');
  assert.equal(await evaluate('document.getElementById("condition").classList.contains("needs-answer")'), false);
  assert.equal(await evaluate('document.getElementById("pets").getAttribute("aria-invalid")'), 'true');
  await send('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await evaluate('document.getElementById("pets").scrollIntoView({behavior:"instant", block:"center"}); new Promise(resolve => setTimeout(resolve, 300))');
  const missingChoiceCapture = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
  await writeFile(resolve(artifacts, 'missing-pets-mobile.png'), Buffer.from(missingChoiceCapture.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', {width:1440, height:1000, deviceScaleFactor:1, mobile:false});
  await choose('pets', 'none');
  assert.equal(await evaluate('document.getElementById("pets").classList.contains("needs-answer")'), false);
  assert.equal(await evaluate('document.getElementById("pets-prompt").hidden'), true);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), null);
  await click('input[name=frequency_choice][value=biweekly]');
  assert.equal(await evaluate('document.querySelectorAll(".needs-answer").length'), 0);
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 153);
  assert.match(await evaluate('document.getElementById("summary-rows").textContent'), /4.50 hours/);
  assert.doesNotMatch(await evaluate('document.getElementById("summary-rows").textContent'), /40\.00\/hour/);
  await choose('pets', 'present');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.pets'), 'present');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 153);
  await choose('pets', 'none');
  assert.equal(await evaluate('localStorage.getItem("smartspro_leads_v1")'), null);
  assert.equal(await evaluate('localStorage.getItem("unrelated")'), 'keep');
  assert.equal(await evaluate('document.querySelectorAll("form, textarea, input[type=email], input[type=tel]").length'), 0);
  assert.equal(await evaluate('(async () => (await SmartsProBackend.submitBooking({name:"test"}, {})).success)()'), false);
  assert.equal(await evaluate('typeof SmartsProBackend.getLeads'), 'undefined');
  assert.equal(await evaluate('typeof SmartsProModal.openLeadsViewer'), 'undefined');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", {key:"L", shiftKey:true}))');
  assert.equal(await evaluate('document.querySelectorAll(".modal-overlay.open").length'), 0);
  await evaluate('document.getElementById("btn-bed-plus").click()');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 161.5);
  await click('#btn-fridgeSingle-plus');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 226.50);
  assert.equal(await evaluate('document.getElementById("summary-addons").open'), true);
  await click('#btn-oven-plus');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 306.5);
  assert.equal(await evaluate('document.getElementById("summary-addons").open'), false);
  await click('#summary-addons-heading');
  assert.equal(await evaluate('document.getElementById("summary-addon-list").children.length'), 2);
  assert.match(await evaluate('document.getElementById("summary-addon-list").textContent'), /Single refrigerator.*65.00.*Inside oven.*80.00/);
  await click('#btn-fridgeSingle-plus');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 371.5);
  assert.match(await evaluate('document.getElementById("summary-addon-list").textContent'), /2 × Single refrigerator.*130.00/);
  await click('#btn-fridgeSingle-minus');
  await click('#btn-oven-minus');
  assert.equal(await evaluate('document.getElementById("summary-addons").open'), true);
  for (const [input, expected] of [['-100', 400], ['999999', 6000], ['', 400], ['1800', 1800]]) {
    await choose('input-sqft', input);
    assert.equal(await evaluate('window.SmartsProCurrentQuote.state.sqft'), expected);
  }
  await evaluate('document.getElementById("btn-book-quote-now").click()');
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), true);
  assert.equal(await evaluate('document.getElementById("modal-recap-total").textContent'), '$226.50');
  assert.equal(await evaluate('document.activeElement.id'), 'modal-close-btn', await evaluate(`JSON.stringify({ active: document.activeElement.outerHTML.slice(0, 150), modalVisibility: getComputedStyle(document.getElementById('booking-modal-overlay')).visibility, buttonVisibility: getComputedStyle(document.getElementById('modal-close-btn')).visibility, rect: document.getElementById('modal-close-btn').getBoundingClientRect().toJSON() })`));
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape"}))');
  assert.equal(await evaluate('document.getElementById("booking-modal-overlay").classList.contains("open")'), false);

  await click('input[name=frequency_choice][value=monthly]');
  assert.equal(await evaluate('document.getElementById("quote-billing-freq").textContent'), 'Monthly');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), 236);
  await choose('condition', 'heavy');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), null);
  assert.equal(await evaluate('document.getElementById("quote-total-amount").textContent'), 'Assessment needed');
  await choose('condition', 'routine');
  await click('#btn-oven-plus');
  await evaluate(`Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => {window.__copied = text;}}})`);
  await click('#btn-share-quote');
  assert.equal(await evaluate('window.__copied'), await evaluate('window.SmartsProCurrentQuote.summary.text'));
  assert.equal(await evaluate('document.getElementById("estimate-print-summary").textContent'), await evaluate('window.__copied'));
  await send('Emulation.setEmulatedMedia', {media: 'print'});
  assert.equal(await evaluate('getComputedStyle(document.getElementById("estimate-print-summary")).display'), 'block');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".calc-grid")).display'), 'none');
  await send('Emulation.setEmulatedMedia', {media: ''});

  for (const family of ['commercial', 'airbnb']) {
    await click(`input[name=service_type][value=${family}]`);
    assert.equal(await evaluate('document.querySelectorAll("input[name=frequency_choice]:checked").length'), 0);
    assert.deepEqual(await evaluate('window.SmartsProCurrentQuote.selection.addons'), []);
    assert.equal(await evaluate('document.getElementById("summary-addons").hidden'), true);
    assert.equal(await evaluate('document.getElementById("btn-fridgeSingle-plus")'), null);
    if (family === 'commercial') {
      await choose('buildingUse', 'retail');
      await choose('restrooms', '3');
      await choose('walkthrough', 'afternoon');
      await click('input[name=floor_type][value=tile]');
      await click('input[name=floor_type][value=vinyl]');
      await click('input[name=frequency_choice][value=monthly]');
      await click('#btn-interiorGlass-plus');
      await click('#btn-floorDetail-plus');
      assert.equal(await evaluate('window.SmartsProCurrentQuote.selection.property.bedrooms'), undefined);
      assert.deepEqual(await evaluate('window.SmartsProCurrentQuote.selection.requirements.floors'), ['tile', 'vinyl']);
    } else {
      await choose('beds', '4');
      await choose('laundry', 'onsite');
      await choose('restocking', 'supplied');
      await choose('checkout', '11:00');
      await choose('checkin', '15:00');
      await click('input[name=frequency_choice][value=turnover]');
      await click('#btn-fridgeInterior-plus');
      await click('#btn-dishes-plus');
      assert.equal(await evaluate('window.SmartsProCurrentQuote.selection.requirements.beds'), 4);
      assert.equal(await evaluate('window.SmartsProCurrentQuote.selection.requirements.checkin'), '15:00');
    }
    assert.equal(await evaluate('window.SmartsProCurrentQuote.calculation.grandTotal'), null);
    assert.deepEqual(await evaluate('window.SmartsProCurrentQuote.calculation.missing'), []);
    assert.equal(await evaluate('document.getElementById("summary-addons").open'), false);
    await click('#btn-book-quote-now');
    assert.equal(await evaluate('document.getElementById("modal-recap-total").textContent'), family === 'commercial' ? 'Walkthrough first' : 'Assessment first');
    assert.equal(await evaluate('document.getElementById("modal-recap-addons").children.length'), 2);
    assert.match(await evaluate('document.getElementById("modal-recap-addons").textContent'), /Price after assessment/);
    await evaluate('SmartsProModal.closeBookingModal()');
  }
  await click('input[name=service_type][value=residential]');
  assert.equal(await evaluate('window.SmartsProCurrentQuote.state.frequency'), '');
  await click('input[name=frequency_choice][value=monthly]');
  await click('#btn-fridgeSingle-plus');
  await click('#btn-oven-plus');

  for (const [width, height] of [[1440, 1000], [1024, 900], [768, 900], [320, 760], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await evaluate('window.scrollTo({top:0, behavior:"instant"})');
    // Let responsive font/spacing transitions finish before measuring layout.
    await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
    assert.equal(await evaluate(`(() => { const amount = document.getElementById('quote-total-amount'); return amount.getBoundingClientRect().height <= parseFloat(getComputedStyle(amount).fontSize) * 1.4; })()`), true, 'Money amount must remain on one line');
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth && window.innerWidth === ${width}`), true, await evaluate(`JSON.stringify({width: innerWidth, clientWidth: document.documentElement.clientWidth, overflow: [...document.querySelectorAll('body *')].filter(el => !el.closest('.checklist-table-wrapper')).map(el => ({tag: el.tagName, id: el.id, classes: el.className, right: el.getBoundingClientRect().right})).filter(el => el.right > document.documentElement.clientWidth + 1).sort((a,b) => b.right-a.right).slice(0,20)})`));
    if (width <= 1100) {
      await click('#mobile-nav-toggle');
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".nav-links")).display'), 'flex');
      assert.equal(await evaluate('document.getElementById("mobile-nav-toggle").getAttribute("aria-expanded")'), 'true');
      await click('.nav-link');
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".nav-links")).display'), 'none');
      assert.equal(await evaluate('document.getElementById("mobile-nav-toggle").getAttribute("aria-expanded")'), 'false');
      await evaluate('window.scrollTo({top:0, behavior:"instant"})');
    }
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(artifacts, `home-${width}.png`), Buffer.from(capture.data, 'base64'));
    for (const [label, selector] of [['scope', '#step-2-title'], ['quote', '.quote-summary-card']]) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant', block:'start'})`);
      await evaluate('new Promise(resolve => setTimeout(resolve, 150))');
      const screenshot = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
      await writeFile(resolve(artifacts, `${label}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await evaluate('window.scrollTo({top:0, behavior:"instant"})');
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
  assert.deepEqual(exceptions, [], 'Interactions triggered runtime errors');
  assert.ok(responses.filter(response => response.url.startsWith(base)).every(response => response.status === 200), 'A page asset failed to load');
  assert.ok(requests.every(url => url.startsWith(base)), 'Unexpected third-party network request: ' + JSON.stringify(requests.filter(url => !url.startsWith(base))));
  assert.ok(embeddedImages.every(request => request.type === 'Image' && request.initiator.type === 'other'), 'Only native-control embedded images are expected');
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
