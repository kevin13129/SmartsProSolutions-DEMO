# Security handoff: read this first

Last updated: **2026-11-04**. This is the quick entry point for future models and
developers. Detailed controls live in the linked baseline and roadmap; keep
those documents authoritative rather than duplicating their full requirements.

## Current state in one minute

- The owner requested security foundations before customer-facing customization.
- Business pricing, intake & scheduling terms confirmed by the owner (2026-11-04 through 2026-11-18):
  - **No Online Payments**: The business is **not** collecting online payments, deposits, or card details on the website (`onlinePaymentEnabled: false`).
  - **Minimum Job & No Hourly Rate Display**: `$50` minimum job charge (`Specific Areas` starts at `$50` for 1 hr; `2hr / $120` floor removed); `2,000 sq ft` 3B/2F Standard Clean estimates `$250` (`5 Hours`) and Deep Clean estimates `$330` (`5.5 Hours`). No `$/hr` hourly rate is shown anywhere on the site.
  - **Estimated Cleaning Hours & Open Customer Arrival Windows**: Selecting Standard vs. Deep Clean or adding appliances (`+0.5h` per fridge/oven, `+0.25h` pets) updates `Est. Cleaning Time` in the modal recap, confirmation summary, owner email, and `.ics`/Google Calendar event length (`DTEND = start + durationMinutes`, capped at `4:30 PM` close on the calendar). All three weekday arrival windows (`8:00 AM – 11:00 AM`, `11:00 AM – 2:00 PM`, `2:00 PM – 4:30 PM`) remain selectable based on customer availability unless blocked by an existing overlapping appointment or business holiday.
  - **Signed Edit Session (`updateToken`) + Live Google Calendar Sync + Owner Finish-Early Action (`/api/finish-early`)**:
    - `GET /api/calendar-availability` syncs anonymized `busyIntervals` (`date`, `startMinutes`, `endMinutes`, zero customer PII) from Google Apps Script (`EMAIL_WEBHOOK_URL`), and visitors have a **"Refresh Available Times"** button (`#btn-refresh-calendar`).
    - Confirmed bookings receive an HMAC-signed `updateToken` so customers editing their estimate or add-ons can update without self-blocking against their own Google Calendar hold, while passing `previousReferenceCode` so Apps Script replaces the prior event cleanly.
    - Every owner email includes an HMAC-signed **Finish Early — Re-Open Remaining Time** link (`/api/finish-early?token=...`). `GET` renders a strict-CSP two-step confirmation card (zero mutations on `GET` so email link scanners cannot trigger changes); clicking **Confirm Finished Early Now** or **Release Entire Window** `POST`s to `/api/finish-early`, truncates/releases the block locally and in Google Calendar (`action: 'finishEarly'`), and immediately re-opens remaining windows on the website.
  - **Fail-Closed Delivery Boundary**: If neither `RESEND_API_KEY` nor `EMAIL_WEBHOOK_URL` is configured on the host yet (`503 EMAIL_PROVIDER_UNCONFIGURED`), or if an Apps Script webhook returns an HTML login/exception page instead of valid JSON (`502 EMAIL_DISPATCH_FAILED`), `/api/estimate-request` fails closed rather than fabricating a confirmation receipt, and returns a pre-addressed `mailto:` link and `.ics` calendar file download.
- Security and intake changes are implemented and tested locally. **Pending live deployment push and Apps Script script/deployment verification on the owner's accounts.**

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake, duration & live calendar UI | `assets/js/booking-modal.js`, `assets/js/calculator.js`, and `index.html` enforce step-by-step completion before scheduling, move Specific Areas into Step 5 with safe word-wrapping, add a modal header **Edit Details** button (`#modal-edit-details-btn`), show `Est. Cleaning Time` in the recap & confirmation view, keep all non-conflicting arrival windows selectable regardless of duration, exclude the customer's own booking during edits via `updateToken`, and provide `Refresh Available Times`. Zero raw HTML sinks or inline styles. |
| Server intake, `updateToken` & Finish-Early API | `server/intake-service.mjs`, `api/calendar-availability.mjs`, `api/estimate-request.mjs`, and `api/finish-early.mjs` enforce `docs/SECURITY-ROADMAP.md` Section 1 controls, duration-aware `.ics` `DTEND` sizing, interval overlap locking (`409 SLOT_ALREADY_BOOKED`), HMAC-SHA256 `updateToken` + `previousReferenceCode` self-edit replacement, HMAC-SHA256 `FINISH_EARLY_SECRET` tokens, strict-CSP two-step `/api/finish-early` GET page + `assets/js/finish-early.js` POST handler, fail-closed HTML/JSON response validation on webhooks, and bidirectional Google Apps Script calendar actions (`createBooking`, `finishEarly`, `GET availability`). |
| Legal, privacy, refund, cookie & 18+ policies | `index.html` includes an accessible `#legal-privacy-policies` footer drawer covering the Privacy & Data Minimization Policy, Terms of Service, strict No-Refunds Policy, Zero-Cookie / Zero-Tracker Policy, 18+ Age Policy, and Data Deletion / Email Opt-Out instructions (`smartsprosolutions@gmail.com` / `(318) 564-4360`). |
| Public files & zero source maps | `security/public-files.json` publishes the explicit static allowlist into `dist/`, including `assets/js/finish-early.js`. Server code (`server/`, `api/`, `.env.example`) and `.map` source maps are never copied into static `dist/` assets. |
| Automated security & compliance tests | `tests/security.test.mjs` and `scripts/browser-check.mjs` verify CSP compliance, wizard gating & red highlight feedback, modal word-wrapping, open arrival windows, interval overlap conflicts, `updateToken` self-edit handling, fail-closed webhook HTML detection, `.ics` `DTEND` sizing, and two-step `/api/finish-early` token verification. |

