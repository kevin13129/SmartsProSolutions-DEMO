# Security handoff: read this first

Last updated: **2026-11-04**. This is the quick entry point for future models and
developers. Detailed controls live in the linked baseline and roadmap; keep
those documents authoritative rather than duplicating their full requirements.

## Current state in one minute

- The owner requested security foundations before customer-facing customization.
- Business pricing, intake & scheduling terms confirmed by the owner (2026-11-04 through 2026-11-18):
  - **No Online Payments**: The business is **not** collecting online payments, deposits, or card details on the website (`onlinePaymentEnabled: false`).
  - **Minimum Job & No Hourly Rate Display**: `$50` minimum job charge (`Specific Areas` starts at `$50` for 1 hr; `2hr / $120` floor removed); `2,000 sq ft` 3B/2F Standard Clean estimates `$250` (`5 Hours`) and Deep Clean estimates `$330` (`5.5 Hours`). No `$/hr` hourly rate is shown anywhere on the site.
  - **Fixed Calendar Time Blocks & Estimated Cleaning Time**: All three weekday time blocks (`8:00 AM – 11:00 AM`, `11:00 AM – 2:00 PM`, `2:00 PM – 4:30 PM`) keep fixed start and end times on Google Calendar, `.ics` invites, and the website scheduler (duration does not stretch calendar block end times). `Est. Cleaning Time` is still calculated and displayed in the recap, confirmation card, and emails for scheduling context, and the owner can adjust or finish early directly in Google Calendar or via Finish-Early.
  - **Recurring Appointments + Customer Confirmation Emails + `[UPDATED]` Clean Replacement**:
    - Selecting `weekly`, `biweekly`, or `monthly` creates a recurring Google Calendar series (`FREQ=WEEKLY`, `FREQ=WEEKLY;INTERVAL=2`, `FREQ=MONTHLY` in `.ics` `RRULE` and Apps Script `createEventSeries`) and projects recurring holds across the 2-month booking window.
    - Confirmed bookings dispatch **two** separate emails: an owner notification email to `smartsprosolutions@gmail.com` (with Finish-Early control) and a separate customer confirmation email (`customerEmail`, with zero owner-only Finish-Early links).
    - Editing a booking via `updateToken` passes `previousReferenceCode` and `previousDate` so Apps Script deletes any prior matching event or entire recurring series before creating the `[UPDATED]` appointment.
  - **Signed Edit Session (`updateToken`) + Live Google Calendar Sync + Owner Finish-Early Action (`/api/finish-early`)**:
    - `GET /api/calendar-availability` syncs anonymized `busyIntervals` (`date`, `startMinutes`, `endMinutes`, zero customer PII) from Google Apps Script (`EMAIL_WEBHOOK_URL`), and visitors have a **"Refresh Available Times"** button (`#btn-refresh-calendar`).
    - Confirmed bookings receive an HMAC-signed `updateToken` so customers editing their estimate or add-ons can update without self-blocking against their own Google Calendar hold.
    - Every owner email includes an HMAC-signed **Finish Early — Re-Open Remaining Time** link (`/api/finish-early?token=...`). `GET` renders a strict-CSP two-step confirmation card (zero mutations on `GET` so email link scanners cannot trigger changes); clicking **Confirm Finished Early Now** or **Release Entire Window** `POST`s to `/api/finish-early`, truncates/releases the single-day block locally and in Google Calendar (`action: 'finishEarly'`), and immediately re-opens remaining windows on the website.
  - **Fail-Closed Delivery Boundary**: If neither `RESEND_API_KEY` nor `EMAIL_WEBHOOK_URL` is configured on the host yet (`503 EMAIL_PROVIDER_UNCONFIGURED`), or if an Apps Script webhook returns an HTML login/exception page instead of valid JSON (`502 EMAIL_DISPATCH_FAILED`), `/api/estimate-request` fails closed rather than fabricating a confirmation receipt, and returns a pre-addressed `mailto:` link and `.ics` calendar file download.
