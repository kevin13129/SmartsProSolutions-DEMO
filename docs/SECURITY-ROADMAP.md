# Security requirements for the next features

These are implementation and release requirements, not features that currently
exist. Keep online collection unavailable until its server-side safeguards,
storage, delivery and operational checks work. Choose the business providers and
policies before adding secrets or opening new network destinations.

## 1. Customer inquiries and booking requests

Proposed flow: browser → same-origin intake API → validated durable request →
private database → transactional outbox → approved email/CRM provider. Only
server code may call private database/CRM/mail APIs. Never put a reusable CRM
webhook URL or privileged database key in static code.

| Boundary | Required implementation | Required abuse/failure test |
| --- | --- | --- |
| Request parsing | POST JSON only; reject unsupported content types, unknown fields and oversized bodies (start at 16 KiB, including transport limit) | Oversized, malformed JSON, duplicate/unexpected fields, unsupported methods |
| Customer fields | Normalize bounded strings; proposed limits: name 120, phone 32, email 254, optional notes 1000 characters. Require name and at least one valid contact method. Preserve international names; reject control characters where inappropriate | Unicode names accepted; long/malformed/control-character data rejected without echoing it |
| Property inputs | Server schema: bedrooms 0–10, full baths 1–8, half baths 0–6, sqft 400–6000, integer add-ons within current UI limits; explicit service/frequency enums | Negative, fractional, nonfinite, missing, prototype-related and out-of-range values |
| Scheduling | Server validates future dates, business timezone, service area and availability; transaction/uniqueness prevents double booking | Past/invalid dates, timezone boundaries, concurrent attempts for one slot |
| Price and ownership | Recalculate from trusted versioned rates. Reject client totals, discounts, reference codes, owner IDs, role and status fields | Edited browser totals, forged customer IDs and discounts never change authoritative values |
| Abuse controls | Host WAF plus shared atomic rate limits, bounded queues, provider quotas and cost alerts. Start with a measured per-IP limit (for example 5 requests/10 minutes) plus global/contact limits and tune for shared networks | Concurrent requests across instances hit the same limit; outages reject safely; response uses 429 and Retry-After |
| Bot challenge | If needed, verify token server-side with provider, checking hostname, action, freshness and replay; an optional honeypot supplements this | Missing/forged/expired/replayed tokens rejected; challenge-provider failures cannot silently bypass checks |
| Browser boundary | Exact approved Origin/Fetch Metadata policy; cookie-authenticated mutations require CSRF tokens plus secure SameSite sessions. CORS is narrowly allowed or absent for same-origin calls | Foreign origins/preflights and cross-site cookie requests rejected; server validation still applies when Origin is spoofed/absent |
| Delivery and retries | Persist before showing receipt. Use bounded idempotency keys and payload binding, durable outbox, retry/backoff and deduplication. Expose a generic reference only after persistence succeeds | Double-click/network retries create one request; database/email failures do not fabricate delivery or create repeated mail |
| Output | Use text rendering/escaping, parameterized SQL, fixed mail recipients/templates, and validated headers | HTML/script, SQL and mail-header injection remain inert; errors disclose no stack traces or records |

Browser validation improves usability; it cannot enforce any of these rules.
An in-memory counter in a serverless function does not provide a shared rate
limit. CAPTCHA and CORS do not replace authorization. Trust client IP headers
only when the hosting proxy guarantees their provenance.

Initially collect name, one contact method, service area and non-sensitive
property requirements. Collect a street address only when needed for confirmed
service. Do not request alarm/gate codes, card details, passwords, IDs, health
information or unnecessary household schedules in free text. If access codes
later become operationally necessary, create a separate encrypted, time-limited
workflow restricted to assigned staff, with access audit and automatic deletion.

Publish an accurate privacy notice before collection, establish permitted uses,
retention/deletion periods and access responsibilities, and separate service
communications from optional marketing consent. Record consent text/version and
time where required. These business choices must be confirmed before launch;
do not invent a legal retention period or assume a phone field authorizes SMS.

## 2. Database and staff/customer access

- Use a managed identity provider and MFA for staff. Verify authentication and
  resource-level authorization on every API request. Start with owner/staff roles
  scoped to actual duties; include tenant scoping if more than one business is
  ever supported. UI visibility is never the permission check.
- Keep session credentials in `Secure`, `HttpOnly`, appropriately `SameSite`
  cookies; use short/idle expirations, rotation after login/privilege changes,
  revocation on logout/reset, throttled recovery and generic login errors. Do not
  store bearer tokens in localStorage or log them.
- Private customer tables must deny anonymous reads, writes, updates and deletes.
  For Supabase, enable and test RLS for each exposed table, view and storage
  bucket, using explicit policies. Privileged/service keys stay server-side;
  they bypass RLS and therefore require server authorization too. A publishable
  key is not an authorization mechanism. Do not add an anonymous insert policy
  that bypasses intake validation and rate limits. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Generate opaque, high-entropy IDs on the server. A display reference such as
  the old five-digit `SPS-#####` is not a credential. Self-service access needs
  authenticated ownership or a scoped, expiring, unguessable capability token;
  store token hashes and rate-limit redemption.
