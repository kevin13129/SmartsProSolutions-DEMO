import assert from 'node:assert/strict';
import { headers } from './build.mjs';

const base = new URL(process.argv[2] || 'https://invalid.example');
assert.ok(base.protocol === 'https:' && base.hostname !== 'invalid.example' && !base.username && !base.password && base.pathname === '/' && !base.search && !base.hash,
  'Usage: npm run security:verify -- https://your-deployed-host.example (origin only)');
let failures = 0;
for (const path of ['/', '/index.html', '/assets/js/api.js', '/.env', '/.git/config', '/.vercel/project.json', '/package.json', '/README.md', '/security/public-files.json', '/scripts/build.mjs', '/admin', '/api/bookings', '/missing-security-check']) {
  try {
    const response = await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const publicPath = ['/', '/index.html', '/assets/js/api.js'].includes(path);
    assert.equal(response.status, publicPath ? 200 : 404, `${path}: unexpected status ${response.status} (authentication/redirects require separate verification)`);
    for (const [key, expected] of Object.entries(headers)) {
      if (key === 'Cache-Control') continue; // CDNs can rewrite public cache directives.
      const value = response.headers.get(key);
      if (key === 'Strict-Transport-Security') {
        assert.ok(Number(value?.match(/max-age=(\d+)/)?.[1]) >= 31536000, `${path}: missing/short HSTS`);
      } else {
        assert.equal(value, expected, `${path}: missing/different ${key}`);
      }
    }
    await response.arrayBuffer();
    console.log('PASS', path);
  } catch (error) {
    failures++;
    console.error('FAIL', path, error.message);
  }
}
const httpUrl = new URL(base);
httpUrl.protocol = 'http:';
try {
  const response = await fetch(httpUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.ok([301, 302, 307, 308].includes(response.status), 'HTTP must redirect to HTTPS');
  const destination = new URL(response.headers.get('location'), httpUrl);
  assert.equal(destination.protocol, 'https:');
  assert.equal(destination.host, base.host);
  console.log('PASS HTTP redirects to HTTPS');
} catch (error) {
  failures++;
  console.error('FAIL HTTPS redirect:', error.message);
}
process.exitCode = failures ? 1 : 0;
