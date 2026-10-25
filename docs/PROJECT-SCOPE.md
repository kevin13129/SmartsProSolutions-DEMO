# Project scope and owner decisions

Status: **draft for owner approval — 2026-10-21**. This records the proposed
agreement and launch gates, not a signed contract or an operational booking
system. The current deliverable is the static website groundwork and scope
preview. Read [SECURITY-HANDOFF.md](SECURITY-HANDOFF.md) first.

## One approval owner

Designate one business owner to consolidate feedback and approve services,
prices, policies, website statements, and final design. The crew consists of
the two owners; use **crew** in customer communications. Initial contact must
not require a customer account.

| Decision | Required record | Current status |
| --- | --- | --- |
| Final approver | Owner name, approval date, reviewed revision | Pending |
| Services | Residential levels; commercial and Airbnb scope; exclusions | Draft options only |
| Prices | Rate sheet, minimum, extras, discounts, taxes/fees, effective date | Existing residential demo rates retained provisionally |
| Service area and capacity | Actual areas, working hours, travel limits, crew availability | Pending |
| Policies | Cancellation/reschedule window and charges, access, refunds, quote expiry, acceptance requirements | Pending; no assumed 24-hour policy |
| Website statements | Evidence and approved wording, including images and implied claims | Unsupported statements removed; review still required |
| Design and content | Desktop/mobile revision and written approval | Pending |
| Monthly operating budget | Spending cap, providers, owner billing contact, alerts | Pending |
| Delivery agreement | Scope, revision allowance, support dates, changes and payment terms | Proposed below; pending approval |

Do not publish insurance, bonding, screening, product-safety, health,
inspection-readiness, history, or specialist/industrial capability statements
without evidence that supports the exact wording and presentation. Record an
evidence reference, reviewer, approval date, and review/expiry date privately;
do not put policies, personal records, or sensitive documents in this repository.
FTC guidance addresses both literal and implied advertising claims.
See [FTC advertising guidance](https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business).

## Proposed $400 website package

The **$400 is a website implementation fee**, subject to written agreement on
the scope below. It is not a promise to supply a custom booking platform or
unlimited ongoing work. Confirm any earlier promises before accepting this scope.

| Included in the proposed base scope | Completion condition |
| --- | --- |
| Responsive website | Agreed existing single-page layout usable on phone and desktop |
| Approved content | One owner supplies/approves services, policies, contact details and supported statements |
| Consistent estimator | Agreed residential rates and matching itemized screen, recap, print and copy summaries; commercial/Airbnb assessment routes |
| One working request integration | One agreed hosted workflow passes the security and delivery gates; currently **not implemented** |
| Basic search setup | Accurate title/description, crawlability and canonical/domain settings after the production hostname is known; no ranking promise |
| Testing | Relevant local checks, production verification, and owner acceptance for purchased capabilities |
| Training and handover | Short daily-task recording, written instructions, account/access handover and final signoff |

Separate written estimates are required for a custom dashboard, custom backend,
live scheduling, payment automation, advanced photo workflows, migrations,
additional pages/integrations, or changes outside the approved scope. A custom
request endpoint and its operational security are not silently included in a
basic hosted-form integration. Confirm the exception if already promised.

Domain renewal, hosting/form subscriptions, database/storage, email, calendar,
payment-processing charges, and ongoing maintenance are owner-paid operating
costs, separate from implementation. Record provider quotes and the approved
monthly cap before selecting plans; no paid account has been purchased here.

Proposed support: **14 calendar days after accepted handover for defects within
the signed scope**, with start/end dates and response expectations agreed before
launch. This is a proposal, not an existing commitment. New features, content or
price updates after acceptance, ongoing monitoring, and provider changes require
a written change order. Record a fixed quote or agreed hourly rate before that
work; no future-change rate has been approved. Agree revision rounds and payment
milestones before implementation beyond this groundwork.

## Pricing rules awaiting approval

| Service | Proposed approach |
| --- | --- |
| Residential | Estimate from size, bedrooms/bathrooms, cleaning level, condition, pets and selected extras; owners confirm scope, price and availability before booking |
| Commercial | Walkthrough first; defined per-visit rate or monthly agreement after review |
| Airbnb | Property-specific flat turnover rate after assessing and timing work, including beds, laundry, stock and turnaround window |

Monthly means **monthly**, not a four-week schedule. Frequency is a preference,
not a charge authorization or reserved slot. No service or frequency is chosen
automatically. Switching service clears frequency and extras. Condition requiring
more than routine upkeep routes to assessment rather than an invented surcharge.
Pets are a scope detail; pet-hair detailing is a separate optional extra.

The residential formula in `assets/js/estimate-model.js` uses the user's requested
**$40/hour standard and $50/hour deep** rates as of 2026-10-22. Move-in/out uses
$50/hour with a longer time allowance. This preview assumes one hourly rate for
the whole crew, without a headcount multiplier; confirm that billing basis with
the owners before launch. Size and rooms determine estimated hours, shown with
the hourly rate in every summary. See [pricing assumptions](PRICING-NOTES.md) for
the exact formula, local references and worked examples. Time allowances need
calibration against timed jobs; final business price approval is still pending.

Weekly/every-two-weeks/monthly adjustments remain 20%/15%/10%; one-time has no
adjustment. The $110 cleaning minimum and all extras remain unchanged: $65 single
fridge, $75 double fridge, $80 oven, and $35 pet detailing once per visit. Each
monetary line is rounded to cents before totaling. Do not use the browser model
as trusted billing code. Taxes and other fees require an owner decision before launch.

## Google Business Profile setup

The proposed **$80 is a setup-service charge paid to the developer**.
Google Business Profile itself is free. Disclose this on the proposal/invoice;
do not describe the fee as a Google fee or guarantee verification or rankings.
See [Google's Business Profile information](https://www.google.com/business/).

The owner retains primary ownership and grants the developer manager access
using separate accounts. See [Google's owner and manager roles](https://support.google.com/business/answer/3403100).
For a home-based business that does not receive customers at home, use the
appropriate service-area profile and hide the residential address. Confirm the
real operating model before configuring it; see [Google's representation guidelines](https://support.google.com/business/answer/3038177).
No profile has been created, verified, or changed in this work.

Next: [implementation framework](IMPLEMENTATION-FRAMEWORK.md) and
[acceptance and handover](ACCEPTANCE-HANDOVER.md).
