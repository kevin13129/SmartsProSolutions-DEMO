# Security handoff: read this first

Last updated: **2026-11-26**. This is the quick entry point for future models and
developers. Detailed controls live in the linked baseline and roadmap; keep
those documents authoritative rather than duplicating their full requirements.

## Current state in one minute

- The owner requested security foundations before customer-facing customization.
- Business pricing, intake & scheduling terms confirmed by the owner (2026-11-04 through 2026-11-26):
  - **No Online Payments & 50% Deposit Required In Person**: The business is **not** collecting online payments, deposits, or card details on the website (`onlinePaymentEnabled: false`), and all customer/owner notices clearly state that a **50% deposit is required in person** for the service.
  - **Customer Hours Hidden + Priority Focus Levels + Starting From Add-Ons + Extra Living Room + Service Details**: Customer-facing UI, confirmation messages, automated owner/customer emails, and `.ics` descriptions remove all estimated hours and `/hr` labels (framing Specific Areas `1–6` at `+$50/level` as **Priority Focus** `Level 1`–`Level 6`), while keeping internal `durationMinutes`/`totalEstimatedHours` for calendar time-block checks. Step 2 includes an **Extra Living Room** stepper (`0–4`, `0.5 hr` weight, locked on edit). Step 5 includes **Details on what you may need done** (`serviceDetails`, plain text `<= 500` chars with URL/phishing & payment-card guards) and 8 `"Starting from"` custom add-ons (`fridge: $54.99`, `fridgeDouble: $64.99`, `oven: $61.88`, `laundry: $48.98/load` — wash, dry, and fold, `organizing: $29.60/area` as **Organizing per Area**, `dishes: $24.78`, `windows: $8 ea` up to `30`, `powerWashWindows: $25/set` as **Power Wash Window Sets** up to `30`), all cent-rounded on client and server and protected by non-downgrade floors (`400 DOWNGRADE_NOT_PERMITTED`).
  - **Minimum Job & Stackable Specific Areas Add-On**: `$50` minimum job charge; `2,000 sq ft` 3B/2F Standard Clean anchors at `$250` Weekly and Deep Clean anchors at `$330` Weekly. **Specific Areas Add-On** (`Level 1–6` at `+$50/level`) stacks **on top of** the selected base service instead of replacing the base service or hiding property dimensions.
  - **Commercial Walkthrough Custom Quote (`Custom Quote at Walkthrough`)**:
    - For **Commercial & Offices** (`serviceCategory === 'commercial'`), both browser and server omit dollar price estimates and display **`Custom Quote at Walkthrough`** (`basePrice: 0`, `frequencySurcharge: 0`, `grandTotal: 0`, `customQuoteAtWalkthrough: true`, `priceDisplay: 'Custom Quote at Walkthrough'`), while preserving `durationMinutes: 180` for calendar window checks.
    - Step 2 of 2 (Commercial Frequency) shows cadence labels without dollar price tags (`Preferred`, `Every 2 Weeks`, `Multi-Day`, `Monthly`, `Single Visit`, `After-Hours`), and customers book their walkthrough appointment so the owner settles the price with them in person (with a 50% deposit required in person once finalized).
  - **Weekly-Anchor Hybrid Schedule Pricing (`2026-11-weekly-anchor-hybrid-v2`)**:
    - For non-commercial categories (`residential`, `moveinout`, `airbnb`), `weekly` (`+$0`) and `turnover` (`+$0`) keep the anchor baseline price.
    - Less frequent non-commercial schedules apply `Math.max(flatMin, Math.round(basePrice * pct))`: `biweekly` `max($30, 12%)`, `monthly` `max($50, 20%)`, and `onetime` `max($65, 26%)`. Server recalculates `frequencySurcharge` authoritatively and rejects any client-tampered `frequencySurcharge`.
  - **Commercial-Only Overnight Scheduling (`400 OVERNIGHT_COMMERCIAL_ONLY`)**:
    - An **Overnight** option appears exclusively when `serviceCategory === 'commercial'`, hidden and blocked for `residential`, `moveinout`, and `airbnb`.
    - Commercial Overnight opens three **Mon–Fri preset night windows** (`18:00-22:00` 6:00 PM – 10:00 PM, `21:00-01:00` 9:00 PM – 1:00 AM, and `23:00-03:00` 11:00 PM – 3:00 AM) as a **single tentative calendar slot** (`isRecurring: false`, midnight rollover handled in `.ics` `DTEND`, `endIso`, and post-midnight `/api/finish-early`), instructing the customer to contact the owner at `(318) 564-4360` / `smartsprosolutions@gmail.com` for access, keys, alarm codes, and final scope.
  - **Fixed Calendar Time Blocks & Estimated Cleaning Time**: All daytime weekday time blocks (`8:00 AM – 11:00 AM`, `11:00 AM – 2:00 PM`, `2:00 PM – 4:30 PM`) and Commercial overnight windows keep fixed boundaries on Google Calendar, `.ics` invites, and the website scheduler, isolated so daytime bookings do not block overnight slots and vice versa.
  - **In-Place Google Calendar Updates + Recurring Appointments + Customer Confirmation Emails**:
    - Selecting `weekly`, `biweekly`, or `monthly` creates a recurring Google Calendar series (`FREQ=WEEKLY`, `FREQ=WEEKLY;INTERVAL=2`, `FREQ=MONTHLY` in `.ics` `RRULE` and Apps Script `createEventSeries`) and projects recurring holds across the 2-month booking window. (`overnight` is single tentative, non-recurring.)
    - Confirmed bookings dispatch **two** separate emails: an owner notification email to `smartsprosolutions@gmail.com` (with Finish-Early control) and a separate customer confirmation email (`customerEmail`, with zero owner-only Finish-Early links).
    - Editing a booking via `updateToken` passes `previousReferenceCode`, `previousDate`, and `previousFrequency` so Apps Script (`2026-11-v5`) updates existing Google Calendar events and `CalendarEventSeries` **in place** (`setTitle()` / `setDescription()`) whenever frequency is unchanged—eliminating async delete-then-recreate disappearance on repeated Weekly/Bi-Weekly/Monthly edits—and deletes extras + sleeps + post-verifies creation only when frequency actually changes.
  - **Same Reference ID, Locked Time Blocks, Anti-Abuse Upgrade Floor & 24-Hour Cutoff (`updateToken`)**:
    - Confirmed bookings receive an HMAC-signed `updateToken` (`kind: 'update'`) keeping the **exact same `referenceCode`** (`SPS-...`) across every edit and locking the customer's reserved appointment date and time block (`400 APPOINTMENT_TIME_LOCKED` on client and server; customers call `(318) 564-4360` to reschedule a day/time).
    - **Upgrade & Add Only Floor (`400 DOWNGRADE_NOT_PERMITTED`)**: Once an appointment is confirmed, customers can only add appliances, add Specific Areas levels (`+$50/level`), add Pet Detailing (`+$35`), or update notes. Base service tier (`Standard` vs `Deep` vs `Move-In/Out`), home dimensions (bedrooms, full/half baths, sq ft), schedule frequency, and already-confirmed add-ons are locked as a floor and cannot be lowered or removed online.
    - **24-Hour Last-Minute Edit Cutoff (`400 EDIT_WINDOW_CLOSED_24H`)**: Online edits lock 24 hours before the scheduled appointment start time in `America/Chicago` so a customer cannot make surprise last-minute scope changes right before the crew arrives.
    - **Customer Identity & Slot Hijacking Protection (`403 CUSTOMER_IDENTITY_LOCKED`)**: First Name, Last Name, Phone Number, and Email Address are locked (`readOnly`) in Edit Mode and cryptographically bound in `updateToken` (`emH`, `phH`, `nmH`). Unverified requests without a valid `updateToken` can never overwrite an existing slot even if they guess the customer's email (`409 SLOT_ALREADY_BOOKED`).
    - **Strict Token Domain Separation (`kind: 'finish_early'` vs `kind: 'update'`)**: `/api/finish-early` strictly requires `kind === 'finish_early'` (`400 INVALID_TOKEN_TYPE`), preventing a customer from passing their `updateToken` to the owner's Finish-Early endpoint to cancel or shorten a calendar block.
    - Verified `updateToken` edits are exempt from the strict `5 requests / 10 minutes` new-booking spam cap (guarded instead by a `60 / 10 min` edit burst cap), so real customers can add appliances or Specific Areas levels multiple times without hitting `429` or `409` self-blocking, while unverified new submissions remain strictly capped by IP and email.
  - **Green `UPDATED` + Ordered Diff List + Blue `Reference ID` Owner Alerts & `[UPDATED APPOINTMENT]` Customer Receipts**:
    - Each `updateToken` embeds a compact non-PII snapshot (`snap`) of the prior service, Specific Areas add-on levels/details, home specs, add-ons, pets, notes hash, identity hashes (`emH`, `phH`, `nmH`), and total so edited bookings send owner emails to `smartsprosolutions@gmail.com` with green `UPDATED` status banners (`#16A34A` / `#DCFCE7`), a numbered **What Was Added / Updated** breakdown (`+ ADDED` / `UPDATED` items in green), blue `Reference ID` badges (`#1D4ED8` / `#DBEAFE`), and Finish-Early links.
    - Verified `updateToken` edits use overlap matching against remote Google Calendar (`gcal`) intervals so varying calendar event end times on the customer's locked date/window never trigger false `409 SLOT_ALREADY_BOOKED` errors.
    - Customers receive a reset `[UPDATED APPOINTMENT]` receipt email listing their additions/updates, `Previous Total`, `Updated Total`, all current options/add-ons, locked appointment date/time block, and `.ics` calendar attachment (with zero owner-only Finish-Early links).
  - **Fail-Closed Delivery Boundary & Zero-Leak Fallback**: If neither `RESEND_API_KEY` nor `EMAIL_WEBHOOK_URL` is configured (`503 EMAIL_PROVIDER_UNCONFIGURED`), if an Apps Script webhook returns HTML instead of JSON, or if Apps Script reports `customerEmailSent !== true` (`502 EMAIL_DISPATCH_FAILED`), `/api/estimate-request` fails closed with an `ACTION REQUIRED • AUTOMATED EMAIL INCOMPLETE` banner and a Retry button when no confirmed `updateToken` exists, and returns a scrubbed pre-addressed `mailto:` link (never containing owner-only Finish-Early URLs) and `.ics` calendar download.
