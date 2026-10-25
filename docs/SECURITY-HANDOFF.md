# Security handoff: read this first

Last updated: **2026-10-23**. This is the quick entry point for future models and
developers. Detailed controls live in the linked baseline and roadmap; keep
those documents authoritative rather than duplicating their full requirements.

## Current state in one minute

- The owner requested security foundations before customer-facing customization.
- The app is a static cleaning-service website with a working estimate calculator,
  estimate recap, print/copy options, and phone contact.
- Residential rates remain provisional, awaiting one owner's approval. Service
  and frequency start empty. Commercial/Airbnb produce assessment scope summaries,
  not residential formula prices. Selections remain in memory only.
- The user requested hourly residential estimates: $40 standard and $50 deep;
  move-in/out uses $50 with extra time. The current assumption is one crew rate.
  Time allowances and billing basis are documented in [PRICING-NOTES.md](PRICING-NOTES.md).
  All add-on prices, recurring adjustments and the $110 minimum are preserved.
  Required scope questions use explicit radio answers and a red glow/text prompt
  while unanswered. Pets uses Yes/No; no selectable placeholder options remain.
- There is **no working intake API, customer database, authentication, or payment
  integration**. Online collection is intentionally unavailable. This is a
  security boundary, not an accidentally unfinished form handler.
- Security changes are implemented and tested locally. **They have not been
  deployed or verified on a live hostname in this work.** Hosting/account
  configuration is still pending.
- At this handoff, the changes remain in the working tree, including untracked
  new files. No commit or push was performed. Check current Git state before
  continuing; do not discard the earlier implementation.
- [Project scope](PROJECT-SCOPE.md), [implementation framework](IMPLEMENTATION-FRAMEWORK.md),
  [owner approval reminders](OWNER-APPROVAL-REMINDERS.md) and
  [acceptance/handover](ACCEPTANCE-HANDOVER.md) record the proposed $400 package,
  separate custom work, approval decisions and future operations. Accounts,
  budget, policies, supported claims, support terms and final approval are pending.

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake | `index.html` no longer collects contact/address/access-code data or shows fake success. It offers phone contact and an estimate recap. |
| Legacy API | `assets/js/api.js` removes only `smartspro_leads_v1` without reading/logging its contents; legacy submission calls return `success: false` and `INTAKE_UNAVAILABLE`. No backend mode switch remains. |
| Lead exposure | Removed the unauthenticated viewer, Shift+L shortcut, CSV export, unsafe HTML rendering, payload logging and customer-data events. The old store was per browser, not a central database. |
| Estimate authority | `estimate-model.js` supplies provisional residential pricing, service-specific scope and one summary for screen/recap/copy/print. `calculator.js` maintains bounded controls. `SmartsProCurrentQuote.selection` is an untrusted, memory-only future request snapshot with no client totals. No request adapter is enabled. |
| Browser protection | `vercel.json` defines CSP (`script-src 'self'`, `style-src 'self'`, `img-src 'self'`, `media-src 'self'`, `font-src 'self'`) and other response headers. `index.html` and `404.html` include matching CSP fallbacks. Network submissions, inline code/styles and framing are denied for the current static design. |
| Public files | `security/public-files.json` is an explicit publish allowlist (27 files, including local `.jpg` photography and `.webm` slow-motion hero clips). `scripts/build.mjs` generates `dist/` and rejects unsafe paths/symlinks. `.gitignore` and `.vercelignore` exclude common sensitive/local artifacts. |
| Assets | Fonts are local under `assets/fonts/`, with licenses and recorded hashes. Inline styles moved to `assets/css/security.css`; no third-party browser resources are required. |
| Claims and branding | Unsupported screening, health/safety, history, inspection and industrial statements removed. Old claim-bearing PNGs remain as source assets but are excluded from the public manifest. A text wordmark and reviewed static `brand-mark.svg` replace the displayed branding; the build allows only that exact SVG path. Final owner design approval is pending. |
| Tooling | Node 24; no npm dependencies. `scripts/preview.mjs` serves only the built public files on loopback with development security headers. |
| Regression checks | `tests/security.test.mjs` checks privacy boundaries, policy consistency, assets and output isolation. `scripts/browser-check.mjs` tests real-browser behavior and CSP rejection. |
| CI and maintenance | `.github/workflows/security.yml` uses pinned actions and read-only permissions. `.github/dependabot.yml` tracks action/dependency updates. These files still need to be pushed; branch rules are separate account settings. |
| Deployment | Vercel configuration is present and the local project was already linked. Netlify configuration is also provided. `scripts/verify-deployment.mjs` checks a supplied live origin after deployment. |

Legacy storage cleanup requires a returning visitor to load the new version with
JavaScript/storage available on the same origin. It does not erase old exports,
other origins, or obsolete deployments. Do not remove cleanup simply because the
new UI no longer saves leads.

## Verification record

2026-10-25 Anti-AI design audit & 30-point checklist implementation:

- Evaluated website against the 30-point anti-AI design checklist (Colors, Typography,
  Layout, Copy & Microcopy, Images & Icons, and UX & Interaction).