- Security and intake changes are implemented and tested locally. **Pending live deployment push and Apps Script script/deployment verification on the owner's accounts.**

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake, fixed time blocks & live calendar UI | `assets/js/booking-modal.js`, `assets/js/calculator.js`, and `index.html` enforce step-by-step completion before scheduling, move Specific Areas into Step 5 with safe word-wrapping, add a modal header **Edit Details** button (`#modal-edit-details-btn`), keep fixed scheduler time blocks (`8:00 AM – 11:00 AM`, `11:00 AM – 2:00 PM`, `2:00 PM – 4:30 PM`), show `Est. Cleaning Time` in the recap & confirmation view, exclude the customer's own booking during edits via `updateToken`, and provide `Refresh Available Times`. Zero raw HTML sinks or inline styles. |
| Server intake, recurrence, dual emails & `updateToken` | `server/intake-service.mjs`, `api/calendar-availability.mjs`, `api/estimate-request.mjs`, and `api/finish-early.mjs` enforce `docs/SECURITY-ROADMAP.md` Section 1 controls, lock calendar/`.ics` times strictly to chosen scheduler blocks, emit `RRULE` for `weekly`/`biweekly`/`monthly` and project recurring local holds, generate separate owner (`finishEarlyUrl`) and customer (`customerConfirmation`) emails, mark edited appointments `[UPDATED]` with `previousReferenceCode` + `previousDate`, enforce slot locking (`409 SLOT_ALREADY_BOOKED`), fail closed on HTML/JSON webhook responses, and handle `/api/finish-early`. |
| Legal, privacy, refund, cookie & 18+ policies | `index.html` includes an accessible `#legal-privacy-policies` footer drawer covering the Privacy & Data Minimization Policy, Terms of Service, strict No-Refunds Policy, Zero-Cookie / Zero-Tracker Policy, 18+ Age Policy, and Data Deletion / Email Opt-Out instructions (`smartsprosolutions@gmail.com` / `(318) 564-4360`). |
| Public files & zero source maps | `security/public-files.json` publishes the explicit static allowlist into `dist/`, including `assets/js/finish-early.js`. Server code (`server/`, `api/`, `.env.example`) and `.map` source maps are never copied into static `dist/` assets. |
| Automated security & compliance tests | `tests/security.test.mjs` and `scripts/browser-check.mjs` verify CSP compliance, wizard gating & red highlight feedback, modal word-wrapping, fixed time blocks, recurring series & local recurring holds, dual owner/customer emails, `[UPDATED]` edit replacement & `updateToken`, fail-closed webhook HTML detection, and two-step `/api/finish-early` token verification. |

## Verification record

- Locally verified via `npm run build` (`npm test` + `dist/` manifest build). (`npm run test:browser` requires Chromium on the host OS.)
- Pending live verification on `https://www.smartsprosolutions.com`: deploy updated code to Vercel, update Google Apps Script with the new `doGet`/`doPost` code below (creating a New version deployment), verify customer confirmation email receipt, recurring weekly/monthly calendar events, fixed time blocks, and `[UPDATED]` replacement on edit.

## Configuring automated email & bidirectional Google Calendar in Vercel

