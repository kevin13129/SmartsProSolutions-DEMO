/**
 * SMARTS PRO SOLUTIONS - BOOKING MODAL & LEAD VIEWER CONTROLLER
 * Handles modal lifecycle, pre-fill from quote calculator, and submission state.
 */

(function () {
  'use strict';

  let activeQuoteData = null;

  function getEl(id) {
    return document.getElementById(id);
  }

  /**
   * Open booking modal pre-filled with quote details
   */
  function openBookingModal(quoteData) {
    const bookingModal = getEl('booking-modal-overlay');
    if (!bookingModal) return;

    activeQuoteData = quoteData || window.SmartsProCurrentQuote;
    if (!activeQuoteData) {
      activeQuoteData = {
        state: {
          bedrooms: 3,
          fullBaths: 2,
          halfBaths: 1,
          sqft: 1800,
          serviceType: 'standard',
          frequency: 'biweekly',
          addons: { linens: 0, fridge: 0, oven: 0, windows: 0 }
        },
        calculation: {
          grandTotal: 246.50,
          serviceSubtotal: 290.00,
          discountAmount: 43.50,
          addonsTotal: 0,
          estTime: '3.0 - 4.0 hrs',
          crewSize: '2 Specialists'
        }
      };
    }

    const { state, calculation } = activeQuoteData;

    // Pre-populate recap elements
    const recapService = getEl('modal-recap-service');
    const recapSpecs = getEl('modal-recap-specs');
    const recapFreq = getEl('modal-recap-freq');
    const recapAddons = getEl('modal-recap-addons');
    const recapTotal = getEl('modal-recap-total');

    const serviceNames = {
      standard: 'Standard Clean',
      deep: 'Deep Restoration Clean',
      moveinout: 'Move In / Move Out Clean'
    };
    if (recapService) recapService.textContent = serviceNames[state.serviceType] || 'Standard Clean';
    if (recapSpecs) recapSpecs.textContent = `${state.bedrooms} Bed, ${state.fullBaths} Full, ${state.halfBaths} Half • ${state.sqft.toLocaleString()} sq ft`;
    
    const freqNames = {
      weekly: 'Weekly (20% OFF)',
      biweekly: 'Every 2 Weeks (15% OFF)',
      monthly: 'Every 4 Weeks (10% OFF)',
      onetime: 'One-Time Service'
    };
    if (recapFreq) recapFreq.textContent = freqNames[state.frequency] || state.frequency;

    // Addons summary
    const activeAddons = [];
    if (state.addons.linens > 0) activeAddons.push(`${state.addons.linens}x Linens`);
    if (state.addons.fridge > 0) activeAddons.push(`${state.addons.fridge}x Inside Fridge`);
    if (state.addons.oven > 0) activeAddons.push(`${state.addons.oven}x Inside Oven`);
    if (state.addons.windows > 0) activeAddons.push(`${state.addons.windows}x Windows`);
    
    if (recapAddons) {
      recapAddons.textContent = activeAddons.length > 0 ? activeAddons.join(', ') : 'None selected';
    }

    if (recapTotal) recapTotal.textContent = `$${calculation.grandTotal.toFixed(2)}`;

    // Reset view states
    const formWrap = getEl('modal-form-state');
    const successBox = getEl('modal-success-state');
    if (formWrap) formWrap.style.display = 'block';
    if (successBox) successBox.style.display = 'none';

    // Show modal
    bookingModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeBookingModal() {
    const bookingModal = getEl('booking-modal-overlay');
    if (bookingModal) bookingModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  /**
   * Handle booking form submit
   */
  async function handleBookingSubmit(e) {
    e.preventDefault();
    const bookingForm = getEl('booking-quote-form');
    if (!bookingForm) return;

    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    const origBtnText = submitBtn.innerHTML;

    // Collect inputs
    const formData = {
      name: getEl('book-name')?.value.trim() || '',
      phone: getEl('book-phone')?.value.trim() || '',
      email: getEl('book-email')?.value.trim() || '',
      address: getEl('book-address')?.value.trim() || '',
      date: getEl('book-date')?.value || '',
      time: getEl('book-time')?.value || 'morning',
      notes: getEl('book-notes')?.value.trim() || ''
    };

    if (!formData.name || !formData.phone) {
      alert('Please provide your name and phone number so we can reach you with your booking confirmation.');
      return;
    }

    // Set loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Locking In Quote...</span>';

    try {
      const result = await window.SmartsProBackend.submitBooking(formData, activeQuoteData);
      
      if (result.success) {
        const successRefCode = getEl('success-ref-code');
        if (successRefCode) successRefCode.textContent = result.referenceCode;
        
        const formWrap = getEl('modal-form-state');
        const successBox = getEl('modal-success-state');
        if (formWrap) formWrap.style.display = 'none';
        if (successBox) successBox.style.display = 'block';
        bookingForm.reset();
      }
    } catch (err) {
      console.error(err);
      alert('There was an issue submitting your request. Please call us directly at 318-564-4360.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnText;
    }
  }

  /**
   * Open lead viewer modal (Demo feature for business owner)
   */
  function openLeadsViewer() {
    const leads = window.SmartsProBackend.getLeads();
    const leadsTableBody = getEl('leads-table-body');
    if (leadsTableBody) {
      if (!leads.length) {
        leadsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #64748B;">No quote requests logged yet. Submit a test quote above to see it appear here!</td></tr>';
      } else {
        leadsTableBody.innerHTML = leads.map(l => `
          <tr>
            <td><strong>${l.referenceCode}</strong></td>
            <td>${l.customer.name}<br><small style="color:#64748B">${l.customer.phone}</small></td>
            <td>${l.quote.serviceType.toUpperCase()}<br><small>${l.quote.bedrooms} Bed / ${l.quote.fullBaths} Bath</small></td>
            <td>${l.quote.frequency}</td>
            <td><strong style="color:#0066CC">$${l.quote.grandTotal.toFixed(2)}</strong></td>
            <td><small>${new Date(l.createdAt).toLocaleDateString()} ${new Date(l.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small></td>
          </tr>
        `).join('');
      }
    }
    const leadsModal = getEl('leads-modal-overlay');
    if (leadsModal) leadsModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLeadsViewer() {
    const leadsModal = getEl('leads-modal-overlay');
    if (leadsModal) leadsModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Set default min date for booking calendar to tomorrow
  function initDatePicker() {
    const dateInput = getEl('book-date');
    if (dateInput) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      dateInput.min = `${yyyy}-${mm}-${dd}`;
      dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
  }

  // Setup Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    initDatePicker();

    const bookingModal = getEl('booking-modal-overlay');
    const closeBtn = getEl('modal-close-btn');
    const bookingForm = getEl('booking-quote-form');

    const leadsModal = getEl('leads-modal-overlay');
    const leadsCloseBtn = getEl('leads-modal-close-btn');
    const btnExportLeads = getEl('btn-export-leads-csv');
    const openLeadsLink = getEl('link-open-leads-admin');

    closeBtn?.addEventListener('click', closeBookingModal);
    bookingModal?.addEventListener('click', (e) => {
      if (e.target === bookingModal) closeBookingModal();
    });

    bookingForm?.addEventListener('submit', handleBookingSubmit);

    // Leads viewer events
    openLeadsLink?.addEventListener('click', (e) => {
      e.preventDefault();
      openLeadsViewer();
    });
    leadsCloseBtn?.addEventListener('click', closeLeadsViewer);
    leadsModal?.addEventListener('click', (e) => {
      if (e.target === leadsModal) closeLeadsViewer();
    });

    btnExportLeads?.addEventListener('click', () => {
      window.SmartsProBackend.exportLeadsCSV();
    });

    // Keyboard shortcuts: ESC to close modals, Shift+L to open leads viewer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeBookingModal();
        closeLeadsViewer();
      }
      if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        openLeadsViewer();
      }
    });
  });

  // Public interface
  window.SmartsProModal = {
    openBookingModal,
    closeBookingModal,
    openLeadsViewer,
    closeLeadsViewer
  };

})();