- Eliminated all AI design clichés: removed gradient texts/buttons/backgrounds in favor of
  solid, restrained brand colors (Navy #0C2340 and Emerald Green #2E7D32); replaced fuzzy
  multi-layered box-shadows with crisp 1px borders; removed all emoji icons (✨, ⚡, 🏠, 📦,
  🔑, 🏢, 📞, ✉️, 📍, 🕒) replacing footer items with clean inline SVGs; converted centered
  cookie-cutter section headers into confident left-aligned editorial hierarchy with
  tightened letter-spacing (-0.025em on headings); removed floating star overlay badges;
  and replaced abstract buzzwords ("Comprehensive Solutions", "The Smarts Pro Difference")
  with concrete, authentic service descriptions.
- `npm run build`: passed all **14** automated unit, pricing, and security boundary tests
  and generated the explicit **27-file** public build in `dist/` (plus `_headers`).
- `npm run test:browser`: passed all headless Chrome CDP checks across all 5 responsive
  viewports (`1440px`, `1024px`, `768px`, `390px`, `320px`), verifying calculator state,
  modal recap, video reel, mobile nav, required red choices, CSP enforcement, and zero
  horizontal overflow.
- `git diff --check`: passed. Changes remain uncommitted in the local working tree and have
  not been deployed or live-verified on a production host.

2026-10-23 UI, slow-motion hero reel, customer funnel, and security posture verification:

- `npm run build`: passed **14** automated security and estimator tests and
  generated the explicit **27-file** public build in `dist/` (plus `_headers`),
  including `media-src 'self'` CSP parity, 3 new local cleaning action `.jpg`
  images, and 4 local slow-motion `.webm` hero videos.
- `npm run test:browser`: passed all real-browser checks across the five viewport
  widths (`1440px`, `1024px`, `768px`, `390px`, `320px`), including the 4-scene
  crossfading slow-motion hero reel (`SmartsProReel`), 1-tap quick-start service
  funnel chips (`SmartsProQuickSelect`), space size presets, calculator funnel
  progress bar, sticky mobile quote dock, modal recap copy action, required-choice
  red highlights/accessible state, local fonts, legacy storage cleanup,
  unavailable intake, CSP blocking of inline scripts/event handlers/network posts,
  and no-JavaScript behavior.
- Added future-iteration and payment implementation notes in
  [IMPLEMENTATION-FRAMEWORK.md](IMPLEMENTATION-FRAMEWORK.md) and a standalone
  [owner approval checklist](OWNER-APPROVAL-REMINDERS.md).
- `git diff --check` passed. Changes remain uncommitted in the local working
  tree and have not been deployed or live-verified on a production host.

2026-10-22 hourly pricing and required-answer follow-up:

- `npm run build`: passed **14** tests, including standard/deep/move-in-out
  hourly calculations, size/room time changes, unchanged extras, minimum,
  rounding, explicit choices and existing security boundaries.
- `npm run test:browser`: passed at the existing five viewport widths. Verified
  red missing-answer borders/glow and accessible state, Yes/No pets, no dropdown
  placeholders, clearing answered highlights, displayed hours/rate and unchanged
  assessment routes. CSP, disabled intake and no-JavaScript checks still pass.
- Reviewed missing-pets and quote screenshots on mobile. Responsive layout checks
  wait for font/spacing transitions to finish before measuring widths.
- Rebuilt preview verified at `http://127.0.0.1:3000/` (HTTP 200, new hourly labels
  and explicit answer controls). This is local verification, not a deployment.
- Final local documentation links and `git diff --check` passed. No provider,
  account, intake, payment, or production configuration changed.

2026-10-21–22 groundwork checks (final run 2026-10-22):

- `npm run build`: passed **13** automated security/estimator tests and generated
  the explicit **20-file** public build (plus generated `_headers`).
- Initial browser run caught mobile wordmark/commercial overflow, corrected in
  source. A subsequent browser run passed service-specific inputs, add-on
  itemization/collapse/reset, price consistency, copy/print/recap, legacy cleanup,
  unavailable intake, CSP injection/network rejection and no-JavaScript behavior.
- Chrome's native time input uses an embedded clock SVG. Browser tests distinguish
  browser-initiated embedded images from actual network destinations; application
  data URLs remain prohibited by source tests and CSP. No CSP was broadened.
- Final `npm run test:browser`: passed at 320, 390, 768, 1024 and 1440px widths,
  including mobile navigation open/close state. Narrow-phone content-grid,
  square-footage control and teaser overflow were corrected before this run.
- Desktop/mobile screenshots inspected. All **29** local documentation links
  resolve. `git diff --check` passed after the final changes.
- No deployment, account configuration, request delivery, owner job rehearsal,
  payment, live verification, or owner approval was performed.

Results from the security implementation on 2026-10-19:

- `npm run build`: passed all **8** automated tests and generated the approved
  public build.
- `npm run test:browser`: passed in local Chrome, including calculator/recap
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
