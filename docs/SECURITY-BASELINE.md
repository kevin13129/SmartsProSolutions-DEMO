# Security foundation — 2026-10-19

## Scope and current status

Reviewed the repository's HTML, JavaScript, CSS, tracked files, and local Vercel
project link. This is a static site with a calculator and a previously simulated
booking/contact flow. No working backend, authentication, database, or payment
processor was present. No production service was deployed or changed as part of
this work. Hosting, DNS, account access, existing deployments, and repository
settings still require the checks below. This is a source review and regression
baseline, not a penetration-test certificate or a guarantee against compromise.

## Findings addressed

| Previous behavior | Risk | Current behavior |
| --- | --- | --- |
| Bookings saved name, phone, email, address, scheduling and notes in localStorage | Persistent personal data accessible to scripts and other users of that browser profile | No intake fields or persistence; only the old `smartspro_leads_v1` key is removed on load |
| Lead viewer rendered customer strings with `innerHTML` | Stored script/markup injection in the demo viewer | Viewer, shortcut, raw HTML sinks, and public lead-reading functions removed |
| Unauthenticated demo CSV export | Exposed local records and spreadsheet formula injection | Export removed; future exports need authorized access and safe CSV handling |
| Booking/contact flows reported success without durable delivery | Visitors could believe a request was received when it was not | Clear phone contact; legacy submit calls explicitly return `success: false` |
| Browser-ready webhook/database configuration and payload logging/events | Future accidental key exposure, unauthorized writes, or PII disclosure | Integration switches, forwarding, payload logging and lead events removed |
| Browser totals treated as a locked quote | Altered client values could later become fraudulent charges/discounts | Quotes explicitly estimates; no payment/booking authority in browser values |
| No deployment policy or public output boundary | Browser injection/embedding and accidental file publication | Strict headers, external styles/scripts, and manifest-only `dist/` build |
| Google-hosted font requests | Unnecessary third-party requests and remote asset dependency | Three font families served locally, with licenses and SHA-256 provenance |

The old viewer used each visitor's browser storage; this was not evidence of a
central customer database being publicly readable. Cleanup only occurs when a
visitor loads the new release, with JavaScript and storage available, on the same
origin. It cannot erase old exports, copied records, other origins, or browsers
that never return. If real customer data was used in the demo, review those
copies separately. Existing historical deployment URLs must also be retired or
access-protected through the host.

## Browser and deployment controls

`vercel.json` is the canonical HTTP header policy. The build emits equivalent
Netlify/Cloudflare Pages `_headers`. HTML includes a matching CSP fallback for
hosts without response-header support, but **frame-ancestors and HSTS require
real response headers**. Do not treat the HTML meta tag as full protection.

- Only same-origin scripts, CSS, images, and fonts load. Inline scripts, inline
  event handlers, inline style attributes, plugins, frames, workers, and base URL
  changes are denied. `connect-src 'none'` and `form-action 'none'` reflect the
  fact that the preview has no intake service. CSP is an additional layer;
  `textContent` and eliminating unsafe sinks are still necessary.
- Framing is denied with CSP and `X-Frame-Options`; MIME sniffing is disabled.
  Cross-origin resource/opener policies reduce unwanted embedding and window
  interactions. Review opener behavior when adding an external login flow.
- Referrers and DNS prefetching are disabled. Unused device permissions and the
  Payment Request API are denied. User-initiated clipboard copying is allowed.
- Production HTTPS gets a one-year HSTS policy and mixed-content upgrading.
  `includeSubDomains` and preload are deliberately deferred until ownership and
  HTTPS readiness of all relevant subdomains are verified.
- Static responses revalidate rather than indefinitely caching unversioned
  application code. Future personal-data APIs must use `Cache-Control: no-store`
  and must not use shared CDN caches.
- `security/public-files.json` enumerates every public file. The build excludes
  repository metadata, local Vercel settings, docs, tests, environment files and
  future unreviewed assets. It rejects symlinks and unsafe output paths.
