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
      title: 'Residential Review, Calendar Sync & Two-Stage Payment Workflow',
      label: 'Residential Owner Review, Calendar Sync & 50%/50% Payment',
      summary: 'Owner is alerted by email with calendar sync to review property specs & additional information, release the 50% non-refundable deposit link (flat rate, no refunds policy), and collect the remaining 50% balance upon job completion.',
      calendarAction: 'Place Tentative Cleaning Window Hold & Sync Calendar to Owner Email',
      ownerAlertAction: 'Email Owner: Review Property Scope, Sync Calendar & Confirm Booking',
      paymentAction: 'Two-Stage Payment: 50% Non-Refundable Deposit to Book + 50% Balance at Job Completion (No Refunds Policy)',
      stages: Object.freeze([
        Object.freeze({
          title: '1. Property Scope & Additional Info',
          detail: 'Service tier, property details, and condition answers captured at flat-rate pricing (no recurring discounts)'
        }),
        Object.freeze({
          title: '2. Owner Email Alert & Calendar Sync',
          detail: 'Owner receives email summary with calendar event hold to review specs and approve arrival window'
        }),
        Object.freeze({
          title: '3. 50% Non-Refundable Deposit (Locks Booking)',
          detail: 'Approved booking sends 50% deposit link (strict no refunds policy) and locks the calendar slot on owner email'
        }),
        Object.freeze({
          title: '4. Job Completion & Remaining 50% Balance',
          detail: 'Upon service completion, the remaining 50% balance invoice/charge is triggered to close out the job'
        })
      ]),
      steps: Object.freeze([
        '1. Property Scope & Flat-Rate Estimate Completed',
        '2. Owner Email Alert & Calendar Window Sync',
        '3. 50% Non-Refundable Deposit Invoice Sent After Review (No Refunds Policy)',
        '4. Remaining 50% Balance Collected Upon Job Completion'
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
    const depositAmount =
      typeof calc.depositAmount === 'number'
        ? calc.depositAmount
        : Math.round(total * 0.5 * 100) / 100;
    const remainingBalance =
      typeof calc.remainingBalance === 'number'
        ? calc.remainingBalance
        : Math.round((total - depositAmount) * 100) / 100;

    return Object.freeze({
      schemaVersion: '2026-11-groundwork-v4',
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
      pricingModel: 'FLAT_RATE_NO_RECURRING_DISCOUNTS',
      recurringDiscountRate: 0,
      depositRate: 0.5,
      refundPolicy: 'NO_REFUNDS',
      paymentPlan: Object.freeze({
        depositStage: Object.freeze({
          rate: 0.5,
          amount: depositAmount,
          trigger: 'ON_OWNER_BOOKING_APPROVAL',
          refundable: false
        }),
        completionStage: Object.freeze({
          rate: 0.5,
          amount: remainingBalance,
          trigger: 'ON_JOB_COMPLETION'
        })
      }),
      additionalInfo: Object.freeze({
        hasPets: addInfo.hasPets || '',
        lastCleaned: addInfo.lastCleaned || '',
        occupancy: addInfo.occupancy || '',
        condition: addInfo.condition || ''
      }),
      estimatedHours: Number(calc.estimatedHours) || 0,
      estimatedTotal: total,
      estimatedDeposit: depositAmount,
      estimatedBalance: remainingBalance,
      adapters: Object.freeze({
        calendarToEmailSync: 'PENDING_SERVER_ADAPTER',
        ownerEmailNotification: 'PENDING_SERVER_ADAPTER',
        depositCheckout: 'PENDING_SERVER_ADAPTER',
        completionBalanceCollection: 'PENDING_SERVER_ADAPTER'
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
