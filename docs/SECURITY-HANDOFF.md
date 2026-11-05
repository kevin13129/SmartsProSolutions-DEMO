# Security handoff: read this first

Last updated: **2026-11-04**. This is the quick entry point for future models and
developers. Detailed controls live in the linked baseline and roadmap; keep
those documents authoritative rather than duplicating their full requirements.

## Current state in one minute

- The owner requested security foundations before customer-facing customization.
- Business pricing, intake & scheduling terms confirmed by the owner on 2026-11-04:
  - **No Online Payments**: The business is **not** collecting online payments, deposits, or card details on the website (`onlinePaymentEnabled: false`).
  - **Flat-Rate Pricing**: All cleaning frequencies (`weekly`, `biweekly`, `monthly`, `turnover`, `onetime`) calculate at a flat rate per visit (`0%` recurring discount).
  - **Automated Estimate Email & Calendar Appointment Setting**: When a customer completes their estimate, they pick an open **Monday – Friday (8:00 AM – 5:30 PM)** cleaning date & arrival window (`8:00 AM – 11:00 AM`, `11:30 AM – 2:30 PM`, or `2:30 PM – 5:30 PM`) with automatic leap-year and US holiday exclusions, and enter their **First Name**, **Last Name**, **Phone Number**, **Email Address**, and **Additional Notes**.
  - **Flat $35 Pet Fee (Step 3 Only)**: Selecting **"Yes, we have pets"** in Step 3 (*Additional Information*) automatically adds a flat `$35` Pet Hair & Detailing fee (`addons.pets = 1`); the duplicate pet stepper card was removed from Step 5 (*Custom Add-Ons*) to reduce friction.
  - **Same-Origin Server Validation & Dispatch (`/api/estimate-request` & `/api/calendar-availability`)**: Server code validates all fields, recalculates the authoritative flat-rate price, enforces Monday–Friday 8:00 AM – 5:30 PM availability, skips US holidays and validates leap-year calendar dates, prevents double-booking a reserved slot, and dispatches an automated email + RFC 5545 `.ics` calendar appointment invite to `smartsprosolutions@gmail.com` via `RESEND_API_KEY` or `EMAIL_WEBHOOK_URL`.
  - **Fail-Closed Delivery Boundary**: If neither `RESEND_API_KEY` nor `EMAIL_WEBHOOK_URL` is configured on the host yet, `/api/estimate-request` fails closed (`HTTP 503`, `EMAIL_PROVIDER_UNCONFIGURED`) rather than fabricating a fake confirmation receipt, and returns a pre-addressed `mailto:` link and `.ics` calendar file download so the customer can still send their validated request directly.
- Security and intake changes are implemented and tested locally. **They have not been
  deployed or verified on a live hostname in this work.** Hosting/account and mail-provider
  environment variables (`EMAIL_WEBHOOK_URL` or `RESEND_API_KEY`) are still pending configuration in Vercel.

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake & calendar UI | `assets/js/booking-modal.js` progressive-enhances `#booking-modal-overlay` using safe DOM APIs (`document.createElement` / `textContent`, zero `innerHTML`) with a simplified, senior-friendly layout for the **Interactive Calendar Date & Arrival Window Picker (Mon–Fri, 8:00 AM – 5:30 PM)**, subtle booked-window indicator, and **Customer Contact & Notes fields** (`First Name`, `Last Name`, `Phone Number`, `Email Address`, `Additional Notes`). Static HTML has zero dead `<form>` inputs when JS is disabled. |
| Server intake & calendar API | `server/intake-service.mjs`, `api/calendar-availability.mjs`, and `api/estimate-request.mjs` enforce `docs/SECURITY-ROADMAP.md` Section 1 controls: `POST` JSON only, 16 KiB body limit, unknown-field & prototype-key rejection, client-price rejection, Unicode name support, credit-card PAN rejection in notes, perpetual leap-year validation, Monday–Friday (`8:00 AM – 5:30 PM`) & US holiday exclusions, double-booking prevention (`409 SLOT_ALREADY_BOOKED`), per-IP/per-contact rate limiting (`429` + `Retry-After`), `Idempotency-Key` deduplication, and RFC 5545 `.ics` calendar invite generation. |
| No online payments | Removed online deposit/balance rows from `index.html`, `assets/js/calculator.js`, `assets/js/booking-modal.js`, and `assets/js/api.js`. Calculator values remain display estimates; the server recalculates the authoritative flat-rate total on every submission. |
| Browser API client | `assets/js/api.js` removes legacy `smartspro_leads_v1` without reading/logging its contents, keeps legacy `submitBooking()` fail-closed (`INTAKE_UNAVAILABLE`), and exposes `fetchCalendarAvailability()` and `submitEstimateRequest()` for same-origin `/api/*` communication. |
| Browser protection (CSP) | `vercel.json`, `index.html`, and `404.html` enforce strict CSP with the narrow `connect-src 'self'` update so same-origin `/api/calendar-availability` and `/api/estimate-request` calls succeed while third-party connections, inline scripts/styles, `form-action`, and framing remain denied. |
| Public files | `security/public-files.json` remains an explicit static publish allowlist copied to `dist/`. Server code (`server/`, `api/`, `.env.example`) is never copied into static `dist/` assets. |
| Regression checks | `tests/security.test.mjs` runs **9** automated test suites covering legacy storage cleanup, CSP parity, static HTML/JS safety, font provenance, public manifest isolation, and server-side intake & abuse/failure checks (method/content-type, cross-site rejection, >16 KiB payload, price tampering, PAN/XSS rejection, weekend/holiday/leap-year calendar bounds, authoritative price calculation, `.ics` + email generation, idempotency replay/conflict, double-booking prevention, rate limiting, and fail-closed unconfigured mail provider). |

## Verification record

Results from the 2026-11-04 automated email & calendar appointment update:

- `npm run build`: passed all **9** automated security test suites (`tests/security.test.mjs`) and generated the approved public build in `dist/`.
- `scripts/browser-check.mjs`: updated with assertions for no-online-payment flat-rate pricing, calendar date/slot picker, upcoming bookings feed, customer intake inputs, and third-party `connect-src` blocking.
- Not performed: live deployment/header verification, Vercel environment variable configuration (`EMAIL_WEBHOOK_URL` / `RESEND_API_KEY`), GitHub-hosted workflow execution, or independent penetration testing.

## Configuring automated email & Google Calendar in Vercel

Before live customer submissions can auto-dispatch on the deployed Vercel host, add one of the following in **Vercel Project Settings → Environment Variables** (see `.env.example`):

1. **Option A — Free Gmail + Google Calendar via Google Apps Script (`EMAIL_WEBHOOK_URL`)**:
   - In the business's `smartsprosolutions@gmail.com` Google account, create a script at `script.google.com` with a `doPost(e)` handler that parses the JSON payload, calls `MailApp.sendEmail` to `smartsprosolutions@gmail.com`, and calls `CalendarApp.getDefaultCalendar().createEvent(...)` for the requested appointment slot.
   - Deploy as a Web App and set `EMAIL_WEBHOOK_URL` (and optional `EMAIL_WEBHOOK_SECRET`) in Vercel.
2. **Option B — Resend Transactional Email API (`RESEND_API_KEY`)**:
   - Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `OWNER_NOTIFICATION_EMAIL=smartsprosolutions@gmail.com` in Vercel. The server automatically attaches the `.ics` calendar appointment file to every email.

## Commands for the next implementation

```sh
npm run build
npm run test:browser
npm run preview
```

After deploying to the canonical HTTPS origin:

```sh
npm run security:verify -- https://YOUR-DEPLOYED-HOST
```
