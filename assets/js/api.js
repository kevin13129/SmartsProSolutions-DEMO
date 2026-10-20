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
})();
