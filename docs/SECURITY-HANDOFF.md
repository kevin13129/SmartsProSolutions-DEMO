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
  - **Same Reference ID, Locked Time Blocks & Unlimited Verified Edits (`updateToken`)**:
    - Confirmed bookings receive an HMAC-signed `updateToken` keeping the **exact same `referenceCode`** (`SPS-...`) across every edit and locking the customer's reserved appointment date and time block (`400 APPOINTMENT_TIME_LOCKED` on client and server; customers call `(318) 564-4360` to reschedule a day/time).
    - Verified `updateToken` edits are exempt from the strict `5 requests / 10 minutes` new-booking spam cap (guarded instead by a generous `60 / 10 min` edit burst cap), so real customers can add appliances, adjust hours, or change home details multiple times without hitting `429` or `409` self-blocking, while unverified new submissions remain strictly capped by IP and email.
  - **Green `UPDATED` + Ordered Diff List + Blue `Reference ID` Owner Alerts & `[UPDATED APPOINTMENT]` Customer Receipts**:
    - Each `updateToken` embeds a compact non-PII snapshot (`snap`) of the prior service, hours, home specs, add-ons, pets, notes hash, and total so edited bookings send owner emails to `smartsprosolutions@gmail.com` with green `UPDATED` status banners (`#16A34A` / `#DCFCE7`), a numbered **What Was Added / Updated** breakdown (`+ ADDED` / `UPDATED` items in green), blue `Reference ID` badges (`#1D4ED8` / `#DBEAFE`), and Finish-Early links.
    - Verified `updateToken` edits also use overlap matching against remote Google Calendar (`gcal`) intervals so varying calendar event end times on the customer's locked date/window never trigger false `409 SLOT_ALREADY_BOOKED` errors.
    - Customers receive a reset `[UPDATED APPOINTMENT]` receipt email listing their additions/updates, `Previous Total`, `Updated Total`, all current options/add-ons, locked appointment date/time block, and `.ics` calendar attachment (with zero owner-only Finish-Early links).
  - **Fail-Closed Delivery Boundary & Zero-Leak Fallback**: If neither `RESEND_API_KEY` nor `EMAIL_WEBHOOK_URL` is configured (`503 EMAIL_PROVIDER_UNCONFIGURED`), if an Apps Script webhook returns HTML instead of JSON, or if Apps Script reports `customerEmailSent !== true` (`502 EMAIL_DISPATCH_FAILED`), `/api/estimate-request` fails closed with an `ACTION REQUIRED • AUTOMATED EMAIL INCOMPLETE` banner and a Retry button when no confirmed `updateToken` exists, and returns a scrubbed pre-addressed `mailto:` link (never containing owner-only Finish-Early URLs) and `.ics` calendar download.