## Verification record

- Locally verified via `npm run build` (`npm test` + `dist/` manifest build) and headless DOM/script checks. (`npm run test:browser` requires Chromium on the host OS.)
- Pending live verification on `https://www.smartsprosolutions.com`: deploy updated code to Vercel, confirm `EMAIL_WEBHOOK_URL` matches the active Apps Script **Who has access: Anyone** Web App deployment, and test an end-to-end submission + edit + Finish-Early email delivery to `smartsprosolutions@gmail.com`.

## Configuring automated email & bidirectional Google Calendar in Vercel

1. **Option A — Free Gmail + Live Google Calendar Sync via Google Apps Script (`EMAIL_WEBHOOK_URL`)**:
   - In the business's `smartsprosolutions@gmail.com` Google account, open `script.google.com`, create a new project, and paste this Web App script:
     ```javascript
     const TZ = 'America/Chicago';

     function doGet(e) {
       const cal = CalendarApp.getDefaultCalendar();
       const now = new Date();
       const end = new Date(now.getTime() + 65 * 24 * 60 * 60 * 1000);
       const events = cal.getEvents(now, end);
       const busyIntervals = events
         .filter(ev => !ev.isAllDayEvent())
         .map(ev => {
           const s = ev.getStartTime();
           const f = ev.getEndTime();
           const date = Utilities.formatDate(s, TZ, 'yyyy-MM-dd');
           const startH = Number(Utilities.formatDate(s, TZ, 'H'));
           const startM = Number(Utilities.formatDate(s, TZ, 'm'));
           const endH = Number(Utilities.formatDate(f, TZ, 'H'));
           const endM = Number(Utilities.formatDate(f, TZ, 'm'));
           return {
             date: date,
             startMinutes: startH * 60 + startM,
             endMinutes: endH * 60 + endM
           };
         });
       return ContentService
         .createTextOutput(JSON.stringify({ ok: true, busyIntervals: busyIntervals }))
         .setMimeType(ContentService.MimeType.JSON);
     }

     function doPost(e) {
       const data = JSON.parse(e.postData.contents);
       const cal = CalendarApp.getDefaultCalendar();

       if (data.action === 'finishEarly') {
         const dayStart = new Date(data.date + 'T00:00:00-06:00');
         const dayEnd = new Date(data.date + 'T23:59:59-06:00');
         const events = cal.getEvents(dayStart, dayEnd);
         for (let i = 0; i < events.length; i++) {
           const ev = events[i];
           const title = ev.getTitle() || '';
           const desc = ev.getDescription() || '';
           if (title.indexOf(data.referenceCode) !== -1 || desc.indexOf(data.referenceCode) !== -1) {
             if (data.releaseAll) {
               ev.deleteEvent();
             } else {
               ev.setTime(ev.getStartTime(), new Date(data.earlyEndIso));
             }
             return ContentService
               .createTextOutput(JSON.stringify({ ok: true, updated: true }))
               .setMimeType(ContentService.MimeType.JSON);
           }
         }
         return ContentService
           .createTextOutput(JSON.stringify({ ok: true, updated: false }))
           .setMimeType(ContentService.MimeType.JSON);
       }

       // Default: createBooking
       MailApp.sendEmail({
         to: data.to || 'smartsprosolutions@gmail.com',
         replyTo: data.replyTo || '',
         subject: data.subject,
         body: data.textBody,
         htmlBody: data.htmlBody
       });

       if (data.previousReferenceCode && data.appointment && data.appointment.preferredDate) {
         const prevStart = new Date(data.appointment.preferredDate + 'T00:00:00-06:00');
         const prevEnd = new Date(data.appointment.preferredDate + 'T23:59:59-06:00');
         const existing = cal.getEvents(prevStart, prevEnd);
         for (let i = 0; i < existing.length; i++) {
           const t = existing[i].getTitle() || '';
           const d = existing[i].getDescription() || '';
           if (t.indexOf(data.previousReferenceCode) !== -1 || d.indexOf(data.previousReferenceCode) !== -1) {
             existing[i].deleteEvent();
           }
         }
       }

       if (data.appointment && data.appointment.startIso && data.appointment.endIso) {
         const summary = 'Smarts Pro Cleaning [' + data.referenceCode + ']';
         cal.createEvent(
           summary,
           new Date(data.appointment.startIso),
           new Date(data.appointment.endIso),
           { description: 'Ref: ' + data.referenceCode + '\n' + (data.textBody || '') }
         );
       }

       return ContentService
         .createTextOutput(JSON.stringify({ ok: true }))
         .setMimeType(ContentService.MimeType.JSON);
     }
     ```
   - Click **Deploy -> New deployment -> Web app** (or **Manage deployments -> Edit -> Version: New version**, keeping `Execute as: Me` and `Who has access: Anyone`) and paste the URL into Vercel as `EMAIL_WEBHOOK_URL`, along with `FINISH_EARLY_SECRET` (random 32+ char string) and `PUBLIC_SITE_URL=https://www.smartsprosolutions.com`.
2. **Option B — Resend Transactional Email API (`RESEND_API_KEY`)**:
   - Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OWNER_NOTIFICATION_EMAIL=smartsprosolutions@gmail.com`, and `FINISH_EARLY_SECRET` in Vercel.

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
