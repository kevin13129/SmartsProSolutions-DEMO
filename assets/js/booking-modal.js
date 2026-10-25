/** Estimate recap only. No personal information is collected or submitted. */
(function () {
  'use strict';

  const getEl = (id) => document.getElementById(id);
  let previousFocus = null;

  function openBookingModal() {
    const modal = getEl('booking-modal-overlay');
    const quote = window.SmartsProCurrentQuote;
    if (!modal || !quote) return;
    const { state, calculation } = quote;
    const services = {
      standard: 'Standard Clean',
      deep: 'Deep Restoration Clean',
      moveinout: 'Move In / Move Out Clean',
      airbnb: 'Airbnb / Vacation Rental Turnover'
    };
    const frequencies = {
      weekly: 'Weekly (20% OFF)',
      biweekly: 'Every 2 Weeks (15% OFF)',
      turnover: 'Per Guest Turnover (15% OFF)',
      monthly: 'Every 4 Weeks (10% OFF)',
      onetime: 'One-Time Service'
    };
    const addonLabels = {
      fridgeSingle: 'Single Fridge',
      fridgeDouble: 'Double Fridge',
      oven: 'Inside Oven',
      pets: 'Pet Detailing'
    };
    const addons = Object.entries(addonLabels)
      .filter(([key]) => state.addons[key] > 0)
      .map(([key, label]) => `${state.addons[key]}x ${label}`);

    // All dynamic content is text, never parsed as HTML.
    getEl('modal-recap-service').textContent = services[state.serviceType] || 'Standard Clean';
    getEl('modal-recap-specs').textContent = `${state.bedrooms} Bed, ${state.fullBaths} Full, ${state.halfBaths} Half / ${state.sqft.toLocaleString()} sq ft`;
    getEl('modal-recap-freq').textContent = frequencies[state.frequency] || 'One-Time Service';
    getEl('modal-recap-addons').textContent = addons.join(', ') || 'None selected';
    getEl('modal-recap-total').textContent = `$${calculation.grandTotal.toFixed(2)}`;

    previousFocus = document.activeElement;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => {
      if (modal.classList.contains('open')) getEl('modal-close-btn').focus();
    });
  }

  function closeBookingModal() {
    const modal = getEl('booking-modal-overlay');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
    previousFocus?.focus();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const modal = getEl('booking-modal-overlay');
    getEl('modal-close-btn')?.addEventListener('click', closeBookingModal);
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeBookingModal();
    });
    document.addEventListener('keydown', (event) => {
      if (!modal?.classList.contains('open')) return;
      if (event.key === 'Escape') closeBookingModal();
      if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('a[href], button:not([disabled])')];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  });

  window.SmartsProModal = Object.freeze({ openBookingModal, closeBookingModal });
})();
