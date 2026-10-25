import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Script, createContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { build, root, output, publicFiles, deployment, headers } from '../scripts/build.mjs';
import { createPreviewServer } from '../scripts/preview.mjs';

const read = file => readFile(resolve(root, file), 'utf8');

test('the browser boundary rejects submission without inspecting, storing, logging, or forwarding personal data', async () => {
  const removed = [];
  const records = new Map([['smartspro_leads_v1', 'legacy personal data'], ['unrelated', 'keep']]);
  const context = createContext({
    window: {},
    localStorage: { removeItem(key) { removed.push(key); records.delete(key); } },
    console: new Proxy({}, { get() { throw new Error('Unexpected logging'); } }),
    fetch() { throw new Error('Unexpected transmission'); }
  });
  new Script(await read('assets/js/api.js')).runInContext(context);
  const api = context.window.SmartsProBackend;
  const hostileInput = new Proxy({}, { get() { throw new Error('Personal data must not be read'); } });
  const result = await api.submitBooking(hostileInput, hostileInput);
  assert.equal(result.success, false);
  assert.equal(result.code, 'INTAKE_UNAVAILABLE');
  assert.equal(result.referenceCode, undefined);
  assert.equal(api.intakeAvailable, false);
  assert.equal(api.getLeads, undefined);
  assert.equal(api.exportLeadsCSV, undefined);
  assert.equal(api.config, undefined);
  assert.ok(Object.isFrozen(api));
  assert.deepEqual(removed, ['smartspro_leads_v1']);
  assert.deepEqual([...records], [['unrelated', 'keep']]);
});

test('unavailable browser storage never enables collection', async () => {
  const context = createContext({ window: {} });
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('Access denied'); } });
  new Script(await read('assets/js/api.js')).runInContext(context);
  assert.equal((await context.window.SmartsProBackend.submitBooking()).success, false);
});

test('security policy denies injection, framing, unneeded connections, and form posts', async () => {
  const csp = headers['Content-Security-Policy'];
  for (const directive of ["default-src 'none'", "script-src 'self'", "script-src-attr 'none'", "style-src 'self'", "style-src-attr 'none'", "connect-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", 'upgrade-insecure-requests']) {
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

test('public HTML has no personal-data forms, inline code, or external executable resources', async () => {
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
    assert.doesNotMatch(html, /(?:src|href)="(?:https?:)?\/\//i);
  }
});

test('browser scripts have no unsafe HTML sinks, credential signatures, network clients, or storage writes', async () => {
  for (const file of publicFiles.filter(file => file.endsWith('.js'))) {
    const source = await read(file);
    new Script(source, { filename: file });
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\.setItem\s*\(|indexedDB|document\.cookie/);
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

test('preview serves hardened assets, rejects writes and does not expose repository files', async () => {
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/', '/index.html', '/assets/js/api.js', '/assets/css/fonts.css']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.ok(response.headers.get('content-security-policy').includes("connect-src 'none'"));
      await response.arrayBuffer();
    }
    for (const path of ['/.env', '/.git/config', '/.vercel/project.json', '/package.json', '/README.md', '/security/public-files.json', '/scripts/build.mjs', '/_headers', '/api/bookings', '/admin', '/assets/../.env', '/%2e%2e%2f.env']) {
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