- Separate contact details, booking state, quotes, payments and restricted
  access instructions. Use constraints, parameterized queries and least-privilege
  service identities. Encrypt managed storage/backups and transport. Audit staff
  reads/exports and important state changes using record IDs and actor IDs.
- Logs, analytics, CSP reports and error trackers must redact contact details,
  full request bodies, access instructions, credentials and payment data. Set
  retention/access controls and alert on repeated failures and unusual exports.
- Exports require explicit authorization and an audit trail. Escape CSV quotes,
  separators and line breaks and neutralize formula-leading values (`=`, `+`,
  `-`, `@`, tab/CR prefixes); verify in supported spreadsheet applications.
  Prefer a typed spreadsheet format where appropriate. Use private expiring
  downloads and `no-store`, not data URLs or public buckets.
- If file uploads are introduced, enforce size/count/type limits on the server,
  inspect file signatures, rename objects, scan malware, store privately outside
  executable web paths, use short-lived signed access, and block active HTML/SVG
  unless a dedicated safe transformation exists.

Release tests must include two independent customer/staff identities, anonymous
direct API and database calls, cross-record ID substitution, expired/revoked
sessions, privilege escalation, export permissions, and backup restoration.

## 3. Payments and recurring charges

Use a provider-hosted checkout page as the initial integration design (Stripe is
one candidate; no provider is configured). Card entry belongs at the provider.
Do not add card-number/CVV fields to this site, transmit them through its API, or
store them in notes/logs. Hosted checkout reduces exposure; the business must
still confirm its applicable merchant/PCI obligations with its provider.
See [Stripe hosted Checkout](https://docs.stripe.com/checkout/quickstart).

1. The server creates a versioned quote from validated property/service inputs,
   integer minor-unit prices (cents), permitted discounts/taxes, currency, expiry
   and ownership. Business approval determines when an estimate becomes payable.
   Never trust the calculator, copied estimates, URL parameters or browser totals.
2. An authorized checkout request references that stored quote. The server checks
   ownership, expiry and payable state, then creates a provider checkout session
   with the authoritative amount and an idempotency key. Store its provider ID
   and expected amount/currency. Use configured return destinations, not an
   arbitrary user-supplied redirect. Limit attempts to reduce card-testing abuse.
3. A browser success redirect only displays pending/verified status retrieved
   from the server. It never marks a booking paid or triggers fulfillment.
4. A dedicated webhook endpoint verifies signatures over the **raw request body**
   using the official SDK, correct environment secret and timestamp tolerance.
   Limit payload size and event types. It has its own signature-based trust
   boundary, not browser CSRF/session rules. See [Stripe webhook guidance](https://docs.stripe.com/events/manage-webhook-endpoints).
5. Resolve the provider event against the stored order and verify merchant
   account, live/test mode, session/payment identifiers, amount, currency,
   customer relationship and current payment state. Handle asynchronous success
   and failure, refunds, disputes and out-of-order notifications explicitly.
6. Deduplicate event IDs durably and enforce allowed state transitions inside a
   database transaction. Retried/concurrent events cannot double-charge,
   double-credit or double-book. Return success after durable handling/queueing;
   failed persistence must remain retryable. Reconcile delayed/missed events
   against provider state; session expiry alone does not invalidate a verified
   late payment notification.
7. Refunds, discounts, subscription changes, account changes and payout actions
   require server-side permissions, audit records and reauthentication where
   appropriate. Document recurrence, cancellation and refund terms, explicit
   customer authorization and provider fraud/3DS controls before enabling charges.

Payment acceptance tests: price/currency tampering, expired and foreign quotes,
forged redirects/signatures, altered raw bodies, wrong provider account/test mode,
duplicate and concurrent events, out-of-order/delayed events, partial failures,
declines, refunds/disputes and cancellation. Never use real cards for tests.
The design follows [OWASP payment integration guidance](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Payment_Gateway_Integration_Cheat_Sheet.html).

## 4. Deployment gates as capabilities grow

Keep separate preview/test and production projects, restricted secret stores and
separate webhook secrets. Rotate credentials; do not compile secrets into public
files. Add external domains to CSP only for a tested feature's exact needs.
Hosted redirect checkout does not automatically require embedded payment frames
or the Payment Request API. Keep the public-output manifest and tests aligned
with intentional additions, including the introduction of server functions.

Before enabling each new capability, name its owner, verify incident/rollback
procedures, run the negative tests above, confirm observability and cost limits,
and recheck production response headers. Require an independent security review
before handling live payments or substantial sensitive customer data. Continue
patching, monitoring and review after launch; no one-time configuration can
promise that abuse will never occur.