- Security and intake changes are implemented and tested locally. **Pending live deployment push and Apps Script `Manage deployments` switch from `Version 3` to `Version 4`+ on the owner's Google account.**

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake, locked-edit time UI & live calendar | `assets/js/booking-modal.js`, `assets/css/security.css`, `assets/js/calculator.js`, and `index.html` enforce step-by-step completion before scheduling, move Specific Areas into Step 5 with safe word-wrapping, add a modal header **Edit Details** button (`#modal-edit-details-btn`), keep fixed scheduler time blocks (`8:00 AM – 11:00 AM`, `11:00 AM – 2:00 PM`, `2:00 PM – 4:30 PM`), lock the date and time window once confirmed (`#calendar-locked-banner` and disabled controls during edits), show an honest `ACTION REQUIRED • AUTOMATED EMAIL INCOMPLETE` warning with retry button when dispatch fails without a confirmed `updateToken`, display Previous Total → Updated Total, and allow unlimited verified add-on/detail updates. Zero raw HTML sinks or inline styles. |
| Server intake, same-Ref edits, email highlights & `updateToken` | `server/intake-service.mjs`, `api/calendar-availability.mjs`, `api/estimate-request.mjs`, and `api/finish-early.mjs` enforce `docs/SECURITY-ROADMAP.md` Section 1 controls, preserve the exact same `referenceCode` across verified edits while tracking `updateCount`, `previousTotal`, and compact `snap` diffs, skip overlapping `gcal` self-holds when editing via `updateToken`, reject date/window tampering (`400 APPOINTMENT_TIME_LOCKED`), bypass strict `5/10 min` anti-spam caps for signed `updateToken` edits while enforcing them on unverified requests, highlight `UPDATED` + numbered `What Was Added / Updated` items in green and `Reference ID` in blue for owner emails, send `[UPDATED APPOINTMENT]` customer receipts, scrub `finishEarlyUrl` strictly out of customer `fallbackMailtoUrl` drafts, fail closed when `customerEmailSent !== true` or HTML responses occur, and handle `/api/finish-early`. |
| Legal, privacy, refund, cookie & 18+ policies | `index.html` includes an accessible `#legal-privacy-policies` footer drawer covering the Privacy & Data Minimization Policy, Terms of Service, strict No-Refunds Policy, Zero-Cookie / Zero-Tracker Policy, 18+ Age Policy, and Data Deletion / Email Opt-Out instructions (`smartsprosolutions@gmail.com` / `(318) 564-4360`). |
| Public files & zero source maps | `security/public-files.json` publishes the explicit static allowlist into `dist/`, including `assets/js/finish-early.js`. Server code (`server/`, `api/`, `.env.example`) and `.map` source maps are never copied into static `dist/` assets. |
| Automated security & compliance tests | `tests/security.test.mjs` and `scripts/browser-check.mjs` verify CSP compliance, wizard gating, locked appointment date/time enforcement during edits, unlimited verified add-on edits vs unverified rate limits, same-Reference-ID preservation, green `UPDATED` + ordered `What Was Added / Updated` + blue `Reference ID` owner email markup, `[UPDATED APPOINTMENT]` customer receipt + `customerEmailSent !== true` fail-closed handling, scrubbed `fallbackMailtoUrl` (no `finish-early` leak), overlapping `gcal` edit handling, and two-step `/api/finish-early` token verification. |

## Verification record

