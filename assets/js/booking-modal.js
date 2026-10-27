/**
 * SMARTS PRO SOLUTIONS - ESTIMATE RECAP & DISPATCH GROUNDWORK MODAL CONTROLLER
 * Displays the current display-only estimate, property type, and the architectural
 * dispatch workflow (Commercial Walkthrough Request vs. Residential Owner Review).
 * Customer intake remains disabled until server-side controls are implemented.
 */

(function () {
  'use strict';

  const modalOverlay = document.getElementById('booking-modal-overlay');
  const btnOpenModal = document.getElementById('btn-book-quote-now');
  const btnCloseModal = document.getElementById('modal-close-btn');
  const modalBookingTitle = document.getElementById('modal-booking-title');

  const recapService = document.getElementById('modal-recap-service');
  const recapPropTypeRow = document.getElementById('modal-recap-proptype-row');
  const recapPropType = document.getElementById('modal-recap-proptype');
  const recapSpecsLabel = document.getElementById('modal-recap-specs-label');
  const recapSpecs = document.getElementById('modal-recap-specs');
  const recapAreasRow = document.getElementById('modal-recap-areas-row');
  const recapAreas = document.getElementById('modal-recap-areas');
  const recapFreq = document.getElementById('modal-recap-freq');
  const recapAddonsRow = document.getElementById('modal-recap-addons-row');
  const recapAddons = document.getElementById('modal-recap-addons');
  const recapTotalLabel = document.getElementById('modal-recap-total-label');
  const recapTotal = document.getElementById('modal-recap-total');

  // Dispatch & Calendar Workflow Groundwork Elements
  const workflowKicker = document.getElementById('modal-workflow-kicker');
  const workflowTitle = document.getElementById('modal-workflow-title');
  const workflowSummary = document.getElementById('modal-workflow-summary');
  const workflowStage1 = document.getElementById('modal-workflow-stage-1');
  const workflowStage2 = document.getElementById('modal-workflow-stage-2');
  const workflowStage3 = document.getElementById('modal-workflow-stage-3');

  const serviceLabels = {
    standard: 'Residential Standard Clean ($40/hr)',
    deep: 'Residential Deep Clean ($50/hr)',
    moveinout: 'Move-In / Move-Out Clean ($50/hr)',
    airbnb: 'Airbnb / STR Turnover ($45/hr)',
    specific: 'Specific Areas (Hourly Booking)',
    commercial: 'Commercial & Offices (Walkthrough & Custom Bid)'
  };

  const freqLabels = {
    weekly: 'Weekly (Every 7 Days)',
    biweekly: 'Every 2 Weeks',
    turnover: 'Per Turnover / Custom Schedule',
    monthly: 'Every 4 Weeks (Monthly)',
    onetime: 'One-Time Service'
  };

  function openBookingModal() {
    const quote = window.SmartsProCurrentQuote;
    if (quote) {
      const isCommercial = quote.state.serviceCategory === 'commercial';
      const isSpecific = quote.calculation.isSpecificAreas;

      if (modalBookingTitle) {
        modalBookingTitle.textContent = isCommercial
          ? 'Review Commercial Walkthrough Request'
          : 'Review Your Estimate';
      }

      if (recapService) {
        if (isCommercial) {
          recapService.textContent = serviceLabels.commercial;
        } else if (isSpecific) {
          recapService.textContent = `Specific Areas (${quote.state.specificHours} Hours Booked)`;
        } else {
          recapService.textContent =
            serviceLabels[quote.state.serviceType] || 'Residential Standard Clean ($40/hr)';
        }
      }

      // Property Type Row (Move-In/Out or Airbnb)
      if (recapPropTypeRow && recapPropType) {
        if (
          (quote.state.serviceCategory === 'moveinout' ||
            quote.state.serviceCategory === 'airbnb') &&
          quote.state.propertyType
        ) {
          recapPropTypeRow.classList.remove('is-hidden');
          recapPropType.textContent = quote.state.propertyType;
        } else {
          recapPropTypeRow.classList.add('is-hidden');
        }
      }

      if (isCommercial) {
        if (recapSpecsLabel) recapSpecsLabel.textContent = 'Facility Assessment:';
        if (recapSpecs) recapSpecs.textContent = 'On-Site Owner Walkthrough & Custom Scope';
        if (recapAreasRow) recapAreasRow.classList.add('is-hidden');
        if (recapAddonsRow) recapAddonsRow.classList.add('is-hidden');
        if (recapTotalLabel) recapTotalLabel.textContent = 'Commercial Walkthrough Baseline:';
      } else if (isSpecific) {
        if (recapSpecsLabel) recapSpecsLabel.textContent = 'Booked Time:';
        if (recapSpecs) {
          const extraH = Math.max(0, quote.state.specificHours - 2);
          recapSpecs.textContent =
            extraH > 0
              ? `${quote.state.specificHours} Hours ($120 2-hr min + ${extraH} × $45/hr)`
              : '2 Hours ($120 Flat Minimum)';
        }
        if (recapAreasRow) recapAreasRow.classList.remove('is-hidden');
        if (recapAreas) {
          const customText = (quote.state.specificAreasText || '').trim();
          recapAreas.textContent = customText || 'To be confirmed on call';
        }
        if (recapAddonsRow) recapAddonsRow.classList.remove('is-hidden');
        if (recapTotalLabel) recapTotalLabel.textContent = 'Estimated Quote:';
      } else {
        if (recapSpecsLabel) recapSpecsLabel.textContent = 'Property Specs:';
        if (recapSpecs) {
          recapSpecs.textContent = `${quote.state.bedrooms} Bed, ${quote.state.fullBaths} Full, ${quote.state.halfBaths} Half / ${quote.state.sqft.toLocaleString()} sq ft`;
        }
        if (recapAreasRow) recapAreasRow.classList.add('is-hidden');
        if (recapAddonsRow) recapAddonsRow.classList.remove('is-hidden');
        if (recapTotalLabel) recapTotalLabel.textContent = 'Estimated Quote:';
      }

      if (recapFreq) recapFreq.textContent = freqLabels[quote.state.frequency] || 'One-Time Service';

      const addonParts = [];
      if (quote.state.addons.fridge > 0) addonParts.push(`${quote.state.addons.fridge}x Single Fridge ($65)`);
      if (quote.state.addons.fridgeDouble > 0) addonParts.push(`${quote.state.addons.fridgeDouble}x Double Fridge ($75)`);
      if (quote.state.addons.oven > 0) addonParts.push(`${quote.state.addons.oven}x Inside Oven ($80)`);
      if (quote.state.addons.pets > 0) addonParts.push(`${quote.state.addons.pets}x Pet Hair Detailing ($35)`);
      if (recapAddons) recapAddons.textContent = addonParts.length > 0 ? addonParts.join(', ') : 'None selected';

      if (recapTotal) recapTotal.textContent = `$${quote.calculation.grandTotal.toFixed(2)}`;

      // Populate Dispatch, Calendar & Owner Confirmation Groundwork
      if (
        window.SmartsProDispatchFramework &&
        typeof window.SmartsProDispatchFramework.getWorkflowPlan === 'function'
      ) {
        const plan = window.SmartsProDispatchFramework.getWorkflowPlan(quote.state);
        if (workflowKicker) {
          workflowKicker.textContent = isCommercial
            ? 'COMMERCIAL WALKTHROUGH & CALENDAR DISPATCH'
            : 'RESIDENTIAL OWNER REVIEW, CALENDAR & PAYMENT DISPATCH';
        }
        if (workflowTitle) workflowTitle.textContent = plan.label;
        if (workflowSummary) workflowSummary.textContent = plan.summary;
        if (workflowStage1 && plan.stages[0]) {
          workflowStage1.textContent = `${plan.stages[0].title}: ${plan.stages[0].detail}`;
        }
        if (workflowStage2 && plan.stages[1]) {
          workflowStage2.textContent = `${plan.stages[1].title}: ${plan.stages[1].detail}`;
        }
        if (workflowStage3 && plan.stages[2]) {
          workflowStage3.textContent = `${plan.stages[2].title}: ${plan.stages[2].detail}`;
        }
      }
    }

    if (modalOverlay) {
      modalOverlay.classList.add('open');
      document.body.classList.add('modal-open');
      if (btnCloseModal) btnCloseModal.focus();
    }
  }

  function closeBookingModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (btnOpenModal) btnOpenModal.addEventListener('click', openBookingModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeBookingModal);

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeBookingModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeBookingModal();
    });
  });

  window.SmartsProModal = Object.freeze({
    openBookingModal,
    closeBookingModal
  });
})();