- Security and intake changes are implemented and tested locally. **Pending live deployment push and Apps Script `Manage deployments` update to `2026-11-v5` on the owner's Google account.**

## What changed and where

| Area | Implementation and reason |
| --- | --- |
| Customer intake, locked-edit time UI & live calendar | `assets/js/booking-modal.js`, `assets/css/security.css`, `assets/js/calculator.js`, `assets/js/api.js`, and `index.html` enforce step-by-step completion before scheduling, present the Review Estimate & Pick a Time modal as a two-column desktop layout (pinned Estimate Summary receipt card on the left, scheduling + contact form on the right) with a mobile-collapsed Estimate Summary drawer (`#modal-recap-toggle`), an iOS-style vertical scroll-snap Mon–Fri date wheel (`#calendar-date-grid.calendar-date-wheel`, `#btn-wheel-prev`/`#btn-wheel-next`) paired beside Arrival Windows (perpetual current + next month rollover including December → next year & leap years), live green validation checkmarks (`document.createElementNS` SVGs) on valid First Name, Last Name, US Phone, and Email inputs, and a pinned sticky bottom bar (`#modal-sticky-footer`) displaying the chosen slot, total, and smart CTA. For Commercial walkthroughs (`serviceCategory === 'commercial'`), displays `Custom Quote at Walkthrough` without dollar price tags on Step 4 frequency cards or summary totals. Preserves Weekly-anchor hybrid pricing for non-commercial tiers, Commercial-only Overnight Mon–Fri night windows, stackable Specific Areas (`Level 1–6` with zero hour labels), Upgrade & Add Only floor, locked `readOnly` contact fields & locked appointment date/window on edit (`#calendar-locked-banner`), 24-hour `America/Chicago` edit cutoff, and honest delivery-failure fallback. Zero raw HTML sinks, `data:` CSS URLs, or inline styles. |
| Server intake, same-Ref edits, anti-abuse guards & `updateToken` | `server/intake-service.mjs`, `api/calendar-availability.mjs`, `api/estimate-request.mjs`, and `api/finish-early.mjs` enforce `docs/SECURITY-ROADMAP.md` Section 1 controls, calculate `WEEKLY_ANCHOR_HYBRID_PRICING` (`2026-11-weekly-anchor-hybrid-v2`) authoritatively (returning `Custom Quote at Walkthrough` / `grandTotal: 0` / `customQuoteAtWalkthrough: true` for Commercial walkthroughs), block non-commercial `overnight` requests (`400 OVERNIGHT_COMMERCIAL_ONLY`), handle midnight-crossing `DTEND`/`endIso` and post-midnight `/api/finish-early`, keep `overnight` single tentative (`isRecurring: false`), add Specific Areas (`+$50/level`) cleanly on top of the base service price, preserve the exact same `referenceCode` across verified edits while tracking `updateCount`, `previousTotal`, `previousFrequency`, and compact `snap` diffs, enforce Upgrade & Add Only (`400 DOWNGRADE_NOT_PERMITTED`), enforce the 24-hour edit cutoff (`400 EDIT_WINDOW_CLOSED_24H`), enforce customer identity hash binding (`403 CUSTOMER_IDENTITY_LOCKED`), block unverified same-email slot overwrites (`409 SLOT_ALREADY_BOOKED`), enforce strict `kind: 'finish_early'` vs `kind: 'update'` token separation (`400 INVALID_TOKEN_TYPE`), derive a deterministic HMAC fallback secret across serverless instances, reject date/window tampering (`400 APPOINTMENT_TIME_LOCKED`), highlight `UPDATED` + numbered `What Was Added / Updated` items in green and `Reference ID` in blue for owner emails, send `[UPDATED APPOINTMENT]` or `[TENTATIVE OVERNIGHT REQUEST]` customer receipts, scrub `finishEarlyUrl` strictly out of customer `fallbackMailtoUrl` drafts, fail closed when `customerEmailSent !== true` or HTML responses occur, and handle `/api/finish-early`. |
| Google Business Profile showcase & strict `frame-src 'none'` CSP | `index.html`, `assets/css/styles.css`, `vercel.json`, and `404.html` render a full-width static Google Business Profile card (`#google-profile`) with outbound `rel="noopener noreferrer"` links to the verified Google Business Profile (`https://share.google/qxRaiWqPZy8jyHRL2`) and zero map embeds or third-party map API calls, restoring strict `frame-src 'none'` across all CSP policies. |
| Legal, privacy, refund, cookie & 18+ policies | `index.html` includes an accessible `#legal-privacy-policies` footer drawer covering the Privacy & Data Minimization Policy, Terms of Service, strict No-Refunds Policy, Zero-Cookie / Zero-Tracker Policy, 18+ Age Policy, and Data Deletion / Email Opt-Out instructions (`smartsprosolutions@gmail.com` / `(318) 564-4360`). |
| Public files & zero source maps | `security/public-files.json` publishes the explicit static allowlist into `dist/`, including `assets/js/finish-early.js`. Server code (`server/`, `api/`, `.env.example`) and `.map` source maps are never copied into static `dist/` assets. |
| Automated security & compliance tests | `tests/security.test.mjs` and `scripts/browser-check.mjs` verify strict CSP compliance (`frame-src 'none'`, zero external script/connect/frame origins), static Google Business Profile link integrity, wizard gating, Weekly-anchor hybrid schedule scaling (`+0%`, `max($30, 12%)`, `max($50, 20%)`, `max($65, 26%)`, Airbnb `turnover` `$0`), Commercial walkthrough `Custom Quote at Walkthrough` pricing & non-price cadence badges, Commercial-only Overnight visibility & server fail-closed checks (`400 OVERNIGHT_COMMERCIAL_ONLY`), midnight-crossing `.ics` / post-midnight `/api/finish-early`, remote `doGet` overnight interval isolation, stackable Specific Areas (`+$50/level`, zero hour labels), Upgrade & Add Only floor, 24-hour edit cutoff, customer identity lock, unverified same-email overwrite rejection, token crossover rejection, same-Reference-ID preservation, `[UPDATED APPOINTMENT]` & `[TENTATIVE OVERNIGHT REQUEST]` email/receipt flows, scrubbed `fallbackMailtoUrl`, vertical date wheel stepping, mobile collapsible estimate summary, live contact validation checkmarks, sticky modal summary bar, and `/api/finish-early`. |