- Locally verified via `npm run build` (11/11 tests passing in `tests/security.test.mjs` + 26 approved public files built in `dist/`) and `node --check` on client/server scripts (`2026-11-18`). (`npm run test:browser` requires Chromium on the host OS.)
- Pending live verification on `https://www.smartsprosolutions.com`: deploy updated code to Vercel, switch the active Apps Script Web App deployment (`Deploy -> Manage deployments -> Edit -> Version: New version`) from `Version 3` to `Version 4`+ (`2026-11-v4`), verify customer receipt delivery, recurring weekly/monthly calendar events, locked edit time blocks, ordered green diff alerts, and duplicate-free Google Calendar replacement under the same Reference ID.

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

     function deleteBookingEventsByRefs_(cal, refCodes, dateHints) {
       const refs = [];
       for (let r = 0; r < refCodes.length; r++) {
         const code = String(refCodes[r] || '').trim();
         if (code && refs.indexOf(code) === -1) refs.push(code);
       }
       if (refs.length === 0) return 0;

       const deletedSeriesIds = {};
       const deletedEventIds = {};
       const candidates = [];

       const searchStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
       const searchEnd = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
       for (let r = 0; r < refs.length; r++) {
         const hits = cal.getEvents(searchStart, searchEnd, { search: refs[r] });
         for (let i = 0; i < hits.length; i++) {
           candidates.push(hits[i]);
         }
       }

       const seenDates = {};
       for (let d = 0; d < dateHints.length; d++) {
         const iso = String(dateHints[d] || '').trim();
         if (!iso || seenDates[iso]) continue;
         seenDates[iso] = true;
         const baseMs = new Date(iso + 'T12:00:00Z').getTime();
         if (!isNaN(baseMs)) {
           const dayStart = new Date(baseMs - 24 * 60 * 60 * 1000);
           const dayEnd = new Date(baseMs + 24 * 60 * 60 * 1000);
           const dayEvents = cal.getEvents(dayStart, dayEnd);
           for (let j = 0; j < dayEvents.length; j++) {
             candidates.push(dayEvents[j]);
           }
         }
       }

       let deletedCount = 0;
       for (let k = 0; k < candidates.length; k++) {
         const ev = candidates[k];
         try {
           const t = ev.getTitle() || '';
           const desc = ev.getDescription() || '';
           let matches = false;
           for (let r = 0; r < refs.length; r++) {
             if (t.indexOf(refs[r]) !== -1 || desc.indexOf(refs[r]) !== -1) {
               matches = true;
               break;
             }
           }
           if (!matches) continue;

           if (ev.isRecurringEvent()) {
             const series = ev.getEventSeries();
             const seriesId = series ? series.getId() : '';
             if (series && (!seriesId || !deletedSeriesIds[seriesId])) {
               if (seriesId) deletedSeriesIds[seriesId] = true;
               series.deleteEventSeries();
               deletedCount++;
             }
           } else {
             const evId = ev.getId ? ev.getId() : '';
             if (!evId || !deletedEventIds[evId]) {
               if (evId) deletedEventIds[evId] = true;
               ev.deleteEvent();
               deletedCount++;
             }
           }
         } catch (err) {
           // Event or series was already deleted
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

       const icsBlob = data.icsContent
         ? Utilities.newBlob(
             data.icsContent,
             'text/calendar; charset=UTF-8',
             data.icsFilename || 'smartspro-appointment.ics'
           )
         : null;

       // 1. Send Owner Notification Email (with green UPDATED / blue Ref ID highlights & Finish-Early link)
       MailApp.sendEmail({
         to: data.to || 'smartsprosolutions@gmail.com',
         name: 'Smarts Pro Solutions',
         replyTo: data.replyTo || '',
         subject: data.subject,
         body: data.textBody,
         htmlBody: data.htmlBody,
         attachments: icsBlob ? [icsBlob] : []
       });

       // 2. Send Customer Confirmation / Updated Receipt Email (tracked for fail-closed verification)
       let customerEmailSent = false;
       let customerEmailError = '';
       if (data.customerEmail && data.customerEmail.to) {
         try {
           MailApp.sendEmail({
             to: data.customerEmail.to,
             name: 'Smarts Pro Solutions',
             replyTo: data.customerEmail.replyTo || 'smartsprosolutions@gmail.com',
             subject: data.customerEmail.subject,
             body: data.customerEmail.textBody,
             htmlBody: data.customerEmail.htmlBody,
             attachments: icsBlob ? [icsBlob] : []
           });
           customerEmailSent = true;
         } catch (custErr) {
           customerEmailSent = false;
           customerEmailError = String(custErr && custErr.message ? custErr.message : custErr);
         }
       } else {
         customerEmailError = 'Missing customerEmail payload.';
       }

       // 3. Delete any previous event or recurring series matching the Reference ID before recreating
       let deletedOldCount = 0;
       if (data.isUpdated || data.previousReferenceCode || data.referenceCode) {
         deletedOldCount = deleteBookingEventsByRefs_(
           cal,
           [data.referenceCode || '', data.previousReferenceCode || ''],
           [data.previousDate || '', (data.appointment && data.appointment.preferredDate) || '']
         );
       }

       // 4. Create fixed time-block event (or recurring series for weekly / biweekly / monthly)
       if (data.appointment && data.appointment.startIso && data.appointment.endIso) {
         const startDt = new Date(data.appointment.startIso);
         const endDt = new Date(data.appointment.endIso);
         const updateNum = Number(data.updateCount || 0);
         const prefix = (data.isUpdated || data.previousReferenceCode)
           ? (updateNum > 1 ? '[UPDATED #' + updateNum + '] ' : '[UPDATED] ')
           : '';
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
         .createTextOutput(JSON.stringify({
           ok: true,
           scriptVersion: '2026-11-v4',
           referenceCode: data.referenceCode || '',
           ownerEmailSent: true,
           customerEmailSent: customerEmailSent,
           customerEmailError: customerEmailError,
           deletedOldCount: deletedOldCount
         }))
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
