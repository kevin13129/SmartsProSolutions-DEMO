# Security handoff: read this first

Last updated: **2026-10-25**. This is the quick entry point for future models and
developers. Detailed controls live in the linked baseline and roadmap; keep
those documents authoritative rather than duplicating their full requirements.

## Current state in one minute

- The owner requested security foundations before customer-facing customization.
- The app is a static cleaning-service website with a working estimate calculator,
  estimate recap, print/copy options, and phone contact.
- There is **no working intake API, customer database, authentication, or payment
  integration**. Online collection is intentionally unavailable. This is a
  security boundary, not an accidentally unfinished form handler.
- Security changes are implemented and tested locally. **They have not been
  deployed or verified on a live hostname in this work.** Hosting/account
  configuration is still pending.
- At this handoff, the changes remain in the working tree, including untracked
  new files. No commit or push was performed. Check current Git state before
  continuing; do not discard the earlier implementation.

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake | `index.html` no longer collects contact/address/access-code data or shows fake success. It offers phone contact and an estimate recap. |
| Widescreen hero | `index.html`, `assets/css/styles.css`, and `assets/js/main.js` implement a full-bleed widescreen hero slideshow using existing approved local assets (`hero-home.jpg`, `sparkle-kitchen.jpg`, `commercial-office.jpg`), CSS classes, and `textContent` updates without inline styles, inline handlers, or unsafe DOM sinks. |
| Legacy API | `assets/js/api.js` removes only `smartspro_leads_v1` without reading/logging its contents; legacy submission calls return `success: false` and `INTAKE_UNAVAILABLE`. No backend mode switch remains. |
| Lead exposure | Removed the unauthenticated viewer, Shift+L shortcut, CSV export, unsafe HTML rendering, payload logging and customer-data events. The old store was per browser, not a central database. |
| Estimate authority | `assets/js/calculator.js` maintains bounded inputs and display estimates. Its totals are not approved prices or booking/payment evidence. `booking-modal.js` only renders a text-based recap. |
| Browser protection | `vercel.json` defines CSP and other response headers. `index.html` and `404.html` include matching CSP fallbacks. Network submissions, inline code/styles and framing are denied for the current static design. |
| Public files | `security/public-files.json` is an explicit publish allowlist. `scripts/build.mjs` generates `dist/` and rejects unsafe paths/symlinks. `.gitignore` and `.vercelignore` exclude common sensitive/local artifacts. |
| Assets | Fonts are local under `assets/fonts/`, with licenses and recorded hashes. Inline styles moved to `assets/css/security.css`; no third-party browser resources are required. |
| Tooling | Node 24; no npm dependencies. `scripts/preview.mjs` serves only the built public files on loopback with development security headers. |
| Regression checks | `tests/security.test.mjs` checks privacy boundaries, policy consistency, assets and output isolation. `scripts/browser-check.mjs` tests real-browser behavior and CSP rejection. |
| CI and maintenance | `.github/workflows/security.yml` uses pinned actions and read-only permissions. `.github/dependabot.yml` tracks action/dependency updates. These files still need to be pushed; branch rules are separate account settings. |
| Deployment | Vercel configuration is present and the local project was already linked. Netlify configuration is also provided. `scripts/verify-deployment.mjs` checks a supplied live origin after deployment. |

Legacy storage cleanup requires a returning visitor to load the new version with
JavaScript/storage available on the same origin. It does not erase old exports,
other origins, or obsolete deployments. Do not remove cleanup simply because the
new UI no longer saves leads.

## Verification record

Results from the widescreen hero update on 2026-10-25 (and baseline security implementation on 2026-10-19):

- `npm run build`: passed all **8** automated security tests on 2026-10-25 and generated the approved
  public build in `dist/`. Temporary session preview adjustments in `scripts/preview.mjs` were reverted prior to handoff.
- `npm run test:browser`: passed in local Chrome on 2026-10-19, including calculator/recap
  interaction, local fonts, legacy cleanup, disabled intake, mobile layout,
  blocked injected scripts/event handlers/network submissions, and no-JavaScript
  collection behavior.
- Desktop and mobile screenshots were inspected. Modal focus timing and mobile
  overflow found during verification were corrected.
- `git diff --check`: passed at the end of implementation.
- Not performed: live deployment/header verification, hosting/firewall/account
  setup, GitHub-hosted workflow execution, independent penetration testing, or
  comprehensive historical secret scanning.

These are historical results, not proof that a later revision passes. Screenshots
and isolated browser profiles are local, ignored artifacts in `.security-preview/`;
they may not exist in another checkout. Do not rely on temporary scripts there.

## Commands for the next implementation

Use Node 24 and run from the repository root. On Windows PowerShell, use `npm.cmd`
if execution policy prevents invoking `npm.ps1`.

```sh
git status --short
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run test:browser
npm run preview
```

Preview: `http://127.0.0.1:3000`. Rebuild after source changes. Browser tests use
installed Chrome/Chromium/Edge, optionally specified by `CHROME_PATH`; they must
not silently skip. This environment required permission to run headless Chrome
outside the sandbox after the sandboxed browser stalled. Follow the current
environment's permissions if that happens again.

After a deployment, verify its actual canonical HTTPS origin:

```sh
npm run security:verify -- https://YOUR-DEPLOYED-HOST
```

Do not infer a deployment URL from the project name or report local header checks
as live verification. Do not treat an access-protected preview's redirect as a
passing public-site check.

## Implementation order and completion criteria

| Next stage | Work required before marking it complete |
| --- | --- |
| Activate the existing static baseline | Review/commit all intended files, use `dist/` deployment settings, deploy within the current authorized scope, and verify the final origin. Complete the [hosting/account checklist](SECURITY-BASELINE.md#hosting-and-account-checklist--not-configured-by-source-changes): MFA, access controls, firewall/cost alerts, protected branches/previews, and old deployment cleanup. Record evidence. |
| Add customer inquiries/bookings | Select services and business privacy/retention rules. Implement the [intake requirements](SECURITY-ROADMAP.md#1-customer-inquiries-and-booking-requests): same-origin server API, validation, durable persistence, abuse limits, reliable delivery and negative tests. Only then restore real collection with truthful status messages. |
| Add database/staff/customer access | Implement [authorization and data controls](SECURITY-ROADMAP.md#2-database-and-staffcustomer-access), including per-record permissions, secure sessions, private storage, auditing and restore tests. Test anonymous and cross-customer access failures. |
| Add payments | Implement [payment requirements](SECURITY-ROADMAP.md#3-payments-and-recurring-charges): hosted checkout, server-authoritative amounts, signed webhooks, durable deduplication and verified state transitions. Pass tampering/replay/failure tests before live money. |

Stripe and Supabase are documented candidates, **not selected or configured
services**. No credentials are needed for the current preview. Ask for missing
business/provider choices only when the next authorized task depends on them;
routine security maintenance and UI changes do not need those decisions.

## Keep this handoff current

After security-relevant changes, update the date, changed boundaries, actual
validation results, and remaining work. For deployments, record the revision,
hostname, verification date/result and unresolved host settings. Do not record
credentials, customer data, or sensitive account recovery information here.

Read [SECURITY-BASELINE.md](SECURITY-BASELINE.md) for findings, control details,
hosting requirements and incident response; [SECURITY-ROADMAP.md](SECURITY-ROADMAP.md)
for future feature requirements; and [../SECURITY.md](../SECURITY.md) for reporting.
