/**
 * SMARTS PRO SOLUTIONS — OWNER EARLY-COMPLETION CONFIRMATION CONTROLLER
 * Progressive-enhances /api/finish-early so email link-scanners on GET never trigger mutations,
 * and confirmed clicks delegate to window.SmartsProBackend.confirmFinishEarly(token, mode).
 * Zero inline scripts, delegates network calls exclusively through api.js, and zero raw HTML sinks.
 */
(function () {
  'use strict';

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function renderStatus(banner, type, headingText, detailText, openWindowsNow) {
    if (!banner) return;
    banner.classList.remove('is-hidden', 'status-success', 'status-warning', 'status-error');
    banner.classList.add(
      type === 'success'
        ? 'status-success'
        : type === 'warning'
          ? 'status-warning'
          : 'status-error'
    );
    banner.replaceChildren();

    const heading = createEl('strong', 'intake-status-heading', headingText);
    const copy = createEl('p', 'intake-status-copy', detailText);
    banner.append(heading, copy);

    if (Array.isArray(openWindowsNow) && openWindowsNow.length > 0) {
      const windowsLine = createEl(
        'p',
        'intake-status-copy finish-early-open-list',
        `Open arrival windows on website now: ${openWindowsNow.join(', ')}`
      );
      banner.append(windowsLine);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('finish-early-card');
    if (!card) return;

    const token = card.getAttribute('data-finish-token') || '';
    const btnNow = document.getElementById('btn-finish-now');
    const btnReleaseAll = document.getElementById('btn-finish-release-all');
    const statusBanner = document.getElementById('finish-early-status');

    if (!token || !statusBanner) return;

    const actionButtons = [btnNow, btnReleaseAll].filter(Boolean);
    let inFlight = false;

    async function handleAction(mode) {
      if (inFlight) return;
      if (
        !window.SmartsProBackend ||
        typeof window.SmartsProBackend.confirmFinishEarly !== 'function'
      ) {
        renderStatus(
          statusBanner,
          'error',
          'Schedule Service Unavailable',
          'Please refresh this page and try again.'
        );
        return;
      }

      inFlight = true;
      actionButtons.forEach((btn) => {
        btn.disabled = true;
      });

      renderStatus(
        statusBanner,
        'warning',
        'Updating Calendar...',
        'Shortening your calendar block and checking open arrival windows...'
      );

      try {
        const result = await window.SmartsProBackend.confirmFinishEarly(token, mode);
        if (result && result.success) {
          renderStatus(
            statusBanner,
            'success',
            result.releaseAll ? 'Cleaning Window Released' : `Updated End Time: ${result.earlyEndLabel}`,
            result.message || 'Calendar availability has been updated on smartsprosolutions.com.',
            result.openWindowsNow
          );
          if (btnNow) btnNow.classList.add('is-hidden');
          if (btnReleaseAll) btnReleaseAll.classList.add('is-hidden');
        } else {
          renderStatus(
            statusBanner,
            'error',
            'Unable to Update Calendar Block',
            (result && result.message) || 'Please try again or edit the event directly in Google Calendar.'
          );
          actionButtons.forEach((btn) => {
            btn.disabled = false;
          });
        }
      } finally {
        inFlight = false;
      }
    }

    if (btnNow) {
      btnNow.addEventListener('click', () => handleAction('now'));
    }
    if (btnReleaseAll) {
      btnReleaseAll.addEventListener('click', () => handleAction('release_all'));
    }
  });
})();
