# Owner Approval Reminders & Pending Decisions

Last updated: **2026-10-23**. Use this standalone checklist during your next
meeting with the business owners. Keep customer intake and payments disabled
until the relevant items below are approved and their server controls in
[SECURITY-ROADMAP.md](SECURITY-ROADMAP.md) are implemented.

## 1. Single Approving Owner & Agreement Scope

- [ ] **Designate one approving owner:** Record the single owner responsible for
  consolidating feedback and signing off on pricing, policies, copy, and final
  design (see [PROJECT-SCOPE.md](PROJECT-SCOPE.md)).
- [ ] **Sign the $400 base website agreement:** Confirm the included deliverables,
  revision allowance, 14-day post-handover defect support window, and how future
  change orders or custom features will be quoted.
- [ ] **Optional $80 Google Business Profile setup:** Confirm whether the owners
  want this setup service (disclosed as a developer setup fee for Google's free
  product, using a hidden-address service-area profile with the owner as Primary
  Owner and developer as Manager).

## 2. Residential Pricing & Formula Sign-Off

Current preview assumptions live in `assets/js/estimate-model.js` and
[PRICING-NOTES.md](PRICING-NOTES.md):

- [ ] **Hourly crew rate basis:** Confirm **$40/hour Standard** and **$50/hour
  Deep / Move-in-out** are the total rate for the **two-owner crew together**
  (not multiplied per person).
- [ ] **Estimated time allowances:** Confirm or calibrate the planning formula:
  - `1.5 hours` base common areas
  - `+0.25 hours` per bedroom
  - `+0.50 hours` per full bathroom
  - `+0.25 hours` per half bathroom
  - `+0.50 hours` per `500 sq ft` above `1,000 sq ft`
  - Multipliers: `1.0x` Standard, `1.5x` Deep, `1.75x` Move-in/out (rounded up
    to the next quarter hour)
- [ ] **Minimum & recurring adjustments:** Confirm the **$110 minimum** and
  recurring discounts (**20% Weekly**, **15% Every 2 weeks**, **10% Monthly**,
  **0% One-time**), where "Monthly" means once per calendar month.
- [ ] **Fixed residential extras:** Confirm **$65** single refrigerator, **$75**
  double/French-door refrigerator, **$80** inside oven, and **$35** pet-hair
  detailing (flat add-ons that do not add extra base-cleaning hours).
- [ ] **Condition threshold:** Confirm that "Visible buildup" and "Heavy
  cleaning" should continue routing to **Assessment needed** rather than showing
  an automated surcharge.
- [ ] **Taxes and fees:** Confirm whether local/state sales tax or travel fees
  apply to residential, commercial, or Airbnb services in Caddo/Bossier Parish.

## 3. Commercial & Airbnb Scope Rules

- [ ] **Commercial workflow:** Confirm that all commercial inquiries require a
  walkthrough first, followed by a custom per-visit rate or monthly agreement.
- [ ] **Airbnb / STR workflow:** Confirm that short-term rental turnovers require
  an initial property assessment and timing check before setting a flat turnover
  rate, and confirm maximum turnover capacity (beds, laundry, restocking).
- [ ] **Property size & room bounds:** Confirm whether the calculator's current
  UI bounds (`400–6,000 sq ft`, `0–10` bedrooms, `1–8` full baths, `0–6` half
  baths, `0–20` Airbnb beds, `0–50` commercial restrooms) match what the crew
  wants to self-estimate vs. route to manual assessment.

## 4. Operating Model, Budget & Future Payments

- [ ] **Choose Phase 2 intake architecture** (see [IMPLEMENTATION-FRAMEWORK.md](IMPLEMENTATION-FRAMEWORK.md)):
  - **Option A (Hosted / Manual):** One vetted hosted request form + email
    notifications + shared calendar + provider-hosted invoices (e.g., Stripe or
    Square Invoicing sent after review/completion).
  - **Option B (Custom Stack):** Custom Vercel API + Supabase database/auth +
    transactional email outbox + Stripe Hosted Checkout (requires a separate
    custom development quote and ongoing hosting/maintenance budget).
- [ ] **Monthly operating budget:** Record the owners' approved monthly spending
  cap and billing contact before setting up paid hosting, email, form, database,
  or payment accounts.
- [ ] **Owner-controlled accounts:** Assist the owners in creating/verifying
  their own GitHub, Vercel, domain registrar, email, and payment accounts with
  MFA/passkeys enabled.

## 5. Business Policies, Legal Notices & Branding

- [ ] **Service policies:** Confirm cancellation/reschedule notice windows and
  fees, quote expiration period (e.g., 7 or 14 days), payment due timing,
  refund/satisfaction handling, and property access procedures.
- [ ] **Privacy & communications:** Confirm the privacy notice text, customer
  record retention/deletion period, and whether the crew will use phone/email
  only or also request separate opt-in SMS consent.
- [ ] **Checklist & copy approval:** Approve the Standard vs. Deep vs.
  Move-in/out task table and service descriptions in `index.html`.
- [ ] **Substantiated claims only:** If the owners want to advertise insurance,
  bonding, background checks, or specific product/health claims later, record
  private proof and exact approved wording before adding them to the site.
- [ ] **Final visual sign-off:** Approve the desktop/mobile layout, text
  wordmark, and `assets/images/brand-mark.svg` icon.