## Verification record

- Locally verified (`2026-11-26`) via `node --check assets/js/*.js server/*.mjs`, `npm run build` (`13/13` unit/integration tests + `26` approved public files built in `dist/`), and `CHROME_PATH=/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell npm run test:browser` (`4/4` Chrome CDP checks passed: calculator with Extra Living Room / 8 Starting From add-ons / Service Details / 50% in-person deposit / removed customer hours, two-column Review Estimate modal with vertical scroll-snap date wheel / live green contact checkmarks / mobile collapsible summary / sticky bottom bar, Commercial `Custom Quote at Walkthrough` & Overnight schedule preference without dollar prices, desktop + mobile screenshots with zero horizontal overflow, local fonts, CSP attack probes, JS-disabled check, and `/api/finish-early` strict CSP check).
- Pending live verification on `https://www.smartsprosolutions.com`: deploy updated code to Vercel and confirm Google Apps Script deployment (`2026-11-v5`) is active on the owner's Google account.

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
           const endDate = Utilities.formatDate(f, TZ, 'yyyy-MM-dd');
           const startH = Number(Utilities.formatDate(s, TZ, 'H'));
           const startM = Number(Utilities.formatDate(s, TZ, 'm'));
           const endH = Number(Utilities.formatDate(f, TZ, 'H'));
           const endM = Number(Utilities.formatDate(f, TZ, 'm'));
           let endMinutes = endH * 60 + endM;
           if (endDate !== date) {
             endMinutes += 1440;
           }
           return {
             date: date,
             startMinutes: startH * 60 + startM,
             endMinutes: endMinutes
           };
         });
       return ContentService
         .createTextOutput(JSON.stringify({ ok: true, busyIntervals: busyIntervals }))
         .setMimeType(ContentService.MimeType.JSON);
     }

     function findMatchingBookingItems_(cal, refCodes, dateHints) {
       const refs = [];
       for (let r = 0; r < refCodes.length; r++) {
         const code = String(refCodes[r] || '').trim();
         if (code && refs.indexOf(code) === -1) refs.push(code);
       }
       if (refs.length === 0) return [];

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

       const seenSeriesIds = {};
       const seenEventIds = {};
       const matches = [];
       for (let k = 0; k < candidates.length; k++) {
         const ev = candidates[k];
         try {
           const t = ev.getTitle() || '';
           const desc = ev.getDescription() || '';
           let hasRef = false;
           for (let r = 0; r < refs.length; r++) {
             if (t.indexOf(refs[r]) !== -1 || desc.indexOf(refs[r]) !== -1) {
               hasRef = true;
               break;
             }
           }
           if (!hasRef) continue;

           if (ev.isRecurringEvent()) {
             const series = ev.getEventSeries();
             const seriesId = series ? series.getId() : '';
             if (series && (!seriesId || !seenSeriesIds[seriesId])) {
               if (seriesId) seenSeriesIds[seriesId] = true;
               matches.push({
                 isSeries: true,
                 id: seriesId,
                 series: series,
                 event: ev,
                 title: t,
                 description: desc
               });
             }
           } else {
             const evId = ev.getId ? ev.getId() : '';
             if (!evId || !seenEventIds[evId]) {
               if (evId) seenEventIds[evId] = true;
               matches.push({
                 isSeries: false,
                 id: evId,
                 series: null,
                 event: ev,
                 title: t,
                 description: desc
               });
             }
           }
         } catch (err) {
           // Ignore inaccessible event
         }
       }
       return matches;
     }

     function deleteMatchedItems_(items) {
       let count = 0;
       for (let i = 0; i < items.length; i++) {
         const item = items[i];
         try {
           if (item.isSeries && item.series) {
             item.series.deleteEventSeries();
             count++;
           } else if (item.event) {
             item.event.deleteEvent();
             count++;
           }
         } catch (err) {
           // Already deleted
         }
       }
       return count;
     }

     function createBookingEventOrSeries_(cal, summary, startDt, endDt, freq, options) {
       if (freq === 'weekly') {
         const weeklyRule = CalendarApp.newRecurrence().addWeeklyRule();
         return cal.createEventSeries(summary, startDt, endDt, weeklyRule, options);
       } else if (freq === 'biweekly') {
         const biweeklyRule = CalendarApp.newRecurrence().addWeeklyRule().interval(2);
         return cal.createEventSeries(summary, startDt, endDt, biweeklyRule, options);
       } else if (freq === 'monthly') {
         const monthlyRule = CalendarApp.newRecurrence().addMonthlyRule();
         return cal.createEventSeries(summary, startDt, endDt, monthlyRule, options);
       }
       return cal.createEvent(summary, startDt, endDt, options);
     }

     function verifyCreatedEventExists_(cal, refCode, startDt, endDt) {
       if (!refCode) return true;
       const winStart = new Date(startDt.getTime() - 60000);
       const winEnd = new Date(endDt.getTime() + 60000);
       const check = cal.getEvents(winStart, winEnd);
       for (let i = 0; i < check.length; i++) {
         const t = check[i].getTitle() || '';
         const d = check[i].getDescription() || '';
         if (t.indexOf(refCode) !== -1 || d.indexOf(refCode) !== -1) {
           return true;
         }
       }
       return false;
     }

     function syncBookingCalendarEvent_(cal, data) {
       if (!data.appointment || !data.appointment.startIso || !data.appointment.endIso) {
         return { mode: 'skipped', deletedOldCount: 0, verifiedExists: false };
       }

       const startDt = new Date(data.appointment.startIso);
       const endDt = new Date(data.appointment.endIso);
       const updateNum = Number(data.updateCount || 0);
       const prefix = (data.isUpdated || data.previousReferenceCode)
         ? (updateNum > 1 ? '[UPDATED #' + updateNum + '] ' : '[UPDATED] ')
         : '';
       const summary = prefix + 'Smarts Pro Cleaning [' + data.referenceCode + ']';
       const freq =
         (data.recurrence && data.recurrence.frequency) ||
         (data.quote && data.quote.frequency) ||
         'onetime';
       const wantsRecurring = freq === 'weekly' || freq === 'biweekly' || freq === 'monthly';
       const descriptionText = 'Ref: ' + data.referenceCode + '\nFreq: ' + freq + '\n' + (data.textBody || '');
       const options = { description: descriptionText };

       const matches = findMatchingBookingItems_(
         cal,
         [data.referenceCode || '', data.previousReferenceCode || ''],
         [data.previousDate || '', data.appointment.preferredDate || '']
       );

       if (matches.length > 0) {
         const primary = matches[0];
         let prevFreq = String(data.previousFrequency || '').trim();
         if (!prevFreq && primary.description) {
           const m = primary.description.match(/^Freq:\s*([a-z]+)/m);
           if (m && m[1]) prevFreq = m[1];
         }
         const freqChanged = Boolean(prevFreq && prevFreq !== freq);

         // Update existing event/series IN PLACE when recurrence frequency hasn't changed.
         // Avoids Google Calendar deleting/shadowing newly recreated weekly series in the same execution.
         if (!freqChanged && primary.isSeries === wantsRecurring) {
           const extraDeleted = matches.length > 1 ? deleteMatchedItems_(matches.slice(1)) : 0;
           try {
             if (primary.isSeries && primary.series) {
               primary.series.setTitle(summary);
               primary.series.setDescription(descriptionText);
             } else if (primary.event) {
               primary.event.setTitle(summary);
               primary.event.setDescription(descriptionText);
             }
             return { mode: 'updated_in_place', deletedOldCount: extraDeleted, verifiedExists: true };
           } catch (inPlaceErr) {
             // Fall through to clean delete + recreate below if series became inaccessible
           }
         }
       }

       const deletedCount = matches.length > 0 ? deleteMatchedItems_(matches) : 0;
       if (deletedCount > 0) {
         Utilities.sleep(1500);
       }

       createBookingEventOrSeries_(cal, summary, startDt, endDt, freq, options);
       Utilities.sleep(400);
       let verified = verifyCreatedEventExists_(cal, data.referenceCode, startDt, endDt);
       if (!verified) {
         Utilities.sleep(1200);
         createBookingEventOrSeries_(cal, summary, startDt, endDt, freq, options);
         Utilities.sleep(400);
         verified = verifyCreatedEventExists_(cal, data.referenceCode, startDt, endDt);
       }
       return { mode: 'recreated', deletedOldCount: deletedCount, verifiedExists: verified };
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
               if (ev.isRecurringEvent()) {
                 const ser = ev.getEventSeries();
                 if (ser) ser.deleteEventSeries();
                 else ev.deleteEvent();
               } else {
                 ev.deleteEvent();
               }
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

       // 3. Synchronize Google Calendar in place (or delete + recreate if recurrence changed)
       const calResult = syncBookingCalendarEvent_(cal, data);

       return ContentService
         .createTextOutput(JSON.stringify({
           ok: true,
           scriptVersion: '2026-11-v5',
           referenceCode: data.referenceCode || '',
           ownerEmailSent: true,
           customerEmailSent: customerEmailSent,
           customerEmailError: customerEmailError,
           deletedOldCount: calResult.deletedOldCount,
           calendarSyncMode: calResult.mode,
           calendarVerified: calResult.verifiedExists
         }))
         .setMimeType(ContentService.MimeType.JSON);
     }
     ```
   - Click **Deploy -> Manage deployments -> Edit -> Version: New version** (keeping `Execute as: Me` and `Who has access: Anyone`) so your existing `EMAIL_WEBHOOK_URL` immediately serves the updated script (`2026-11-v5`). In Vercel, ensure `EMAIL_WEBHOOK_URL`, `FINISH_EARLY_SECRET` (random 32+ char string), and `PUBLIC_SITE_URL=https://www.smartsprosolutions.com` are saved.
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
