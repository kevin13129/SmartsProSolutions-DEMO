# Security handoff: read this first

Last updated: **2026-11-04**. This is the quick entry point for future models and
developers. Detailed controls live in the linked baseline and roadmap; keep
those documents authoritative rather than duplicating their full requirements.

## Current state in one minute

- The owner requested security foundations before customer-facing customization.
- Business pricing, intake & scheduling terms confirmed by the owner (2026-11-04 through 2026-11-18):
  - **No Online Payments**: The business is **not** collecting online payments, deposits, or card details on the website (`onlinePaymentEnabled: false`).
  - **Minimum Job & No Hourly Rate Display**: `$50` minimum job charge (`Specific Areas` starts at `$50` for 1 hr; `2hr / $120` floor removed); `2,000 sq ft` 3B/2F Standard Clean estimates `$250` (`5 Hours`) and Deep Clean estimates `$330` (`5.5 Hours`). No `$/hr` hourly rate is shown anywhere on the site.
  - **Estimated Cleaning Hours & 4:30 PM Completion Cutoff**: Selecting Standard vs. Deep Clean or adding appliances (`+0.5h` per fridge/oven, `+0.25h` pets) updates `Est. Cleaning Time` in the modal recap, confirmation summary, owner email, and `.ics`/Google Calendar event length (`DTEND = start + durationMinutes`). Booking hours run **Mon–Fri, 8:00 AM – 4:30 PM**, and slots starting after `8:00 AM` (`11:00 AM` or `2:00 PM`) are automatically blocked if `start + duration` would pass `4:30 PM` (`400 SLOT_EXCEEDS_CLOSING_TIME`).
  - **Live Google Calendar Sync + Owner Finish-Early Action (`/api/finish-early`)**:
    - `GET /api/calendar-availability` syncs anonymized `busyIntervals` (`date`, `startMinutes`, `endMinutes`, zero customer PII) from Google Apps Script (`EMAIL_WEBHOOK_URL`), and visitors have a **"Refresh Available Times"** button (`#btn-refresh-calendar`).
    - Every owner email includes an HMAC-signed **Finish Early — Re-Open Remaining Time** link (`/api/finish-early?token=...`). `GET` renders a strict-CSP two-step confirmation card (zero mutations on `GET` so email link scanners cannot trigger changes); clicking **Confirm Finished Early Now** or **Release Entire Window** `POST`s to `/api/finish-early`, truncates/releases the block locally and in Google Calendar (`action: 'finishEarly'`), and immediately re-opens remaining windows on the website.
  - **Fail-Closed Delivery Boundary**: If neither `RESEND_API_KEY` nor `EMAIL_WEBHOOK_URL` is configured on the host yet, `/api/estimate-request` fails closed (`HTTP 503`, `EMAIL_PROVIDER_UNCONFIGURED`) rather than fabricating a fake confirmation receipt, and returns a pre-addressed `mailto:` link and `.ics` calendar file download.
- Security and intake changes are implemented and tested locally. **Pending live deployment / Vercel env config (`EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_SECRET`, `FINISH_EARLY_SECRET`) on the owner's accounts.**

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake, duration & live calendar UI | `assets/js/booking-modal.js`, `assets/js/calculator.js`, and `index.html` show `Est. Cleaning Time` in the modal recap & confirmation view, evaluate anonymized `busyIntervals` overlap and the strict 4:30 PM cutoff dynamically when toggling Standard/Deep/add-ons, and provide a `Refresh Available Times` button (`#btn-refresh-calendar`). Zero raw HTML sinks or inline styles. |
| Server intake, duration overlap & Finish-Early API | `server/intake-service.mjs`, `api/calendar-availability.mjs`, `api/estimate-request.mjs`, and `api/finish-early.mjs` enforce `docs/SECURITY-ROADMAP.md` Section 1 controls, duration-aware `.ics` `DTEND` sizing, `SLOT_EXCEEDS_CLOSING_TIME` (`400`), interval overlap locking (`409 SLOT_ALREADY_BOOKED`), HMAC-SHA256 `FINISH_EARLY_SECRET` tokens, strict-CSP two-step `/api/finish-early` GET page + `assets/js/finish-early.js` POST handler, and bidirectional Google Apps Script calendar actions (`createBooking`, `finishEarly`, `GET availability`). |
| Legal, privacy, refund, cookie & 18+ policies | `index.html` includes an accessible `#legal-privacy-policies` footer drawer covering the Privacy & Data Minimization Policy, Terms of Service, strict No-Refunds Policy, Zero-Cookie / Zero-Tracker Policy, 18+ Age Policy, and Data Deletion / Email Opt-Out instructions (`smartsprosolutions@gmail.com` / `(318) 564-4360`). |
| Public files & zero source maps | `security/public-files.json` publishes the explicit static allowlist into `dist/`, including `assets/js/finish-early.js`. Server code (`server/`, `api/`, `.env.example`) and `.map` source maps are never copied into static `dist/` assets. |
| Automated security & compliance tests | `tests/security.test.mjs` and `scripts/browser-check.mjs` verify CSP compliance, duration-aware 4:30 PM cutoffs, interval overlap conflicts, `.ics` `DTEND` sizing, two-step `/api/finish-early` token verification and slot re-opening, and live UI updates. |

## Verification record

- Locally verified via `npm run build` (`npm test` + `dist/` manifest build) and `npm run test:browser` (headless Chromium CSP, layout, calculator, and modal checks).
- Not performed here: live deployment on Vercel with owner Google Apps Script `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_SECRET`, and `FINISH_EARLY_SECRET` configured.

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
   - Click **Deploy -> New deployment -> Web app** (`Execute as: Me`, `Who has access: Anyone`) and paste the URL into Vercel as `EMAIL_WEBHOOK_URL`, along with `FINISH_EARLY_SECRET` (random 32+ char string) and `PUBLIC_SITE_URL=https://www.smartsprosolutions.com`.
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
