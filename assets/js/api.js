/**
 * Privacy boundary for the static preview. There is no intake service yet.
 * Do not add browser database keys, CRM webhooks, or local lead persistence.
 * See docs/SECURITY-ROADMAP.md before enabling customer intake.
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

  // Legacy callers must never receive a fabricated booking confirmation.
  window.SmartsProBackend = Object.freeze({
    intakeAvailable: false,
    async submitBooking() {
      return Object.freeze({
        success: false,
        code: 'INTAKE_UNAVAILABLE',
        message: 'Online requests are not available. Please call (318) 564-4360.'
      });
    }
  });

  /**
   * Groundwork Dispatch, Calendar & Payment Framework (Non-PII Architecture)
   * Prepares structured workflow routing for:
   * 1. Commercial Walkthrough Requests -> Calendar slot + Owner email bid alert
   * 2. Residential / Move / Airbnb Requests -> Owner review & confirmation email alert + Calendar hold + Payment stage
   * Remains offline (no network calls or PII storage) until server controls in docs/SECURITY-ROADMAP.md are active.
   */
  const PIPELINES = Object.freeze({
    COMMERCIAL_WALKTHROUGH: Object.freeze({
      id: 'commercial_walkthrough_pipeline',
      title: 'Commercial Walkthrough & Custom Bid Workflow',
      label: 'Commercial Walkthrough & Facility Bid',
      summary: 'Commercial requests route to the owner for an on-site walkthrough calendar slot and custom facility proposal.',
      calendarAction: 'Request On-Site Facility Walkthrough Slot',
      ownerAlertAction: 'Email Owner: Commercial Walkthrough & Frequency Request',
      paymentAction: 'Custom Commercial Proposal & Net/Monthly Invoicing',
      stages: Object.freeze([
        Object.freeze({
          title: '1. Service & Frequency Selected',
          detail: 'Commercial scope and preferred service schedule recorded'
        }),
        Object.freeze({
          title: '2. Walkthrough Calendar Slot',
          detail: 'Tentative facility walkthrough window queued for owner confirmation'
        }),
        Object.freeze({
          title: '3. Owner Bid Notification',
          detail: 'Email alert sent to owner to confirm walkthrough & issue custom proposal'
        })
      ]),
      steps: Object.freeze([
        '1. Service & Frequency Selected',
        '2. Walkthrough Calendar Slot (Pending Server Integration)',
        '3. Instant Owner Email Notification to Confirm Walkthrough'
      ])
    }),
    RESIDENTIAL_REVIEW: Object.freeze({
      id: 'residential_review_confirm_pipeline',
      title: 'Residential Review, Calendar Hold & Payment Workflow',
      label: 'Residential Owner Review & Calendar Confirmation',
      summary: 'Owner is alerted to review property specs & additional information, confirm the tentative calendar window, and unlock online payment confirmation.',
      calendarAction: 'Place Tentative Cleaning Window Hold on Calendar',
      ownerAlertAction: 'Email Owner: Review Property Scope & Confirm Booking',
      paymentAction: 'Owner Approval Triggers Customer Payment Link',
      stages: Object.freeze([
        Object.freeze({
          title: '1. Property Scope & Additional Info',
          detail: 'Service tier, property details, and condition answers captured'
        }),
        Object.freeze({
          title: '2. Owner Alert & Calendar Hold',
          detail: 'Owner reviews specs and confirms tentative arrival window'
        }),
        Object.freeze({
          title: '3. Confirmed Price & Payment Link',
          detail: 'Approved booking releases final confirmation and payment link'
        })
      ]),
      steps: Object.freeze([
        '1. Property Scope & Instant Estimate Completed',
        '2. Owner Alerted to Review & Confirm Calendar Availability',
        '3. Confirmed Price & Secure Payment Link Sent After Review'
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

    return Object.freeze({
      schemaVersion: '2026-10-groundwork-v2',
      intakeEnabled: false,
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
      additionalInfo: Object.freeze({
        hasPets: addInfo.hasPets || '',
        lastCleaned: addInfo.lastCleaned || '',
        occupancy: addInfo.occupancy || '',
        condition: addInfo.condition || ''
      }),
      estimatedHours: Number(calc.estimatedHours) || 0,
      estimatedTotal: Number(calc.grandTotal) || 0,
      adapters: Object.freeze({
        calendarManagement: 'PENDING_SERVER_ADAPTER',
        ownerEmailNotification: 'PENDING_SERVER_ADAPTER',
        paymentCheckout: 'PENDING_SERVER_ADAPTER'
      })
    });
  }

  window.SmartsProDispatchFramework = Object.freeze({
    intakeAvailable: false,
    pipelines: PIPELINES,
    getWorkflowPlan,
    buildJobEnvelope
  });
})();
