/** Estimate recap only. No personal information is collected or submitted. */
(function () {
  'use strict';

  const getEl = (id) => document.getElementById(id);
  let previousFocus = null;

  function openBookingModal() {
    const modal = getEl('booking-modal-overlay');
    const quote = window.SmartsProCurrentQuote;
    if (!modal || !quote) return;
    const { summary } = quote;
    // All surfaces use the same summary and render dynamic content as text.
    const rows = getEl('modal-recap-rows');
    rows.replaceChildren();
    for (const [label, value] of summary.rows) {
      const row = document.createElement('div');
      row.className = 'recap-row';
      const name = document.createElement('span');
      name.textContent = label;
      const detail = document.createElement('strong');
      detail.textContent = value;
      row.append(name, detail);
      rows.append(row);
    }
    const extras = getEl('modal-recap-addons');
    extras.replaceChildren();
    for (const line of summary.addonLines.length ? summary.addonLines : ['None selected']) {
      const item = document.createElement('li');
      item.textContent = line;
      extras.append(item);
    }
    getEl('modal-recap-total').textContent = summary.price;
    getEl('modal-recap-explanation').textContent = summary.explanation;
    const status = getEl('modal-copy-status');
    if (status) status.textContent = '';

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
    getEl('btn-modal-copy-quote')?.addEventListener('click', async () => {
      const status = getEl('modal-copy-status');
      if (!status) return;
      try {
        await navigator.clipboard.writeText(window.SmartsProCurrentQuote.summary.text);
        status.textContent = 'Scope and estimate copied. Ready to paste or reference on your call.';
      } catch {
        status.textContent = 'Copy is unavailable here. Use Print Estimate to keep your summary.';
      }
    });
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
