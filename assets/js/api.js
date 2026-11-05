/**
 * SMARTS PRO SOLUTIONS — BROWSER API & AUTOMATED EMAIL / CALENDAR DISPATCH CLIENT
 * Connects the browser estimate calculator and appointment calendar picker to
 * the same-origin server endpoints (/api/calendar-availability & /api/estimate-request).
 * Never stores personal data in browser storage or exposes secrets/CRM keys in client code.
 */
(function () {
  'use strict';

  // Remove only this app's legacy demo records, without reading or logging PII.
  // A visitor must load this release on the same origin for cleanup to run.
  try {
    localStorage.removeItem('smartspro_leads_v1');
  } catch {
    // Storage may be disabled. The site does not require it.
  }

  /**
   * Generates a client-side idempotency token for safe retry deduplication.
   */
  function generateIdempotencyKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `sps-${crypto.randomUUID()}`;
    }
    return `sps-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  /**
   * Fetches upcoming cleaning bookings (anonymized) and open arrival windows from the server.
   */
  async function fetchCalendarAvailability() {
    if (typeof fetch !== 'function') {
      return Object.freeze({
        ok: false,
        code: 'FETCH_UNAVAILABLE',
        message: 'Network client is not available in this environment.'
      });
    }
    try {
      const response = await fetch('/api/calendar-availability', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!response.ok) {
        return Object.freeze({
          ok: false,
          code: `HTTP_${response.status}`,
          message: 'Unable to load live schedule availability.'
        });
      }
      const data = await response.json();
      return Object.freeze({
        ok: true,
        data
      });
    } catch {
      return Object.freeze({
        ok: false,
        code: 'NETWORK_ERROR',
        message: 'Unable to reach schedule service.'
      });
    }
  }

  /**
   * Submits a completed estimate, selected calendar window, and customer contact details
   * (First Name, Last Name, Phone, Email, Additional Notes) to the same-origin server endpoint.
   * Strips any browser-computed price totals so the server always recalculates authoritatively.
   */
  async function submitEstimateRequest(payload, customIdempotencyKey) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !payload.customer ||
      !payload.appointment ||
      !payload.quote ||
      typeof fetch !== 'function'
    ) {
      return Object.freeze({
        success: false,
        code: 'INVALID_REQUEST',
        message: 'Please complete your estimate, appointment window, and contact details.'
      });
    }

    const q = payload.quote;
    const addInfo = q.additionalInfo || {};
    const addons = q.addons || {};

    const cleanBody = {
      customer: {
        firstName: String(payload.customer.firstName || '').trim(),
        lastName: String(payload.customer.lastName || '').trim(),
        phone: String(payload.customer.phone || '').trim(),
        email: String(payload.customer.email || '').trim(),
        notes: String(payload.customer.notes || '').trim()
      },
      appointment: {
        preferredDate: String(payload.appointment.preferredDate || '').trim(),
        preferredWindow: String(payload.appointment.preferredWindow || '').trim()
      },
      quote: {
        serviceCategory: String(q.serviceCategory || 'residential'),
        serviceType: String(q.serviceType || 'standard'),
        propertyType: String(q.propertyType || ''),
        scopeMode: String(q.scopeMode || 'full'),
        specificAreasText: String(q.specificAreasText || ''),
        specificHours: Number(q.specificHours) || 2,
        bedrooms: Number(q.bedrooms) || 3,
        fullBaths: Number(q.fullBaths) || 2,
        halfBaths: Number(q.halfBaths) || 0,
        sqft: Number(q.sqft) || 1800,
        additionalInfo: {
          hasPets: String(addInfo.hasPets || ''),
          lastCleaned: String(addInfo.lastCleaned || ''),
          occupancy: String(addInfo.occupancy || ''),
          condition: String(addInfo.condition || '')
        },
        frequency: String(q.frequency || 'biweekly'),
        addons: {
          fridge: Number(addons.fridge) || 0,
          fridgeDouble: Number(addons.fridgeDouble) || 0,
          oven: Number(addons.oven) || 0,
          pets: Number(addons.pets) || 0
        }
      },
      companyWebsite: String(payload.companyWebsite || '')
    };

    const idempotencyKey = customIdempotencyKey || generateIdempotencyKey();

    try {
      const response = await fetch('/api/estimate-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        credentials: 'same-origin',
        body: JSON.stringify(cleanBody)
      });

      const result = await response.json().catch(() => ({
        success: false,
        code: 'INVALID_SERVER_RESPONSE',
        message: 'Unexpected response from server.'
      }));

      return Object.freeze({
        ...result,
        httpStatus: response.status
      });
    } catch {
      return Object.freeze({
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Network error while sending your estimate. Please try again or call (318) 564-4360.'
      });
    }
  }

  // Legacy submitBooking remains fail-closed so unvalidated callers never receive a fake confirmation.
  window.SmartsProBackend = Object.freeze({
    intakeAvailable: true,
    onlinePaymentsEnabled: false,
    fetchCalendarAvailability,
    submitEstimateRequest,
    async submitBooking() {
      return Object.freeze({
        success: false,
        code: 'INTAKE_UNAVAILABLE',
        message: 'Use submitEstimateRequest with validated quote and appointment parameters.'
      });
    }
  });

  /**
   * Dispatch & Calendar Workflow Framework (No Online Payment Collection)
   * Models:
   * 1. Commercial Walkthrough Requests -> Calendar slot + Automated Owner Email Bid Alert
   * 2. Residential / Move / Airbnb Requests -> Calendar slot + Automated Owner Email Estimate Summary
   */
  const PIPELINES = Object.freeze({
    COMMERCIAL_WALKTHROUGH: Object.freeze({
      id: 'commercial_walkthrough_pipeline',
      title: 'Commercial Walkthrough & Custom Bid Email Workflow',
      label: 'Commercial Walkthrough & Facility Bid',
      summary: 'Your facility frequency, preferred walkthrough date & arrival window, contact info, and notes are emailed directly to Smarts Pro Solutions.',
      calendarAction: 'Select Facility Walkthrough Date & Arrival Window',
      ownerAlertAction: 'Automated Email to Business Owner (First & Last Name, Phone, Email, Notes)',
      paymentAction: 'No Online Payment — Custom Commercial Proposal Issued After Walkthrough',
      stages: Object.freeze([
        Object.freeze({
          title: '1. Select Walkthrough Date & Window',
          detail: 'View upcoming bookings and choose an open arrival window on the schedule'
        }),
        Object.freeze({
          title: '2. Enter Contact Details & Notes',
          detail: 'Provide First & Last Name, Phone Number, Email, and any facility notes'
        }),
        Object.freeze({
          title: '3. Automated Owner Email & Calendar Invite',
          detail: 'Sends your walkthrough request and .ics calendar appointment to smartsprosolutions@gmail.com'
        })
      ])
    }),
    RESIDENTIAL_REVIEW: Object.freeze({
      id: 'residential_review_confirm_pipeline',
      title: 'Automated Estimate Email & Calendar Appointment Workflow',
      label: 'Automated Owner Email & Calendar Scheduling (No Online Payment)',
      summary: 'When you complete your estimate, choose an open cleaning window and enter your contact details & notes. Your full estimate and appointment request are emailed directly to Smarts Pro Solutions.',
      calendarAction: 'Select Cleaning Date & Arrival Window (Shows Upcoming Bookings)',
      ownerAlertAction: 'Automated Email to Business Owner (First & Last Name, Phone, Email, Notes & Estimate)',
      paymentAction: 'No Online Payment Required — Flat-Rate Estimate Reviewed by Owner',
      stages: Object.freeze([
        Object.freeze({
          title: '1. Check Upcoming Bookings & Pick a Window',
          detail: 'See which upcoming cleaning slots are already booked and choose an open arrival window'
        }),
        Object.freeze({
          title: '2. Enter Contact Info & Cleaning Notes',
          detail: 'Provide your First & Last Name, Phone Number, Email, and any special instructions'
        }),
        Object.freeze({
          title: '3. Instant Email & Calendar Dispatch',
          detail: 'Sends your flat-rate estimate, notes, and calendar appointment directly to our business email'
        })
      ])
    })
  });

  function getWorkflowPlan(quoteState) {
    const category = quoteState && quoteState.serviceCategory ? quoteState.serviceCategory : 'residential';
    if (category === 'commercial') {
      return PIPELINES.COMMERCIAL_WALKTHROUGH;
    }
    return PIPELINES.RESIDENTIAL_REVIEW;
  }

  function buildJobEnvelope(quoteSnapshot) {
    const state = (quoteSnapshot && quoteSnapshot.state) || {};
    const calc = (quoteSnapshot && quoteSnapshot.calculation) || {};
    const workflow = getWorkflowPlan(state);
    const addInfo = state.additionalInfo || {};
    const total = Number(calc.grandTotal) || 0;

    return Object.freeze({
      schemaVersion: '2026-11-email-calendar-v5',
      intakeEnabled: true,
      onlinePaymentEnabled: false,
      workflow,
      pipelineId: workflow.id,
      pipelineTitle: workflow.title,
      calendarAction: workflow.calendarAction,
      ownerAlertAction: workflow.ownerAlertAction,
      paymentAction: workflow.paymentAction,
      serviceCategory: state.serviceCategory || 'residential',
      serviceType: state.serviceType || 'standard',
      propertyType: state.propertyType || 'house',
      scopeMode: state.scopeMode || 'full',
      frequency: state.frequency || 'biweekly',
      pricingModel: 'FLAT_RATE_NO_RECURRING_DISCOUNTS',
      paymentPolicy: 'NO_ONLINE_PAYMENT_REQUIRED',
      recurringDiscountRate: 0,
      additionalInfo: Object.freeze({
        hasPets: addInfo.hasPets || '',
        lastCleaned: addInfo.lastCleaned || '',
        occupancy: addInfo.occupancy || '',
        condition: addInfo.condition || ''
      }),
      estimatedHours: Number(calc.estimatedHours) || 0,
      estimatedTotal: total,
      adapters: Object.freeze({
        calendarAvailabilityFeed: '/api/calendar-availability',
        ownerEmailAndCalendarDispatch: '/api/estimate-request',
        onlinePaymentCollection: 'DISABLED_BY_OWNER_POLICY'
      })
    });
  }

  window.SmartsProDispatchFramework = Object.freeze({
    intakeAvailable: true,
    onlinePaymentEnabled: false,
    pipelines: PIPELINES,
    getWorkflowPlan,
    buildJobEnvelope
  });
})();
