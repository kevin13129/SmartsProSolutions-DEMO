# Future implementation framework

Status: **design only — 2026-10-23**. No backend, account setup, schema migration,
request delivery, scheduling, payment, or photo collection is activated here.
Business decisions are tracked in [PROJECT-SCOPE.md](PROJECT-SCOPE.md) and the
[owner approval reminders](OWNER-APPROVAL-REMINDERS.md).
The [security roadmap](SECURITY-ROADMAP.md) defines mandatory release controls.

## Choose the operating model before building

For a tight budget, evaluate one hosted request form, owner email notifications,
a private shared calendar, and hosted invoices. Owners review and confirm jobs
manually. Check monthly costs, delivery/retry behavior, exports, access controls,
retention, and cancellation handling before choosing the provider. A hosted form
still needs verified server validation, abuse limits, durable request receipts,
privacy controls and delivery evidence. A generic success redirect is not proof
of receipt. If a provider cannot meet the security roadmap, it is not a shortcut
around those requirements. Keep intake unavailable until the reviewed route passes.

Carry scope selections into the chosen form once it is integrated. Use supported
structured prefilling or a reviewed server handoff; do not put personal data in
URLs, logs or browser storage. The owner may price a hosted request manually;
submitted browser totals must never become binding quotes automatically.
Document any proposed hosted architecture and equivalent protections before
changing the current same-origin custom-API design or CSP.

Choose custom development only if the owners want its operations and can fund
implementation, monthly services, maintenance and incident response. The user
will assist the owners in creating their own Vercel and Supabase accounts.
The existing local Vercel project link does **not** establish owner control or
prove a deployment. Verify ownership/billing and invite the developer; do not
share passwords or commit account recovery details.

## Custom configuration order

| Order | Component | Configure and verify later |
| --- | --- | --- |
| 1 | GitHub | Owner source access, feature branches, reviewed changes, protected default branch, documented build/deployment and recovery |
| 2 | Vercel | Owner project/billing, domain/DNS, `dist/` static hosting, separate preview/production, server endpoints, server-only environment variables, access/cost controls |
| 3 | Supabase database | Customers, properties, requests, versioned quotes, visits, consent, notification/outbox state; migrations, constraints, permissions, RLS, backups and restore tests |
| 4 | Supabase Auth | Invite-only approved staff accounts, MFA, server-checked roles and protected owner dashboard; no customer login for initial contact |
| 5 | Supabase Storage | Private job/customer photos only if separately commissioned; controlled uploads, authorization, expiring access and deletion |
| 6 | Email provider | Verified sending domain, SPF/DKIM/DMARC, fixed templates, acknowledgment/confirmation/reminder delivery, deduplication, retries, failure visibility |
| 7 | Payment provider | Owner merchant account, hosted invoices/payment pages, server-verified payment status; card data stays at the provider |