- There are no npm runtime or development dependencies. Node 24 runs build and
  test tooling. GitHub Actions are pinned to full verified release hashes, have
  read-only repository permissions, and do not persist checkout credentials.
  Dependabot configuration tracks future npm dependencies and action updates.

CSP is not a firewall or an authentication mechanism. A non-browser client can
send arbitrary requests; there is currently no backend operation for those
requests to invoke. Future APIs need independent server-side controls.

## Run and verify

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run test:browser
npm run preview
```

Use `http://127.0.0.1:3000`. The loopback-only preview serves the approved build
with security headers, except production-only HSTS and mixed-content upgrading.
Do not serve the repository root using a generic file server. Browser checks
require installed Chrome/Chromium/Edge; `CHROME_PATH` can specify its executable.
They use an isolated profile and save local screenshots under ignored
`.security-preview/`. No live customer or payment systems are contacted.

Automated checks exercise fail-closed intake, cleanup without reading/logging
personal data, unavailable storage, unsafe browser patterns, CSP consistency,
font provenance, output isolation, private-path 404s, and rejected HTTP writes.
The browser suite checks calculator interactions, responsive layout, modal
behavior, asset loading without external requests, actual CSP rejection of
injected scripts/handlers and network submissions, and the no-JavaScript state.
These checks are regression tests, not a comprehensive secret scanner or DAST.

After deploying to a chosen HTTPS origin, run:

```sh
npm run security:verify -- https://YOUR-DEPLOYED-HOST
```

This sends read-only requests for public assets and common private paths,
checks HTTPS redirection and headers, and fails on unexpected redirects or
authentication. Run it against the final canonical hostname. An access-protected
preview may require authenticated manual verification; a failed probe must not
be reported as a successful production check. Confirm 404s and headers in the
host itself, since local preview behavior cannot prove a CDN's configuration.

## Hosting and account checklist — not configured by source changes

Before the next public release, the deployment owner must:

- Deploy the reviewed revision using the checked-in build command and `dist`
  output. On Vercel, check the existing project's dashboard overrides. On
  Netlify, use `netlify.toml`. Root-directory publishing and plain GitHub Pages
  do not implement this full header policy.
- Verify certificates, HTTP-to-HTTPS redirect, headers on both successful and
  error responses, and canonical/custom-domain aliases. Protect preview
  deployments and remove public access to superseded unsafe demo deployments.
- Require MFA/passkeys for GitHub, Vercel/hosting, DNS registrar, business email,
  future database and payment accounts. Use individual least-privilege accounts,
  review collaborators/tokens, and store recovery codes in a password manager.
- Protect the deployment branch with review and the `Build and security checks`
  required status. Restrict production deploy permissions. Enable available
  secret scanning/push protection, private vulnerability reporting, and scan
  repository history with a dedicated scanner before introducing secrets.
- Review host-managed DDoS/firewall protections, create appropriate abuse rules,
  and configure traffic/error/cost alerts with an owner and spending controls.
  Static hosting still has availability and cost risks. API limits must be
  established before intake, not left as a later operational task.
- Keep registrar lock/renewal and domain contact details current. Review dangling
  DNS entries. When sending transactional email, configure the selected provider's
  SPF/DKIM/DMARC and a monitored reply address.
- Record who owns releases, incident response and security reports. Monitor the
  workflow after it is pushed; creating its file does not enable branch rules.

## Operations and incident response

Review dependency/action alerts and workflow failures weekly, access and token
permissions quarterly, and these assumptions whenever a new service or data
field is added. Apply critical patches promptly and test the affected paths.
Maintain separate test and production service projects and credentials.

If compromise or data exposure is suspected: disable the affected feature at
the host, preserve restricted logs and the deployed version, revoke exposed
credentials/sessions, investigate scope, patch and verify in a protected
environment, then restore service. Coordinate any customer/regulatory notices
with the responsible business owner based on confirmed facts. Deleting a key
from source is not revocation. After databases exist, schedule encrypted backups,
restrict backup access, and test restoration and deletion/retention behavior.

## References used

- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel security overview](https://vercel.com/docs/security)
