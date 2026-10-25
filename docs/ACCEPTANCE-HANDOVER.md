# Acceptance and handover checklist

Status: **future release checklist — 2026-10-21**. Unchecked items are pending.
Local preview checks do not establish a working request or booking system.
The referenced PDF was not supplied with this repository/task; this checklist
captures the requirements provided in the request and must be reconciled with
that PDF when available. Do not claim the PDF was reviewed.

## Scope and approval gate

- [ ] Record the single approving owner, reviewed revision and date.
- [ ] Approve services, inclusions/exclusions, prices, taxes/fees, policies and
  supported website statements in [PROJECT-SCOPE.md](PROJECT-SCOPE.md).
- [ ] Approve final phone and desktop design, including the wordmark and imagery.
- [ ] Sign the $400 scope, any separately priced features, revision allowance,
  operating budget, support dates and future-change pricing method.
- [ ] Disclose the $80 Google profile setup service separately from Google's
  free product. Owner remains primary owner; developer is a manager.

## Owners' phone rehearsal before launching purchased workflows

Use synthetic test information and provider test modes. Both owners should be
able to perform their daily actions. Do not mark this done using preview buttons.

1. Submit and receive a request carrying every selected scope field and extra.
2. Receive the owner alert; locate the durable request if email fails.
3. Review the request and send a defined scope and price for acceptance.
4. Record acceptance, verify requirements/capacity, then confirm the appointment.
5. Reschedule and verify calendar changes and removal of obsolete reminders.
6. Complete the job and issue the hosted invoice.
7. Record verified test payment, locate the receipt, and send neutral feedback.

Record the date, revision, provider/test environment, tester, outcome and
follow-up for each step. If automation is out of scope, demonstrate the manual
procedure instead. Do not require paid custom features for a hosted/manual launch.

## Acceptance cases

| Area | Pass evidence required before its release |
| --- | --- |
| Mobile usability | Usable controls/navigation, keyboard focus, no page overflow, readable scope and totals on owner phones |
| Explicit choices | No initial service/frequency; correct service details/extras; incompatible choices cleared on switch |
| Price consistency | Screen, recap, print, copy, request scope and server estimate agree; quantity, minimum and rounding cases included |
| Pricing approach | Residential condition handling; no automatic commercial/Airbnb rate; owner-approved final quote |
| Submission failures | Offline/timeout, validation, storage and notification failures are truthful; edits can be retained safely in memory for retry |
| Duplicate requests | Double tap, retry and concurrent requests produce one durable request and one notification per event |
| Schedule conflicts | Conflicting requests/confirmations cannot reserve the same crew capacity; timezone and date boundaries checked |
| Email delivery | Verified sender, acknowledgment vs confirmation, inbox delivery, retry/backoff and visible permanent failures |
| Photos, if commissioned | Anonymous/cross-record access denied; expired links, upload constraints and deletion verified; no public bucket |
| Changes and cancellations | Calendar entries updated; old queued reminders canceled or rejected by current status/version |
| Payments, if commissioned | Hosted entry; server-verified amount, ownership and payment; duplicate/forged/delayed events tested |
| Data and access | Staff permissions/RLS, private exports, retention/deletion, logs and restore tests from the security roadmap |
| Deployment | Build and browser tests; actual production origin/header verification; host/account checklist completed |

Every new customer-data capability must also pass its negative tests in
[SECURITY-ROADMAP.md](SECURITY-ROADMAP.md). A failed check needs a fix and a new
result, not an exemption hidden in documentation.

## Handover package

- [ ] Owner-controlled accounts and billing: GitHub, hosting, domain registrar,
  chosen request/calendar/invoice providers; Supabase/email/payment if selected.
- [ ] Source/deployment access, domain/DNS inventory, production hostname,
  rollback instructions and account roles; no passwords in the repository.
- [ ] Short screen recording of request review, quotes, confirmation,
  rescheduling/canceling, completion, invoice/receipt lookup and delivery failures.
- [ ] Price-update instructions: edit the approved versioned rate sheet, implement
  matching trusted server rules, test representative totals, review and deploy;
  preserve already accepted quote versions. Preview rates currently live in
  `assets/js/estimate-model.js` and are not payment authority.
- [ ] Export instructions for the selected provider; custom exports need owner
  authorization, audit and safe file handling. The preview stores no records to export.
- [ ] Written support start/end dates, scope and response expectations; written
  method for quoting future changes and separate ongoing monitoring responsibility.
- [ ] Owner's written final website acceptance, version/date and any exclusions.
- [ ] Remove obsolete developer access, verify owner recovery access and retain
  only agreed maintenance permissions.

## Signoff record (complete later)

| Field | Value |
| --- | --- |
| Approving owner / date | Pending |
| Accepted revision and production origin | Pending |
| Purchased integration and separately commissioned features | Pending |
| Test evidence and unresolved exceptions | Pending |
| Account/billing ownership verified | Pending |
| Training recording and instructions delivered | Pending |
| Support start/end and future-change terms | Pending |
| Final written acceptance location | Pending; keep private documents out of source control |