Supabase secret/service-role credentials can bypass RLS and must stay server-side;
server authorization is still required for privileged calls. Private tables deny
anonymous access. Test allowed staff roles as well as cross-record and anonymous
denials. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
Photos use private buckets and authorized or limited-duration signed access;
a public bucket is inappropriate. See [Supabase bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Scope contract already available in the browser

`SmartsProCurrentQuote.selection` is a version-1 **in-memory, untrusted** snapshot.
`assets/js/estimate-model.js` supplies it alongside the same summary used by the
screen, recap, print and copy actions. There is no send function or persistence.
Future request UI should reuse this selection and ask only for the additional
contact information and consent it actually needs. Allow review/edit before
submission. A reload currently clears selections.

| Field | Current shape / interpretation |
| --- | --- |
| `schemaVersion` | `1`; server explicitly accepts supported versions |
| `serviceType` | `residential`, `commercial`, or `airbnb`; empty until chosen |
| `frequency` | Explicit choice allowed for that service; reset on service change |
| `property` | `sqft`; residential/Airbnb also include bedrooms, full baths, half baths |
| `requirements` residential | Cleaning level, condition, pets |
| `requirements` commercial | Building use, restrooms, floor-type array, preferred walkthrough period |
| `requirements` Airbnb | Beds to remake, laundry, restocking, checkout/check-in local times |
| `addons` | Active service's selected `{ id, quantity }` entries only; no client prices |

Current UI bounds: size 400–6,000 sq ft, bedrooms 0–10, full baths 1–8, half baths
0–6, beds to remake 0–20, commercial restrooms 0–50. Fridge/oven quantities are
0–5; pet detailing, dishwashing, glass/breakroom/floor extras are single choices.
These are preview limits, not statements of crew capacity. Larger/out-of-range
work needs owner assessment. Define production ranges deliberately and apply
them on the server as well. Unknown/mismatched fields and extras must be rejected.
Airbnb times need a date and property timezone before checking a real turnover
window; the preview does not claim that a window is feasible or available.

## Proposed custom request transaction

1. Accept a bounded, versioned POST with the scope snapshot, minimal contact
   details, consent version and a request idempotency key. Validate types, enums,
   sizes, service area and service-specific fields; apply abuse/origin controls.
2. Reject client totals, roles, owner/customer IDs and booking/payment states.
   Recalculate residential estimates using trusted versioned server rates and
   integer cents. Buildup, commercial and Airbnb remain assessment-required;
   their price is unset until owner review.
3. In one transaction, save the request, consent, scope snapshot, rate version
   when relevant, and notification outbox entries. Bind retries to the same
   payload/idempotency key. Commit before returning a receipt.
4. Return a generic opaque reference and “Request received; this is not a
   confirmed appointment.” Only show that message after durable success. A failed
   save must show a truthful retry path without losing entered details in memory.
5. Deliver the customer acknowledgment and owner alert through an outbox worker.
   Retry transient failures with deduplication; show permanent failures to owners.
   Do not claim email delivery just because the request was saved.

## Data and owner actions

| Entity | Responsibility |
| --- | --- |
| Customers / properties | Minimal contact and property scope; private, linked records |
| Requests | Immutable submitted scope snapshot, review state, idempotency binding |
| Quotes | Versioned owner-approved scope, price in cents, currency, expiry and customer acceptance |
| Visits | Confirmed window, crew capacity, status and schedule version |
| Consent records | Purpose, notice version and timestamp; marketing kept separate |
| Notification outbox | Template/event, record ID, schedule version, attempts, status and provider reference |
| Invoices / payment events | Provider references and verified amounts/status; no card details |
| Audit records | Authorized actor, record ID and action; avoid personal payloads in logs |

Dashboard actions: **review, quote, confirm, reschedule, cancel and complete**.
Every action needs server authorization, valid state transitions, concurrency
handling and an audit record. Keep quote acceptance, visit status, notification
delivery and payment status separate. An accepted quote is not itself a confirmed
appointment. Confirm only after owner approval, customer acceptance, agreed
requirements and a transactionally available crew window. Treat the two-person
crew as the scheduling resource until owners explicitly change capacity.

## Future iteration and payment implementation notes

Use these implementation notes when introducing customer intake and payments in
future iterations:

1. **Reuse `window.SmartsProCurrentQuote.selection` for intake:**
   `assets/js/estimate-model.js` already constructs an in-memory `schemaVersion: 1`
   payload with active service fields and `{ id, quantity }` add-ons while omitting
   all client-calculated dollar totals. Future intake (`POST /api/requests`) should
   submit this `selection` snapshot alongside minimal contact fields (`name`, `phone`
   or `email`, `serviceArea`, `consentVersion`) and a client-generated `idempotencyKey`.
2. **Share deterministic integer-cent pricing logic on the server:**
   Keep `assets/js/estimate-model.js` aligned with a server-side pricing module
   that computes residential estimates in integer minor units (`4000` cents/hr
   standard, `5000` cents/hr deep/move-in-out, `11000` cents minimum) tagged with
   an explicit `rateVersion`. Never trust client-submitted totals; keep buildup,
   heavy condition, commercial, and Airbnb unpriced (`null`) until owner assessment.
3. **Roll out payments in two low-risk stages:**
   - **Stage A — Provider-hosted invoices (fastest path):** Send hosted invoices
     (e.g., Stripe Invoicing or Square Invoices) after owner review or job
     completion. This requires **no changes** to the static site's CSP
     (`connect-src 'none'`, `frame-src 'none'`, `payment=()`) and no checkout
     endpoints on the marketing site.
   - **Stage B — Server-created Hosted Checkout redirect:** When adding on-site
     payment initiation (`POST /api/checkout`), open only `connect-src 'self'` in
     `vercel.json`. Hosted redirect checkout still does not require third-party
     `frame-src` or `Permissions-Policy: payment=()` changes because card entry
     happens on the payment provider's hosted domain.
4. **Verify checkout sessions and webhooks against server state:**
   - Create provider checkout sessions only from an owner-approved, non-expired
     server `quotes` record (`status === 'accepted'`) using the server's
     `amount_cents`, `currency`, an idempotency key, and fixed server-configured
     return URLs.
   - Treat browser return URLs (`?session_id=...`) as read-only status lookups
     with `Cache-Control: no-store`; never mark a booking paid from a browser redirect.
   - Verify webhook signatures over the **raw request body** with timestamp
     tolerance. Inside a database transaction, deduplicate `provider_event_id`,
     verify `livemode`, merchant account, `amount_received === expected_amount_cents`,
     and `currency`, and transition `payments.status` independently of `visits.status`.
5. **Preserve strict CSP DOM patterns during UI updates:**
   When modifying UI visibility (such as the `.tab-btn` service filter in
   `assets/js/main.js`), prefer toggling `element.hidden` (matching
   `assets/js/calculator.js` and `[hidden]` in `assets/css/security.css`) rather
   than assigning `element.style.display` so DOM serialization stays free of inline
   style attributes under `style-src-attr 'none'`.

## Proposed communication sequence

| Trigger | Action / guard |
| --- | --- |
| Request saved | Customer acknowledgment plus owner alert; receipt is not confirmation |
| Owner approves quote | Send versioned scope and price for customer acceptance |
| Quote accepted and requirements met | Owner confirms appointment and calendar entry after conflict check |
| Before appointment | Preparation/reminder email for the current confirmed schedule version |
| Job completed | Send hosted invoice; send receipt only after verified payment |
| After service | Neutral feedback/review request without incentives or rating-based filtering |
| Appointment changed or canceled | Update/cancel calendar entry and invalidate outdated reminders; communicate the change |

Manual workflows must perform the same checks and cancellations using the selected
tools. Custom scheduling should enqueue/update calendar events durably, retry
failures, and have reminder workers recheck visit status/version at send time.
Cancellation must prevent already-queued obsolete reminders from sending. Nothing
in this table is currently sending emails or creating calendar events.

Release evidence belongs in [ACCEPTANCE-HANDOVER.md](ACCEPTANCE-HANDOVER.md) and
the security handoff, with implemented, tested, deployed and live-verified states
recorded separately.