1. **Option A — Free Gmail + Live Google Calendar Sync via Google Apps Script (`EMAIL_WEBHOOK_URL`)**:
   - In the business's `smartsprosolutions@gmail.com` Google account, open `script.google.com`, open your Smarts Pro project, and replace `Code.gs` with this Web App script:
     ```javascript
     const TZ = 'America/Chicago';

     function doGet(e) {
       const cal = CalendarApp.getDefaultCalendar();
       const now = new Date();
       const end = new Date(now.getTime() + 65 * 24 * 60 * 60 * 1000);
       const events = cal.getEvents(now, end);
       const busyIntervals = events
         .filter(function (ev) { return !ev.isAllDayEvent(); })
         .map(function (ev) {
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

     function deleteBookingEventsByRef_(cal, refCode, dateHints) {
       if (!refCode) return 0;
       const deletedSeriesIds = {};
       const matched = [];

       const searchStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
       const searchEnd = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
       const searchHits = cal.getEvents(searchStart, searchEnd, { search: refCode });
       for (let i = 0; i < searchHits.length; i++) {
         matched.push(searchHits[i]);
       }

       const seenDates = {};
       for (let d = 0; d < dateHints.length; d++) {
         const iso = dateHints[d];
         if (!iso || seenDates[iso]) continue;
         seenDates[iso] = true;
         const dayStart = new Date(iso + 'T00:00:00-06:00');
         const dayEnd = new Date(iso + 'T23:59:59-05:00');
         const dayEvents = cal.getEvents(dayStart, dayEnd);
         for (let j = 0; j < dayEvents.length; j++) {
           matched.push(dayEvents[j]);
         }
       }

       let deletedCount = 0;
       for (let k = 0; k < matched.length; k++) {
         const ev = matched[k];
         try {
           const t = ev.getTitle() || '';
           const desc = ev.getDescription() || '';
           if (t.indexOf(refCode) === -1 && desc.indexOf(refCode) === -1) continue;

           if (ev.isRecurringEvent()) {
             const series = ev.getEventSeries();
             const seriesId = series ? series.getId() : '';
             if (series && (!seriesId || !deletedSeriesIds[seriesId])) {
               if (seriesId) deletedSeriesIds[seriesId] = true;
               series.deleteEventSeries();
               deletedCount++;
             }
           } else {
             ev.deleteEvent();
             deletedCount++;
           }
         } catch (err) {
           // Already removed with series
         }
       }
       return deletedCount;
     }

     function doPost(e) {
       const data = JSON.parse(e.postData.contents);
       const cal = CalendarApp.getDefaultCalendar();

       if (data.action === 'finishEarly') {
         const dayStart = new Date(data.date + 'T00:00:00-06:00');
         const dayEnd = new Date(data.date + 'T23:59:59-05:00');
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

       // 1. Send Owner Notification Email (includes Finish-Early link)
       MailApp.sendEmail({
         to: data.to || 'smartsprosolutions@gmail.com',
         replyTo: data.replyTo || '',
         subject: data.subject,
         body: data.textBody,
         htmlBody: data.htmlBody
       });

       // 2. Send Customer Confirmation Email (no owner Finish-Early link)
       if (data.customerEmail && data.customerEmail.to) {
         MailApp.sendEmail({
           to: data.customerEmail.to,
           replyTo: data.customerEmail.replyTo || 'smartsprosolutions@gmail.com',
           subject: data.customerEmail.subject,
           body: data.customerEmail.textBody,
           htmlBody: data.customerEmail.htmlBody
         });
       }

       // 3. Delete previous event or recurring series if editing an existing booking
       if (data.previousReferenceCode) {
         deleteBookingEventsByRef_(cal, data.previousReferenceCode, [
           data.previousDate || '',
           (data.appointment && data.appointment.preferredDate) || ''
         ]);
       }

       // 4. Create fixed time-block event (or recurring series for weekly / biweekly / monthly)
       if (data.appointment && data.appointment.startIso && data.appointment.endIso) {
         const startDt = new Date(data.appointment.startIso);
         const endDt = new Date(data.appointment.endIso);
         const prefix = (data.isUpdated || data.previousReferenceCode) ? '[UPDATED] ' : '';
         const summary = prefix + 'Smarts Pro Cleaning [' + data.referenceCode + ']';
         const options = {
           description: 'Ref: ' + data.referenceCode + '\n' + (data.textBody || '')
         };
         const freq =
           (data.recurrence && data.recurrence.frequency) ||
           (data.quote && data.quote.frequency) ||
           'onetime';

         if (freq === 'weekly') {
           const weeklyRule = CalendarApp.newRecurrence().addWeeklyRule();
           cal.createEventSeries(summary, startDt, endDt, weeklyRule, options);
         } else if (freq === 'biweekly') {
           const biweeklyRule = CalendarApp.newRecurrence().addWeeklyRule().interval(2);
           cal.createEventSeries(summary, startDt, endDt, biweeklyRule, options);
         } else if (freq === 'monthly') {
           const monthlyRule = CalendarApp.newRecurrence().addMonthlyRule();
           cal.createEventSeries(summary, startDt, endDt, monthlyRule, options);
         } else {
           cal.createEvent(summary, startDt, endDt, options);
         }
       }

       return ContentService
         .createTextOutput(JSON.stringify({ ok: true }))
         .setMimeType(ContentService.MimeType.JSON);
     }
     ```
   - Click **Deploy -> Manage deployments -> Edit -> Version: New version** (keeping `Execute as: Me` and `Who has access: Anyone`) so your existing `EMAIL_WEBHOOK_URL` immediately serves the updated script. In Vercel, ensure `EMAIL_WEBHOOK_URL`, `FINISH_EARLY_SECRET` (random 32+ char string), and `PUBLIC_SITE_URL=https://www.smartsprosolutions.com` are saved.
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
