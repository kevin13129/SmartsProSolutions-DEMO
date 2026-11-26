/**
 * SMARTS PRO SOLUTIONS — ESTIMATE RECAP, UPCOMING CLEANING CALENDAR & AUTOMATED EMAIL CONTROLLER
 * Renders:
 * 1. Live Flat-Rate Estimate Recap (no online payment required)
 * 2. Interactive Appointment Calendar & Upcoming Cleaning Bookings Feed (via /api/calendar-availability)
 * 3. Customer Contact & Additional Notes Form (First Name, Last Name, Phone, Email, Optional Notes)
 * 4. Automated Email & Calendar Dispatch to smartsprosolutions@gmail.com (via /api/estimate-request)
 *
 * Uses safe DOM construction (document.createElement / textContent) with zero raw HTML sinks or inline styles.
 */

(function () {
  'use strict';

  const modalOverlay = document.getElementById('booking-modal-overlay');
  const modalBody = document.getElementById('booking-modal-body');
  const modalQuoteRecap = document.getElementById('modal-quote-recap');
  const modalRecapToggle = document.getElementById('modal-recap-toggle');
  const modalRecapToggleService = document.getElementById('modal-recap-toggle-service');
  const modalRecapToggleTotal = document.getElementById('modal-recap-toggle-total');
  const modalStickyFooter = document.getElementById('modal-sticky-footer');
  const modalStickySlot = document.getElementById('modal-sticky-slot');
  const modalStickyTotalLabel = document.getElementById('modal-sticky-total-label');
  const modalStickyTotal = document.getElementById('modal-sticky-total');
  const modalStickyCta = document.getElementById('modal-sticky-cta');
  const btnOpenModal = document.getElementById('btn-book-quote-now');
  const btnContactOpenScheduler = document.getElementById('btn-contact-open-scheduler');
  const btnCloseModal = document.getElementById('modal-close-btn');
  const btnEditDetails = document.getElementById('modal-edit-details-btn');
  const modalBookingTitle = document.getElementById('modal-booking-title');

  const recapService = document.getElementById('modal-recap-service');
  const recapPropTypeRow = document.getElementById('modal-recap-proptype-row');
  const recapPropType = document.getElementById('modal-recap-proptype');
  const recapSpecsLabel = document.getElementById('modal-recap-specs-label');
  const recapSpecs = document.getElementById('modal-recap-specs');
  const recapAreasRow = document.getElementById('modal-recap-areas-row');
  const recapAreas = document.getElementById('modal-recap-areas');
  const recapAddinfoRow = document.getElementById('modal-recap-addinfo-row');
  const recapAddinfo = document.getElementById('modal-recap-addinfo');
  const recapFreq = document.getElementById('modal-recap-freq');
  const recapAddonsRow = document.getElementById('modal-recap-addons-row');
  const recapAddons = document.getElementById('modal-recap-addons');
  const recapFreqFeeRow = document.getElementById('modal-recap-freq-fee-row');
  const recapFreqFee = document.getElementById('modal-recap-freq-fee');
  const recapHours = document.getElementById('modal-recap-hours');
  const recapTotalLabel = document.getElementById('modal-recap-total-label');
  const recapTotal = document.getElementById('modal-recap-total');
  const recapPolicyRow = document.getElementById('modal-recap-policy-row');
  const recapPolicy = document.getElementById('modal-recap-policy');
  const intakePrimaryCopy = document.getElementById('modal-intake-primary-copy');

  // Mount containers for progressive-enhanced Calendar & Customer Intake
  const calendarMount = document.getElementById('modal-calendar-mount');
  const intakeMount = document.getElementById('modal-intake-mount');

  // Dispatch & Calendar Workflow Groundwork Elements
  const workflowKicker = document.getElementById('modal-workflow-kicker');
  const workflowTitle = document.getElementById('modal-workflow-title');
  const workflowSummary = document.getElementById('modal-workflow-summary');
  const workflowStage1 = document.getElementById('modal-workflow-stage-1');
  const workflowStage2 = document.getElementById('modal-workflow-stage-2');
  const workflowStage3 = document.getElementById('modal-workflow-stage-3');

  const serviceLabels = {
    standard: 'Standard Clean',
    deep: 'Deep Clean',
    moveinout: 'Move-In / Move-Out',
    airbnb: 'Airbnb / STR Turnover',
    specific: 'Specific Areas Package',
    commercial: 'Commercial Walkthrough'
  };

  const freqLabels = {
    weekly: 'Weekly (Base Rate)',
    biweekly: 'Every 2 Weeks (Bi-Weekly)',
    turnover: 'Per Turnover / Custom',
    monthly: 'Monthly',
    onetime: 'One-Time',
    overnight: 'Overnight Business (Tentative)'
  };

  const WHEEL_ITEM_HEIGHT = 44;
  const BUSINESS_OPEN_MINUTES = 8 * 60; // 8:00 AM
  const BUSINESS_CLOSE_MINUTES = 16 * 60 + 30; // 4:30 PM
  const FULL_DAY_MINUTES = BUSINESS_CLOSE_MINUTES - BUSINESS_OPEN_MINUTES; // 510 min (8.5 hrs)
  const WINDOW_TIMINGS = Object.freeze({
    '08:00-11:00': { startMinutes: 8 * 60, endMinutes: 11 * 60 },
    '11:00-14:00': { startMinutes: 11 * 60, endMinutes: 14 * 60 },
    '14:00-16:30': { startMinutes: 14 * 60, endMinutes: 16 * 60 + 30 },
    '18:00-22:00': { startMinutes: 18 * 60, endMinutes: 22 * 60 },
    '21:00-01:00': { startMinutes: 21 * 60, endMinutes: 25 * 60 },
    '23:00-03:00': { startMinutes: 23 * 60, endMinutes: 27 * 60 }
  });

  // Interactive Scheduler & Intake State
  const schedulerState = {
    availableDates: [],
    calendarMonths: [],
    activeMonthKey: '',
    wheelDays: [],
    wheelScrollTimer: null,
    wheelSuppressUntil: 0,
    wheelRafPending: false,
    maxAdvanceDate: '',
    maxAdvanceDateFormatted: '',
    upcomingBookings: [],
    busyIntervals: [],
    selectedDate: '',
    selectedWindow: '',
    isSubmitting: false,
    isRefreshingCalendar: false,
    liveCalendarSyncConfigured: false,
    viewMode: 'form', // 'form' | 'confirmed' | 'editing'
    confirmedSubmission: null,
    contactTouched: { firstName: false, lastName: false, phone: false, email: false },
    mounted: false,
    refs: {}
  };

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function createSvgIcon(polylinePoints, size = 16, strokeWidth = 2.4) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', String(strokeWidth));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const poly = document.createElementNS(svgNs, 'polyline');
    poly.setAttribute('points', polylinePoints);
    svg.append(poly);
    return svg;
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function formatMinutesAsTime(totalMinutes) {
    const rawMin = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const safeMin = ((rawMin % 1440) + 1440) % 1440;
    const h24 = Math.floor(safeMin / 60);
    const mins = safeMin % 60;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
  }

  function isActiveOvernightMode() {
    const st = window.SmartsProCurrentQuote?.state || {};
    return st.serviceCategory === 'commercial' && st.frequency === 'overnight';
  }

  function getActiveDurationInfo() {
    const quote = window.SmartsProCurrentQuote || { state: {}, calculation: {} };
    const st = quote.state || {};
    const calc = quote.calculation || {};
    const isCommercial = st.serviceCategory === 'commercial';
    const rawHours = Number(calc.totalEstimatedHours || calc.estimatedHours) || 2;
    const durationMinutes = Number(calc.durationMinutes) || Math.max(60, Math.round(rawHours * 60));
    return {
      isCommercial,
      totalEstimatedHours: Number((durationMinutes / 60).toFixed(2)),
      durationMinutes: Math.max(60, Math.round(durationMinutes))
    };
  }

  function intervalsOverlap(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
  }

  function evaluateClientSlot(dayObj, slot, durationMinutes, confirmedInfo, busyIntervals) {
    const confirmedDate = (confirmedInfo && confirmedInfo.date) || '';
    const confirmedWindow = (confirmedInfo && confirmedInfo.window) || '';
    const confirmedStartMinutes = confirmedInfo && Number.isFinite(confirmedInfo.startMinutes)
      ? confirmedInfo.startMinutes
      : null;
    const confirmedEndMinutes = confirmedInfo && Number.isFinite(confirmedInfo.endMinutes)
      ? confirmedInfo.endMinutes
      : null;

    const timing = WINDOW_TIMINGS[slot.slotId] || {
      startMinutes: Number(slot.startMinutes) || BUSINESS_OPEN_MINUTES,
      endMinutes: Number(slot.endMinutes) || BUSINESS_OPEN_MINUTES + 180
    };
    const isCustomerOwnSlot = dayObj.date === confirmedDate && slot.slotId === confirmedWindow;

    if (slot.status === 'CLOSED_HOLIDAY') {
      return {
        status: 'CLOSED_HOLIDAY',
        selectable: false,
        endMinutes: timing.endMinutes,
        endLabel: formatMinutesAsTime(timing.endMinutes),
        exceedsClose: false,
        isFullDayExtension: false,
        reasonText: slot.serviceLabel || 'Holiday (Closed)'
      };
    }

    const effectiveEnd = timing.endMinutes;

    if (!isCustomerOwnSlot) {
      if (slot.status === 'BOOKED') {
        return {
          status: 'BOOKED',
          selectable: false,
          endMinutes: effectiveEnd,
          endLabel: formatMinutesAsTime(effectiveEnd),
          exceedsClose: false,
          isFullDayExtension: false,
          reasonText: 'Booked'
        };
      }

      const dayBusy = (busyIntervals || []).filter((item) => item && item.date === dayObj.date);
      const ownWindowTiming = confirmedWindow ? WINDOW_TIMINGS[confirmedWindow] : null;
      const overlapsBusy = dayBusy.some((busy) => {
        if (dayObj.date === confirmedDate) {
          if (
            confirmedStartMinutes !== null &&
            confirmedEndMinutes !== null &&
            busy.startMinutes === confirmedStartMinutes &&
            busy.endMinutes === confirmedEndMinutes
          ) {
            return false;
          }
          if (ownWindowTiming && busy.startMinutes === ownWindowTiming.startMinutes) {
            return false;
          }
        }
        return intervalsOverlap(timing.startMinutes, effectiveEnd, busy.startMinutes, busy.endMinutes);
      });

      if (overlapsBusy) {
        return {
          status: 'BOOKED',
          selectable: false,
          endMinutes: effectiveEnd,
          endLabel: formatMinutesAsTime(effectiveEnd),
          exceedsClose: false,
          isFullDayExtension: false,
          reasonText: 'Booked / Unavailable'
        };
      }
    }

    return {
      status: 'AVAILABLE',
      selectable: true,
      endMinutes: effectiveEnd,
      endLabel: formatMinutesAsTime(effectiveEnd),
      exceedsClose: false,
      isFullDayExtension: false,
      reasonText: 'Available'
    };
  }

  function formatYmdLocal(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function addDaysYmd(isoDate, days) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return formatYmdLocal(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function getLastDayOfMonthYmd(year, month) {
    const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
    return formatYmdLocal(year, month, lastDay);
  }

  function formatMonthLabelUtc(year, month) {
    const dt = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
    return dt.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric'
    });
  }

  function formatFullDateUtc(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function getDowUtc(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  }

  function getNthWeekdayUtc(year, month, weekday, n) {
    const firstDow = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).getUTCDay();
    const offset = (weekday - firstDow + 7) % 7;
    return formatYmdLocal(year, month, 1 + offset + (n - 1) * 7);
  }

  function getLastWeekdayUtc(year, month, weekday) {
    const lastDate = new Date(Date.UTC(year, month, 0, 12, 0, 0));
    const offset = (lastDate.getUTCDay() - weekday + 7) % 7;
    return formatYmdLocal(year, month, lastDate.getUTCDate() - offset);
  }

  function getUsHolidayMapUtc(year) {
    const map = new Map();
    const addFixed = (y, m, d, label) => {
      const iso = formatYmdLocal(y, m, d);
      map.set(iso, label);
      const dow = getDowUtc(iso);
      if (dow === 6) map.set(addDaysYmd(iso, -1), `${label} (Observed)`);
      if (dow === 0) map.set(addDaysYmd(iso, 1), `${label} (Observed)`);
    };
    addFixed(year, 1, 1, "New Year's Day");
    addFixed(year + 1, 1, 1, "New Year's Day");
    map.set(getNthWeekdayUtc(year, 1, 1, 3), 'MLK Jr. Day');
    map.set(getNthWeekdayUtc(year, 2, 1, 3), "Presidents' Day");
    map.set(getLastWeekdayUtc(year, 5, 1), 'Memorial Day');
    addFixed(year, 6, 19, 'Juneteenth');
    addFixed(year, 7, 4, 'Independence Day');
    map.set(getNthWeekdayUtc(year, 9, 1, 1), 'Labor Day');
    const tg = getNthWeekdayUtc(year, 11, 4, 4);
    map.set(tg, 'Thanksgiving');
    map.set(addDaysYmd(tg, 1), 'Day After Thanksgiving');
    map.set(formatYmdLocal(year, 12, 24), 'Christmas Eve');
    addFixed(year, 12, 25, 'Christmas Day');
    return map;
  }

  function getHolidayNameUtc(isoDate) {
    const year = Number(isoDate.slice(0, 4));
    return getUsHolidayMapUtc(year).get(isoDate) || null;
  }

  const DISPOSABLE_OR_FAKE_EMAIL_DOMAINS = new Set([
    'mailinator.com',
    'guerrillamail.com',
    '10minutemail.com',
    'tempmail.com',
    'temp-mail.org',
    'yopmail.com',
    'trashmail.com',
    'sharklasers.com',
    'getnada.com',
    'fakeinbox.com',
    'throwawaymail.com',
    'maildrop.cc',
    'dispostable.com',
    'mailnesia.com',
    'mohmal.com',
    'fake.com',
    'test.com',
    'testing.com',
    'asdf.com',
    'qwerty.com',
    'invalid.com',
    'none.com',
    'noemail.com',
    'noreply.com'
  ]);

  const COMMON_TYPO_EMAIL_DOMAINS = new Set([
    'gmial.com',
    'gamil.com',
    'gmail.co',
    'gmail.con',
    'yaho.com',
    'yahooo.com',
    'yahoo.co',
    'hotmial.com',
    'hotmail.co',
    'outlok.com',
    'icloud.co'
  ]);

  function containsPhishingOrUrlLinks(str) {
    if (typeof str !== 'string' || !str) return false;
    return (
      /\b(?:https?:\/\/|www\.|mailto:|javascript:|bit\.ly\/|tinyurl\.com\/|t\.me\/|wa\.me\/)/i.test(
        str
      ) || /\b[a-z0-9-]+\.(?:com|net|org|io|ru|cn|xyz|top|click|link|info|biz)\/\S*/i.test(str)
    );
  }

  function validateClientUsPhone(rawPhone) {
    let digits = String(rawPhone || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.slice(1);
    }
    if (digits.length !== 10) return { valid: false };

    const areaCode = digits.slice(0, 3);
    const exchange = digits.slice(3, 6);
    const subscriber = digits.slice(6, 10);
    const localSeven = digits.slice(3, 10);

    if (
      areaCode[0] === '0' ||
      areaCode[0] === '1' ||
      exchange[0] === '0' ||
      exchange[0] === '1' ||
      areaCode.endsWith('11') ||
      exchange.endsWith('11') ||
      areaCode === '555' ||
      areaCode === '900' ||
      areaCode === '999'
    ) {
      return { valid: false };
    }

    if (exchange === '555') {
      const subNum = Number(subscriber);
      if (subNum < 100 || subNum > 199) {
        return { valid: false };
      }
    }

    if (
      digits === '2345678901' ||
      digits === '9876543210' ||
      /^(\d)\1{6}$/.test(localSeven) ||
      /^(\d)\1{9}$/.test(digits) ||
      subscriber === '0000'
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      formatted: `(${areaCode}) ${exchange}-${subscriber}`
    };
  }

  /**
   * Builds a normalized quote payload from the current calculator state.
   */
  function buildCurrentQuotePayload() {
    const currentQuote = window.SmartsProCurrentQuote || { state: {}, calculation: {} };
    const rawState = currentQuote.state || {};
    const rawAddInfo = rawState.additionalInfo || {};
    const isCommercial = rawState.serviceCategory === 'commercial';

    const normalizedAdditionalInfo = isCommercial
      ? { hasPets: '', lastCleaned: '', occupancy: '', condition: '' }
      : {
          hasPets: rawAddInfo.hasPets || (rawState.addons?.pets > 0 ? 'yes' : 'no'),
          lastCleaned: rawAddInfo.lastCleaned || '1-3 Months ago',
          occupancy: rawAddInfo.occupancy || 'Occupied, we live there',
          condition: rawAddInfo.condition || 'Average, normal use'
        };

    return {
      serviceCategory: rawState.serviceCategory || 'residential',
      serviceType: rawState.serviceType || 'standard',
      propertyType:
        rawState.serviceCategory === 'moveinout'
          ? rawState.propertyType || 'House'
          : rawState.propertyType || '',
      scopeMode: rawState.scopeMode || 'full',
      specificAreasText: String(rawState.specificAreasText || '').trim(),
      serviceDetails: String(rawState.serviceDetails || '').trim(),
      specificHours: Number(rawState.specificHours) || 1,
      bedrooms: Number(rawState.bedrooms) || 3,
      fullBaths: Number(rawState.fullBaths) || 2,
      halfBaths: Number(rawState.halfBaths) || 0,
      extraLivingRooms: Number(rawState.extraLivingRooms) || 0,
      sqft: Number(rawState.sqft) || 1800,
      additionalInfo: normalizedAdditionalInfo,
      frequency: rawState.frequency || 'weekly',
      addons: {
        fridge: Number(rawState.addons?.fridge) || 0,
        fridgeDouble: Number(rawState.addons?.fridgeDouble) || 0,
        oven: Number(rawState.addons?.oven) || 0,
        laundry: Number(rawState.addons?.laundry) || 0,
        organizing: Number(rawState.addons?.organizing) || 0,
        dishes: Number(rawState.addons?.dishes) || 0,
        windows: Number(rawState.addons?.windows) || 0,
        powerWashWindows: Number(rawState.addons?.powerWashWindows) || 0,
        pets: normalizedAdditionalInfo.hasPets === 'yes' ? 1 : Number(rawState.addons?.pets) || 0
      }
    };
  }

  /**
   * Computes a deterministic snapshot key to detect whether a customer
   * has modified any estimate/appointment/contact option since confirming.
   */
  function computeCurrentSnapshotKey() {
    const refs = schedulerState.refs;
    const quotePayload = buildCurrentQuotePayload();
    return JSON.stringify({
      date: schedulerState.selectedDate || '',
      window: schedulerState.selectedWindow || '',
      firstName: refs.firstInput ? refs.firstInput.value.trim() : '',
      lastName: refs.lastInput ? refs.lastInput.value.trim() : '',
      phone: refs.phoneInput ? refs.phoneInput.value.trim() : '',
      email: refs.emailInput ? refs.emailInput.value.trim().toLowerCase() : '',
      notes: refs.notesInput ? refs.notesInput.value.trim() : '',
      quote: quotePayload
    });
  }

  /**
   * Updates the top Estimate Recap Card inside the modal whenever the quote changes.
   */
  function refreshModalRecapUI() {
    const quote = window.SmartsProCurrentQuote;
    if (!quote) return;

    const isCommercial = quote.state.serviceCategory === 'commercial';
    const isSpecific = !isCommercial && Boolean(quote.calculation.isSpecificAreas || quote.state.scopeMode === 'specific');
    const specHrs = Math.max(1, Number(quote.state.specificHours) || 1);
    const specPrice = specHrs * 50;

    if (modalBookingTitle) {
      modalBookingTitle.textContent = isCommercial
        ? 'Schedule Walkthrough & Send Bid'
        : 'Review Estimate & Pick a Time';
    }

    if (recapService) {
      if (isCommercial) {
        recapService.textContent = serviceLabels.commercial;
      } else {
        recapService.textContent =
          serviceLabels[quote.state.serviceType] || 'Standard Clean';
      }
    }

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
      if (recapSpecsLabel) recapSpecsLabel.textContent = 'Facility Scope:';
      if (recapSpecs) recapSpecs.textContent = 'On-site owner walkthrough';
      if (recapAreasRow) recapAreasRow.classList.add('is-hidden');
      if (recapAddinfoRow) recapAddinfoRow.classList.add('is-hidden');
      if (recapAddonsRow) recapAddonsRow.classList.add('is-hidden');
      if (recapTotalLabel) recapTotalLabel.textContent = 'Walkthrough Baseline:';
    } else {
      if (recapSpecsLabel) recapSpecsLabel.textContent = 'Property Specs:';
      if (recapSpecs) {
        const livingTxt = quote.state.extraLivingRooms > 0 ? `, ${quote.state.extraLivingRooms} Extra Living` : '';
        recapSpecs.textContent = `${quote.state.bedrooms} Bed, ${quote.state.fullBaths} Full, ${quote.state.halfBaths} Half${livingTxt} / ${quote.state.sqft.toLocaleString()} sq ft`;
      }
      if (recapAreasRow) {
        recapAreasRow.classList.toggle('is-hidden', !isSpecific);
      }
      if (recapAreas && isSpecific) {
        const customText = (quote.state.specificAreasText || '').trim();
        recapAreas.textContent = customText
          ? `Level ${specHrs} (+$${specPrice}): ${customText}`
          : `Level ${specHrs} (+$${specPrice}) — Describe areas below`;
      }
      if (recapAddonsRow) recapAddonsRow.classList.remove('is-hidden');
      if (recapTotalLabel) recapTotalLabel.textContent = 'Estimated Quote:';
    }

    if (recapAddinfoRow && recapAddinfo) {
      const info = quote.state.additionalInfo || {};
      const petsLabel =
        info.hasPets === 'yes' || quote.state.addons.pets > 0
          ? 'Pets (+$35)'
          : info.hasPets === 'no'
            ? 'No Pets'
            : '';
      const infoParts = [];
      if (petsLabel) infoParts.push(petsLabel);
      if (info.lastCleaned) infoParts.push(info.lastCleaned);
      if (info.occupancy) infoParts.push(info.occupancy);
      if (info.condition) infoParts.push(info.condition);
      if (quote.state.serviceDetails) infoParts.push(`Details: ${quote.state.serviceDetails}`);

      if (!isCommercial && infoParts.length > 0) {
        recapAddinfoRow.classList.remove('is-hidden');
        recapAddinfo.textContent = infoParts.join(' • ');
      } else {
        recapAddinfoRow.classList.add('is-hidden');
      }
    }

    if (recapFreq) {
      recapFreq.textContent = freqLabels[quote.state.frequency] || 'Weekly (Base Rate)';
    }

    const surchargeAmount = Number(quote.calculation?.frequencySurcharge) || 0;
    const isOvernight = isCommercial && quote.state.frequency === 'overnight';
    if (recapFreqFeeRow && recapFreqFee) {
      if (surchargeAmount > 0 || isOvernight) {
        recapFreqFeeRow.classList.remove('is-hidden');
        recapFreqFee.textContent = isOvernight
          ? `+$${surchargeAmount.toFixed(2)} (Tentative)`
          : `+$${surchargeAmount.toFixed(2)}`;
      } else {
        recapFreqFeeRow.classList.add('is-hidden');
        recapFreqFee.textContent = '+$0.00';
      }
    }

    if (isCommercial && recapTotalLabel) {
      recapTotalLabel.textContent = isOvernight
        ? 'Overnight Baseline (Tentative):'
        : 'Walkthrough Baseline:';
    } else if (recapTotalLabel) {
      recapTotalLabel.textContent = 'Estimated Quote:';
    }

    const addonParts = [];
    if (quote.state.addons.fridge > 0) {
      addonParts.push(`${quote.state.addons.fridge}x Single Fridge (from $54.99)`);
    }
    if (quote.state.addons.fridgeDouble > 0) {
      addonParts.push(`${quote.state.addons.fridgeDouble}x Double Fridge (from $64.99)`);
    }
    if (quote.state.addons.oven > 0) {
      addonParts.push(`${quote.state.addons.oven}x Inside Oven (from $61.88)`);
    }
    if (quote.state.addons.laundry > 0) {
      addonParts.push(
        `${quote.state.addons.laundry}x Laundry Load${quote.state.addons.laundry > 1 ? 's' : ''} — Wash, dry, and fold (from $48.98/load)`
      );
    }
    if (quote.state.addons.organizing > 0) {
      addonParts.push(`${quote.state.addons.organizing}x Organizing per Area (from $29.60/area)`);
    }
    if (quote.state.addons.dishes > 0) {
      addonParts.push(`${quote.state.addons.dishes}x Dishes (from $24.78)`);
    }
    if (quote.state.addons.windows > 0) {
      addonParts.push(`${quote.state.addons.windows}x Windows (from $8 ea)`);
    }
    if (quote.state.addons.powerWashWindows > 0) {
      addonParts.push(
        `${quote.state.addons.powerWashWindows}x Power Wash Window Set${quote.state.addons.powerWashWindows > 1 ? 's' : ''} (from $25/set)`
      );
    }
    if (isSpecific) {
      addonParts.push(`Specific Areas (Level ${specHrs}, +$${specPrice})`);
    }
    if (quote.state.addons.pets > 0) {
      addonParts.push('Pet Detailing ($35 flat)');
    }
    if (recapAddons) {
      if (
        quote.state.additionalInfo &&
        quote.state.additionalInfo.hasPets === 'no' &&
        addonParts.length === 0
      ) {
        recapAddons.textContent = 'None (No pets)';
      } else {
        recapAddons.textContent = addonParts.length > 0 ? addonParts.join(', ') : 'None';
      }
    }

    if (recapTotal) {
      recapTotal.textContent = `$${quote.calculation.grandTotal.toFixed(2)}`;
    }
    if (modalRecapToggleTotal) {
      modalRecapToggleTotal.textContent = `$${quote.calculation.grandTotal.toFixed(2)}`;
    }
    if (modalRecapToggleService) {
      const svcShort = recapService ? recapService.textContent : 'Standard Clean';
      const freqShort = (freqLabels[quote.state.frequency] || 'Weekly').split(' (')[0];
      modalRecapToggleService.textContent = `${svcShort} · ${freqShort}`;
    }

    updateRecapHoursDisplay();

    if (recapPolicyRow && recapPolicy) {
      if (isOvernight) {
        recapPolicy.textContent =
          'Tentative slot • Call (318) 564-4360 • 50% deposit required in person • 10% bounced check fee';
      } else {
        recapPolicy.textContent =
          'No online payment today • 50% deposit required in person • 10% bounced check fee';
      }
    }

    if (intakePrimaryCopy) {
      intakePrimaryCopy.textContent = isOvernight
        ? 'Overnight cleaning is a special request (50% deposit required in person). Pick a tentative Mon–Fri night window, then call (318) 564-4360 to coordinate access & scope:'
        : 'No online payment today (50% deposit required in person). Prefer to book by phone? Call Mon–Fri, 8:00 AM – 4:30 PM:';
    }

    if (
      window.SmartsProDispatchFramework &&
      typeof window.SmartsProDispatchFramework.getWorkflowPlan === 'function'
    ) {
      const plan = window.SmartsProDispatchFramework.getWorkflowPlan(quote.state);
      if (workflowKicker) {
        workflowKicker.textContent = isCommercial
          ? 'COMMERCIAL WALKTHROUGH & AUTOMATED EMAIL DISPATCH'
          : 'AUTOMATED ESTIMATE EMAIL & CALENDAR APPOINTMENT DISPATCH';
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

    syncStickyFooterUI();
  }

  function updateRecapHoursDisplay() {
    if (!recapHours) return;
    recapHours.textContent = '';
  }

  /**
   * Builds a fallback Monday-Friday (8:00 AM - 4:30 PM) schedule client-side
   * covering the full current calendar month and full next calendar month.
   */
  function buildClientFallbackAvailability() {
    const dates = [];
    const upcoming = [];
    const now = new Date();
    const todayIso = formatYmdLocal(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const [curYear, curMonth] = todayIso.split('-').map(Number);
    const nextYear = curMonth === 12 ? curYear + 1 : curYear;
    const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
    const endOfNextMonthIso = getLastDayOfMonthYmd(nextYear, nextMonth);
    const maxAdvanceDate = endOfNextMonthIso;

    const curMonthKey = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    const monthsMap = new Map();
    monthsMap.set(curMonthKey, {
      monthKey: curMonthKey,
      monthLabel: formatMonthLabelUtc(curYear, curMonth),
      isCurrentMonth: true,
      days: []
    });
    monthsMap.set(nextMonthKey, {
      monthKey: nextMonthKey,
      monthLabel: formatMonthLabelUtc(nextYear, nextMonth),
      isCurrentMonth: false,
      days: []
    });

    let offset = 1;
    while (offset <= 65) {
      const iso = addDaysYmd(todayIso, offset);
      if (iso > endOfNextMonthIso) break;

      const dow = getDowUtc(iso);
      const holidayName = getHolidayNameUtc(iso);
      const monthKey = iso.slice(0, 7);

      if (dow >= 1 && dow <= 5) {
        const formatted = formatFullDateUtc(iso);
        const slots = [
          {
            slotId: '08:00-11:00',
            label: 'Morning (8:00 AM – 11:00 AM)',
            shortLabel: '8:00 AM – 11:00 AM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available'
          },
          {
            slotId: '11:00-14:00',
            label: 'Midday (11:00 AM – 2:00 PM)',
            shortLabel: '11:00 AM – 2:00 PM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available'
          },
          {
            slotId: '14:00-16:30',
            label: 'Afternoon (2:00 PM – 4:30 PM)',
            shortLabel: '2:00 PM – 4:30 PM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available'
          }
        ];

        const overnightSlots = [
          {
            slotId: '18:00-22:00',
            label: 'Evening Overnight (6:00 PM – 10:00 PM)',
            shortLabel: '6:00 PM – 10:00 PM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            isOvernight: true,
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available (Tentative)'
          },
          {
            slotId: '21:00-01:00',
            label: 'Late Night Overnight (9:00 PM – 1:00 AM)',
            shortLabel: '9:00 PM – 1:00 AM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            isOvernight: true,
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available (Tentative)'
          },
          {
            slotId: '23:00-03:00',
            label: 'Overnight Shift (11:00 PM – 3:00 AM)',
            shortLabel: '11:00 PM – 3:00 AM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            isOvernight: true,
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available (Tentative)'
          }
        ];

        slots.forEach((s) => {
          if (s.status === 'BOOKED') {
            upcoming.push({
              date: iso,
              dateFormatted: formatted,
              slotId: s.slotId,
              slotLabel: s.shortLabel,
              serviceLabel: s.serviceLabel,
              status: 'BOOKED',
              isOvernight: false
            });
          }
        });

        const dayEntry = {
          date: iso,
          monthKey,
          dateFormatted: formatted,
          slots,
          overnightSlots,
          openSlotCount: slots.filter((s) => s.status === 'AVAILABLE').length,
          openOvernightSlotCount: overnightSlots.filter((s) => s.status === 'AVAILABLE').length,
          holidayName: holidayName || null,
          withinAdvanceWindow: !holidayName
        };

        if (monthsMap.has(monthKey)) {
          monthsMap.get(monthKey).days.push(dayEntry);
        }
        if (!holidayName) {
          dates.push(dayEntry);
        }
      }
      offset++;
    }
    return {
      availableDates: dates,
      calendarMonths: Array.from(monthsMap.values()),
      maxAdvanceDate,
      maxAdvanceDateFormatted: formatFullDateUtc(maxAdvanceDate),
      upcomingBookings: upcoming
    };
  }

  /**
   * Applies an adjustment to the calculator state and refreshes both the top modal recap,
   * live calendar duration eligibility, and the inline Edit Request panel controls.
   */
  function handleModalQuoteAdjustment(patch) {
    if (
      window.SmartsProCalculator &&
      typeof window.SmartsProCalculator.applyQuoteAdjustments === 'function'
    ) {
      window.SmartsProCalculator.applyQuoteAdjustments(patch);
    }
    refreshModalRecapUI();
    renderCalendarUI();
    syncEditAdjusterUI();
    updateSubmitButtonLockState();
  }

  function isConfirmedBookingWithin24Hours(confirmed) {
    if (!confirmed || !confirmed.appointment) return false;
    const isoDate = confirmed.appointment.preferredDate || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
    const timing = WINDOW_TIMINGS[confirmed.appointment.preferredWindow];
    const startMin = Number.isFinite(Number(confirmed.confirmedStartMinutes))
      ? Number(confirmed.confirmedStartMinutes)
      : timing
        ? timing.startMinutes
        : 480;
    const [y, m, d] = isoDate.split('-').map(Number);
    const hh = Math.floor(startMin / 60);
    const mm = startMin % 60;
    const approxUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);
    let offsetStr = '-06:00';
    try {
      const tzPart = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        timeZoneName: 'longOffset'
      })
        .formatToParts(new Date(approxUtcMs))
        .find((p) => p.type === 'timeZoneName')?.value;
      const match = String(tzPart || '').match(/GMT([+-]\d{2}:\d{2})/);
      if (match) offsetStr = match[1];
    } catch {
      // Fallback to CST (-06:00)
    }
    const startIso = `${isoDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${offsetStr}`;
    const apptStartMs = Date.parse(startIso);
    if (!Number.isFinite(apptStartMs)) return false;
    return Date.now() > apptStartMs - 24 * 60 * 60 * 1000;
  }

  function syncContactFieldsLockState(isLockedEdit) {
    const refs = schedulerState.refs;
    const confirmedCust = schedulerState.confirmedSubmission?.customer;
    const inputs = [
      [refs.firstInput, confirmedCust?.firstName],
      [refs.lastInput, confirmedCust?.lastName],
      [refs.phoneInput, confirmedCust?.phone],
      [refs.emailInput, confirmedCust?.email]
    ];
    inputs.forEach(([inputEl, lockedVal]) => {
      if (!inputEl) return;
      inputEl.readOnly = Boolean(isLockedEdit);
      inputEl.classList.toggle('is-locked-input', Boolean(isLockedEdit));
      if (isLockedEdit && typeof lockedVal === 'string' && lockedVal) {
        inputEl.value = lockedVal;
      }
    });
    syncAllContactValidationUI(false);
  }

  /**
   * Synchronizes the Inline Edit Request Panel controls with the live calculator quote
   * and enforces the confirmed booking baseline floor (upgrade & add only).
   */
  function syncEditAdjusterUI() {
    const refs = schedulerState.refs;
    const quote = window.SmartsProCurrentQuote;
    if (!quote || !refs.editAdjusterSection) return;

    const st = quote.state;
    const calc = quote.calculation;
    const isCommercial = st.serviceCategory === 'commercial';
    const isSpecific = !isCommercial && st.scopeMode === 'specific';
    const confirmedQuote =
      schedulerState.viewMode === 'editing' && schedulerState.confirmedSubmission?.quote
        ? schedulerState.confirmedSubmission.quote
        : null;

    if (refs.editLivePriceBadge) {
      refs.editLivePriceBadge.textContent = `Auto-Adjusted Total: $${calc.grandTotal.toFixed(2)}`;
    }

    // Base service tier & room dimensions are locked once confirmed (upgrade & add only via Add-Ons)
    if (refs.modeGroup) {
      refs.modeGroup.classList.toggle('is-hidden', st.serviceCategory !== 'residential');
    }

    if (refs.modeBtnStandard) {
      const active = st.serviceType === 'standard';
      const lockedOut = Boolean(confirmedQuote && confirmedQuote.serviceType !== 'standard');
      refs.modeBtnStandard.classList.toggle('active', active);
      refs.modeBtnStandard.disabled = lockedOut;
      refs.modeBtnStandard.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (refs.modeBtnDeep) {
      const active = st.serviceType === 'deep';
      const lockedOut = Boolean(confirmedQuote && confirmedQuote.serviceType !== 'deep');
      refs.modeBtnDeep.classList.toggle('active', active);
      refs.modeBtnDeep.disabled = lockedOut;
      refs.modeBtnDeep.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    if (refs.editRoomsRow) {
      refs.editRoomsRow.classList.toggle('is-hidden', isCommercial);
    }
    if (refs.btnBedMinus) {
      refs.btnBedMinus.disabled = Boolean(confirmedQuote);
    }
    if (refs.btnBedPlus) {
      refs.btnBedPlus.disabled = Boolean(confirmedQuote);
    }
    if (refs.btnBathMinus) {
      refs.btnBathMinus.disabled = Boolean(confirmedQuote);
    }
    if (refs.btnBathPlus) {
      refs.btnBathPlus.disabled = Boolean(confirmedQuote);
    }

    if (refs.editSpecificCard) {
      refs.editSpecificCard.classList.toggle('is-hidden', isCommercial);
    }
    const confirmedSpecificOn = Boolean(confirmedQuote && confirmedQuote.scopeMode === 'specific');
    const minSpecificHours = confirmedSpecificOn
      ? Math.max(1, Number(confirmedQuote.specificHours) || 1)
      : 1;
    if (refs.editSpecificToggleBtn) {
      refs.editSpecificToggleBtn.classList.toggle('active', isSpecific);
      refs.editSpecificToggleBtn.disabled = confirmedSpecificOn;
      refs.editSpecificToggleBtn.setAttribute('aria-pressed', isSpecific ? 'true' : 'false');
      refs.editSpecificToggleBtn.textContent = isSpecific
        ? confirmedSpecificOn
          ? 'Specific Areas Add-On: Locked On ✓ (Adjust Level Below)'
          : 'Specific Areas Add-On: Included ✓ (Click to Remove)'
        : '+ Add Specific Areas (Starting at +$50)';
    }
    if (refs.editSpecificFields) {
      refs.editSpecificFields.classList.toggle('is-hidden', !isSpecific);
    }
    if (refs.editSpecificAreasInput && document.activeElement !== refs.editSpecificAreasInput) {
      refs.editSpecificAreasInput.value = st.specificAreasText || '';
    }
    if (refs.editServiceDetailsInput && document.activeElement !== refs.editServiceDetailsInput) {
      refs.editServiceDetailsInput.value = st.serviceDetails || '';
    }

    const hrs = Math.max(1, Number(st.specificHours) || 1);
    if (refs.editHoursVal) {
      const addonCost = hrs * 50;
      refs.editHoursVal.textContent = `Level ${hrs} (+$${addonCost})`;
    }
    if (refs.btnHoursMinus) {
      refs.btnHoursMinus.disabled = hrs <= minSpecificHours;
    }
    if (refs.btnHoursPlus) {
      refs.btnHoursPlus.disabled = hrs >= 6;
    }

    if (refs.editBedVal) {
      refs.editBedVal.textContent = `${st.bedrooms} Bed (Locked)`;
    }
    if (refs.editBathVal) {
      refs.editBathVal.textContent = `${st.fullBaths} Full Bath (Locked)`;
    }

    const hasPetsYes = st.additionalInfo?.hasPets === 'yes' || st.addons?.pets > 0;
    const confirmedPetsYes = Boolean(
      confirmedQuote &&
        (confirmedQuote.additionalInfo?.hasPets === 'yes' || Number(confirmedQuote.addons?.pets) > 0)
    );
    if (refs.petsBtnNo) {
      refs.petsBtnNo.classList.toggle('active', !hasPetsYes);
      refs.petsBtnNo.disabled = confirmedPetsYes;
      refs.petsBtnNo.setAttribute('aria-pressed', !hasPetsYes ? 'true' : 'false');
    }
    if (refs.petsBtnYes) {
      refs.petsBtnYes.classList.toggle('active', hasPetsYes);
      refs.petsBtnYes.setAttribute('aria-pressed', hasPetsYes ? 'true' : 'false');
    }

    const activeCondition = st.additionalInfo?.condition || 'Average, normal use';
    if (refs.conditionButtons) {
      refs.conditionButtons.forEach((btn) => {
        const val = btn.getAttribute('data-edit-condition');
        const isSelected = val === activeCondition;
        btn.classList.toggle('active', isSelected);
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
    }

    const syncAddonCtrl = (key, valEl, minusBtn) => {
      const minFloor = confirmedQuote ? Number(confirmedQuote.addons?.[key]) || 0 : 0;
      const curVal = Number(st.addons?.[key]) || 0;
      if (valEl) valEl.textContent = `${curVal}`;
      if (minusBtn) minusBtn.disabled = curVal <= minFloor;
    };

    syncAddonCtrl('fridge', refs.editFridgeVal, refs.btnFridgeMinus);
    syncAddonCtrl('fridgeDouble', refs.editFridgeDoubleVal, refs.btnFridgeDoubleMinus);
    syncAddonCtrl('oven', refs.editOvenVal, refs.btnOvenMinus);
    syncAddonCtrl('laundry', refs.editLaundryVal, refs.btnLaundryMinus);
    syncAddonCtrl('organizing', refs.editOrganizingVal, refs.btnOrganizingMinus);
    syncAddonCtrl('dishes', refs.editDishesVal, refs.btnDishesMinus);
    syncAddonCtrl('windows', refs.editWindowsVal, refs.btnWindowsMinus);
    syncAddonCtrl('powerWashWindows', refs.editPowerWashVal, refs.btnPowerWashMinus);
  }

  function validateContactField(fieldName, rawValue) {
    const val = String(rawValue || '').trim();
    if (fieldName === 'firstName' || fieldName === 'lastName') {
      if (!val) {
        return { valid: false, message: fieldName === 'firstName' ? 'Enter your first name.' : 'Enter your last name.' };
      }
      if (val.length > 60 || !/[A-Za-z\u00C0-\u024F]/.test(val)) {
        return { valid: false, message: 'Please enter a valid name.' };
      }
      if (containsPhishingOrUrlLinks(val)) {
        return { valid: false, message: 'Links are not permitted in name fields.' };
      }
      return { valid: true, message: '' };
    }
    if (fieldName === 'phone') {
      if (!val) return { valid: false, message: 'Enter a 10-digit US phone number.' };
      const check = validateClientUsPhone(val);
      return check.valid
        ? { valid: true, message: '' }
        : { valid: false, message: 'Enter a valid 10-digit US phone number.' };
    }
    if (fieldName === 'email') {
      if (!val || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(val)) {
        return { valid: false, message: 'Enter a valid email address.' };
      }
      const domain = val.toLowerCase().split('@')[1] || '';
      if (DISPOSABLE_OR_FAKE_EMAIL_DOMAINS.has(domain) || COMMON_TYPO_EMAIL_DOMAINS.has(domain)) {
        return { valid: false, message: 'Check your email domain spelling.' };
      }
      return { valid: true, message: '' };
    }
    return { valid: true, message: '' };
  }

  function syncSingleContactFieldUI(fieldName, forceHint) {
    const refs = schedulerState.refs;
    const map = {
      firstName: { wrap: refs.firstWrap, input: refs.firstInput, hint: refs.firstHint },
      lastName: { wrap: refs.lastWrap, input: refs.lastInput, hint: refs.lastHint },
      phone: { wrap: refs.phoneWrap, input: refs.phoneInput, hint: refs.phoneHint },
      email: { wrap: refs.emailWrap, input: refs.emailInput, hint: refs.emailHint }
    };
    const entry = map[fieldName];
    if (!entry || !entry.wrap || !entry.input) return false;

    const raw = entry.input.value;
    const hasValue = raw.trim().length > 0;
    const res = validateContactField(fieldName, raw);
    const touched = Boolean(schedulerState.contactTouched[fieldName] || forceHint);

    entry.wrap.classList.toggle('is-field-valid', res.valid);
    const showInvalid = !res.valid && touched && (hasValue || Boolean(forceHint));
    entry.wrap.classList.toggle('is-field-invalid', showInvalid);
    entry.input.setAttribute('aria-invalid', showInvalid ? 'true' : 'false');

    if (entry.hint) {
      if (showInvalid && res.message) {
        entry.hint.textContent = res.message;
        entry.hint.classList.remove('is-hidden');
      } else {
        entry.hint.textContent = '';
        entry.hint.classList.add('is-hidden');
      }
    }
    return res.valid;
  }

  function syncAllContactValidationUI(forceHint) {
    const okFirst = syncSingleContactFieldUI('firstName', forceHint);
    const okLast = syncSingleContactFieldUI('lastName', forceHint);
    const okPhone = syncSingleContactFieldUI('phone', forceHint);
    const okEmail = syncSingleContactFieldUI('email', forceHint);
    return okFirst && okLast && okPhone && okEmail;
  }

  function getFirstInvalidContactInput() {
    const refs = schedulerState.refs;
    const order = [
      ['firstName', refs.firstInput],
      ['lastName', refs.lastInput],
      ['phone', refs.phoneInput],
      ['email', refs.emailInput]
    ];
    for (const [name, input] of order) {
      if (input && !validateContactField(name, input.value).valid) {
        return input;
      }
    }
    return null;
  }

  function getShortSlotWindowText(windowId) {
    const labels = {
      '08:00-11:00': '8:00 AM – 11:00 AM',
      '11:00-14:00': '11:00 AM – 2:00 PM',
      '14:00-16:30': '2:00 PM – 4:30 PM',
      '18:00-22:00': '6:00 PM – 10:00 PM',
      '21:00-01:00': '9:00 PM – 1:00 AM',
      '23:00-03:00': '11:00 PM – 3:00 AM'
    };
    return labels[windowId] || windowId || '';
  }

  function syncStickyFooterUI() {
    if (!modalStickyFooter) return;
    const isConfirmed = schedulerState.viewMode === 'confirmed';
    modalStickyFooter.classList.toggle('is-hidden', isConfirmed);
    if (isConfirmed) return;

    const quote = window.SmartsProCurrentQuote;
    const st = quote?.state || {};
    const grandTotal = Number(quote?.calculation?.grandTotal || 0);
    const isCommercial = st.serviceCategory === 'commercial';
    const isOvernight = isCommercial && st.frequency === 'overnight';

    if (modalStickyTotalLabel) {
      modalStickyTotalLabel.textContent = isCommercial
        ? isOvernight
          ? 'Overnight Baseline'
          : 'Walkthrough Baseline'
        : 'Estimated Quote';
    }
    if (modalStickyTotal) {
      modalStickyTotal.textContent = `$${grandTotal.toFixed(2)}`;
    }

    if (modalStickySlot) {
      if (schedulerState.selectedDate && schedulerState.selectedWindow) {
        const shortDate = formatFullDateUtc(schedulerState.selectedDate).replace(/,\s*\d{4}$/, '');
        const winText = getShortSlotWindowText(schedulerState.selectedWindow);
        modalStickySlot.textContent =
          schedulerState.viewMode === 'editing'
            ? `Locked: ${shortDate} · ${winText}`
            : `${shortDate} · ${winText}`;
      } else {
        modalStickySlot.textContent = 'Select an open day & time window';
      }
    }

    if (modalStickyCta) {
      if (schedulerState.isSubmitting) {
        modalStickyCta.disabled = true;
        modalStickyCta.textContent = 'Sending...';
      } else if (schedulerState.viewMode === 'editing' && schedulerState.confirmedSubmission) {
        const currentKey = computeCurrentSnapshotKey();
        const hasChanges = currentKey !== schedulerState.confirmedSubmission.snapshotKey;
        modalStickyCta.disabled = !hasChanges;
        modalStickyCta.textContent = hasChanges
          ? `Send Update ($${grandTotal.toFixed(2)})`
          : 'Make a Change Above';
      } else if (!schedulerState.selectedDate || !schedulerState.selectedWindow) {
        modalStickyCta.disabled = false;
        modalStickyCta.textContent = 'Pick an Open Time';
      } else if (getFirstInvalidContactInput()) {
        modalStickyCta.disabled = false;
        modalStickyCta.textContent = 'Continue to Contact';
      } else {
        modalStickyCta.disabled = false;
        modalStickyCta.textContent = 'Send Estimate & Request Slot';
      }
    }
  }

  /**
   * Anti-spam guard for the Submit button:
   * - In 'editing' mode, keeps the submit button disabled until the customer actually
   *   changes hours, additional info, add-ons, appointment time, or contact notes.
   */
  function updateSubmitButtonLockState() {
    const refs = schedulerState.refs;
    if (!refs.submitBtn || schedulerState.isSubmitting) {
      syncStickyFooterUI();
      return;
    }

    const quote = window.SmartsProCurrentQuote;
    const grandTotal = Number(quote?.calculation?.grandTotal || 0);

    if (schedulerState.viewMode === 'editing' && schedulerState.confirmedSubmission) {
      const currentKey = computeCurrentSnapshotKey();
      const hasChanges = currentKey !== schedulerState.confirmedSubmission.snapshotKey;
      refs.submitBtn.disabled = !hasChanges;
      refs.submitBtn.textContent = hasChanges
        ? `Send Updated Estimate ($${grandTotal.toFixed(2)})`
        : 'Make a change above to send update';
    } else {
      refs.submitBtn.disabled = false;
      refs.submitBtn.textContent = 'Send Estimate & Request Slot';
    }
    syncStickyFooterUI();
  }

  /**
   * Switches the modal to the locked Confirmation View after a successful submission,
   * preventing repeat-click spam while displaying full details and an "Edit Request" button.
   */
  function enterConfirmedView() {
    const refs = schedulerState.refs;
    const confirmed = schedulerState.confirmedSubmission;
    if (!confirmed || !refs.confirmationSection) return;

    schedulerState.viewMode = 'confirmed';
    syncStickyFooterUI();

    if (refs.calSection) refs.calSection.classList.add('is-hidden');
    if (refs.editAdjusterSection) refs.editAdjusterSection.classList.add('is-hidden');
    if (refs.intakeSection) refs.intakeSection.classList.add('is-hidden');
    refs.confirmationSection.classList.remove('is-hidden');

    refs.confirmationSection.replaceChildren();

    // 1. Confirmation Header Banner
    const topBadge = createEl(
      'div',
      `intake-confirmation-banner ${confirmed.statusType === 'warning' ? 'is-warning' : 'is-success'}`
    );
    const isWarningFallback = confirmed.statusType === 'warning';
    const hasVerifiedUpdateToken = Boolean(confirmed.updateToken);
    const updateNum = confirmed.updateCount || 1;
    const kicker = createEl(
      'span',
      'intake-confirmation-kicker',
      isWarningFallback
        ? 'ACTION REQUIRED • AUTOMATED EMAIL INCOMPLETE'
        : confirmed.isUpdated
          ? `UPDATED APPOINTMENT CONFIRMED (#${updateNum}) • TIME BLOCK LOCKED`
          : 'APPOINTMENT CONFIRMED • TIME BLOCK LOCKED'
    );
    const heading = createEl('h4', 'intake-confirmation-title', confirmed.headingText);
    const subcopy = createEl('p', 'intake-confirmation-copy', confirmed.detailText);
    topBadge.append(kicker, heading, subcopy);

    // 2. Submitted Request Details Card
    const detailsCard = createEl('div', 'intake-confirmation-details');
    const detailsHeading = createEl(
      'h5',
      'intake-confirmation-details-title',
      'Submitted Estimate & Appointment Summary'
    );
    const list = createEl('div', 'intake-confirmation-grid');

    const addDetailRow = (label, value, highlight) => {
      const row = createEl(
        'div',
        `intake-confirmation-row${highlight ? ' is-highlight' : ''}`
      );
      const lbl = createEl('span', 'intake-confirmation-label', label);
      const val = createEl('strong', 'intake-confirmation-value', value);
      row.append(lbl, val);
      list.append(row);
    };

    if (confirmed.referenceCode) {
      addDetailRow('Reference ID:', confirmed.referenceCode, false);
    }
    addDetailRow(
      'Customer Contact:',
      `${confirmed.customer.firstName} ${confirmed.customer.lastName} • ${confirmed.customer.phone} • ${confirmed.customer.email}`,
      false
    );
    addDetailRow(
      'Requested Cleaning Window:',
      `${confirmed.appointmentDateFormatted} • ${confirmed.appointmentWindowLabel}`,
      false
    );

    const q = confirmed.quote;
    const isCommercial = q.serviceCategory === 'commercial';
    const isSpecific = !isCommercial && q.scopeMode === 'specific';
    const specHrs = Math.max(1, Number(q.specificHours) || 1);
    const specPrice = specHrs * 50;
    if (isCommercial) {
      addDetailRow('Service Scope:', 'Commercial & Offices (On-Site Walkthrough)', false);
    } else {
      const tierLabel = serviceLabels[q.serviceType] || 'Residential Standard Clean';
      const livingTxt = Number(q.extraLivingRooms) > 0 ? `, ${q.extraLivingRooms} Extra Living` : '';
      addDetailRow(
        'Service & Property Scope:',
        `${tierLabel} • ${q.bedrooms} Bed, ${q.fullBaths} Full Bath, ${q.halfBaths} Half Bath${livingTxt} (${Number(q.sqft).toLocaleString()} sq ft)`,
        false
      );
      if (isSpecific) {
        addDetailRow(
          'Specific Areas Add-On:',
          `Level ${specHrs} (+$${specPrice})${q.specificAreasText ? `: ${q.specificAreasText}` : ''}`,
          false
        );
      }
    }

    if (!isCommercial && q.additionalInfo) {
      const info = q.additionalInfo;
      const petsText =
        info.hasPets === 'yes' || q.addons?.pets > 0 ? 'Yes (+$35 Pet Detailing)' : 'No Pets';
      addDetailRow(
        'Additional Home Info:',
        `Pets: ${petsText} • Condition: ${info.condition || 'Average, normal use'} • Last Cleaned: ${info.lastCleaned || '1-3 Months ago'}`,
        false
      );
    }

    const addonItems = [];
    if (q.addons?.fridge > 0) addonItems.push(`${q.addons.fridge}x Single Fridge (from $54.99)`);
    if (q.addons?.fridgeDouble > 0) addonItems.push(`${q.addons.fridgeDouble}x Double Fridge (from $64.99)`);
    if (q.addons?.oven > 0) addonItems.push(`${q.addons.oven}x Inside Oven (from $61.88)`);
    if (q.addons?.laundry > 0) {
      addonItems.push(
        `${q.addons.laundry}x Laundry Load${q.addons.laundry > 1 ? 's' : ''} — Wash, dry, and fold (from $48.98/load)`
      );
    }
    if (q.addons?.organizing > 0) {
      addonItems.push(`${q.addons.organizing}x Organizing per Area (from $29.60/area)`);
    }
    if (q.addons?.dishes > 0) addonItems.push(`${q.addons.dishes}x Dishes (from $24.78)`);
    if (q.addons?.windows > 0) addonItems.push(`${q.addons.windows}x Windows (from $8 ea)`);
    if (q.addons?.powerWashWindows > 0) {
      addonItems.push(
        `${q.addons.powerWashWindows}x Power Wash Window Set${q.addons.powerWashWindows > 1 ? 's' : ''} (from $25/set)`
      );
    }
    if (isSpecific) addonItems.push(`Specific Areas (Level ${specHrs}, +$${specPrice})`);
    if (q.addons?.pets > 0) addonItems.push('Pet Hair & Detailing ($35 flat fee)');
    addDetailRow(
      'Selected Add-Ons:',
      addonItems.length > 0 ? addonItems.join(', ') : 'None selected',
      false
    );

    if (q.serviceDetails) {
      addDetailRow('Details Needed:', q.serviceDetails, false);
    }

    if (confirmed.customer.notes) {
      addDetailRow('Additional Notes:', confirmed.customer.notes, false);
    }

    const confirmedFreqSurcharge = Number(confirmed.verifiedEstimate?.frequencySurcharge) || 0;
    const isConfirmedOvernight = isCommercial && q.frequency === 'overnight';
    addDetailRow(
      'Schedule Frequency:',
      freqLabels[q.frequency] || 'Weekly',
      false
    );
    if (confirmedFreqSurcharge > 0 || isConfirmedOvernight) {
      addDetailRow(
        'Schedule Adjustment:',
        `+$${confirmedFreqSurcharge.toFixed(2)}`,
        false
      );
    }

    if (confirmed.isUpdated && Number.isFinite(Number(confirmed.previousTotal))) {
      addDetailRow(
        'Previous Estimated Total:',
        `$${Number(confirmed.previousTotal).toFixed(2)}`,
        false
      );
    }

    addDetailRow(
      confirmed.isUpdated ? 'Updated Verified Total:' : 'Verified Estimate Total:',
      `$${Number(confirmed.verifiedEstimate.grandTotal || 0).toFixed(2)} (50% Deposit Required In Person)`,
      true
    );

    detailsCard.append(detailsHeading, list);

    let overnightConfirmNotice = null;
    if (isConfirmedOvernight) {
      overnightConfirmNotice = createEl(
        'div',
        'modal-overnight-banner',
        'Tentative Overnight Request Sent: Please call (318) 564-4360 or email smartsprosolutions@gmail.com to confirm keys, alarms, and scope.'
      );
      overnightConfirmNotice.id = 'confirmed-overnight-banner';
    }

    // 3. Edit / Next-Step Explanation Callout (with 24-hour cutoff check)
    const isCutoffLocked = !isWarningFallback && isConfirmedBookingWithin24Hours(confirmed);
    const editHint = createEl(
      'p',
      `intake-confirmation-edit-hint${isCutoffLocked ? ' is-cutoff-locked' : ''}`,
      isWarningFallback
        ? 'Email dispatch did not finish. Click below to open a pre-filled email to smartsprosolutions@gmail.com or call (318) 564-4360.'
        : isCutoffLocked
          ? 'Online changes lock 24 hours before arrival. Call (318) 564-4360 for last-minute changes. A 50% deposit is required in person.'
          : 'Your time, base service, and home size are locked (50% deposit required in person). Need to add extra items or Specific Areas? Click Edit Request up to 24 hours ahead (call (318) 564-4360 for removals or rescheduling).'
    );

    // 4. Action Buttons Row
    const actionsRow = createEl('div', 'intake-confirmation-actions');

    if (!isWarningFallback || hasVerifiedUpdateToken) {
      if (!isCutoffLocked) {
        const editBtn = createEl(
          'button',
          'btn btn-primary intake-edit-request-btn',
          'Edit Request (Add Items or Notes)'
        );
        editBtn.type = 'button';
        editBtn.id = 'btn-edit-confirmed-request';
        editBtn.addEventListener('click', enterEditRequestView);
        actionsRow.append(editBtn);
      }
    } else {
      const retryBtn = createEl(
        'button',
        'btn btn-primary intake-edit-request-btn',
        'Retry Automated Dispatch / Edit Details'
      );
      retryBtn.type = 'button';
      retryBtn.id = 'btn-retry-dispatch-request';
      retryBtn.addEventListener('click', () => {
        schedulerState.confirmedSubmission = null;
        schedulerState.viewMode = 'initial';
        syncContactFieldsLockState(false);
        if (refs.confirmationSection) refs.confirmationSection.classList.add('is-hidden');
        if (refs.editAdjusterSection) refs.editAdjusterSection.classList.add('is-hidden');
        if (refs.calSection) refs.calSection.classList.remove('is-hidden');
        if (refs.intakeSection) refs.intakeSection.classList.remove('is-hidden');
        if (refs.statusBanner) refs.statusBanner.classList.add('is-hidden');
        if (refs.intakeTitle) {
          refs.intakeTitle.textContent = '2. Your Contact Information';
        }
        renderCalendarUI();
        updateSubmitButtonLockState();
      });
      actionsRow.append(retryBtn);
    }

    if (confirmed.fallbackMailtoUrl) {
      const mailLink = createEl(
        'a',
        'btn btn-outline btn-sm',
        'Open Pre-Filled Email to smartsprosolutions@gmail.com'
      );
      mailLink.href = confirmed.fallbackMailtoUrl;
      actionsRow.append(mailLink);
    }

    if (confirmed.icsContent) {
      const icsBtn = createEl(
        'button',
        'btn btn-outline btn-sm',
        'Download Calendar Appointment (.ics)'
      );
      icsBtn.type = 'button';
      icsBtn.addEventListener('click', () => {
        triggerIcsDownload(confirmed.icsContent, confirmed.icsFilename);
      });
      actionsRow.append(icsBtn);
    }

    const doneBtn = createEl('button', 'btn btn-outline btn-sm', 'Done / Close Window');
    doneBtn.type = 'button';
    doneBtn.id = 'btn-close-confirmed-modal';
    doneBtn.addEventListener('click', closeBookingModal);
    actionsRow.append(doneBtn);

    if (overnightConfirmNotice) {
      refs.confirmationSection.append(
        topBadge,
        overnightConfirmNotice,
        detailsCard,
        editHint,
        actionsRow
      );
    } else {
      refs.confirmationSection.append(topBadge, detailsCard, editHint, actionsRow);
    }
  }

  /**
   * Switches from the Confirmation View into Edit Request mode, revealing the
   * Auto-Adjust Price Panel, Calendar Picker, and Contact/Notes form while keeping
   * the submit button locked until the user modifies at least one option.
   */
  function enterEditRequestView() {
    const refs = schedulerState.refs;
    if (isConfirmedBookingWithin24Hours(schedulerState.confirmedSubmission)) {
      enterConfirmedView();
      return;
    }
    schedulerState.viewMode = 'editing';

    if (schedulerState.confirmedSubmission?.appointment) {
      schedulerState.selectedDate = schedulerState.confirmedSubmission.appointment.preferredDate;
      schedulerState.selectedWindow = schedulerState.confirmedSubmission.appointment.preferredWindow;
      schedulerState.activeMonthKey = schedulerState.selectedDate.slice(0, 7);
    }

    // Restore any calculator field that might have been lowered outside the modal back up to the confirmed floor
    const cq = schedulerState.confirmedSubmission?.quote;
    if (cq && window.SmartsProCalculator && typeof window.SmartsProCalculator.applyQuoteAdjustments === 'function') {
      const curState = window.SmartsProCurrentQuote?.state || {};
      const enforcedPatch = {
        serviceType: cq.serviceType,
        bedrooms: cq.bedrooms,
        fullBaths: cq.fullBaths,
        halfBaths: cq.halfBaths,
        extraLivingRooms: cq.extraLivingRooms ?? 0,
        sqft: cq.sqft,
        frequency: cq.frequency,
        addons: {
          fridge: Math.max(Number(cq.addons?.fridge) || 0, Number(curState.addons?.fridge) || 0),
          fridgeDouble: Math.max(Number(cq.addons?.fridgeDouble) || 0, Number(curState.addons?.fridgeDouble) || 0),
          oven: Math.max(Number(cq.addons?.oven) || 0, Number(curState.addons?.oven) || 0),
          laundry: Math.max(Number(cq.addons?.laundry) || 0, Number(curState.addons?.laundry) || 0),
          organizing: Math.max(Number(cq.addons?.organizing) || 0, Number(curState.addons?.organizing) || 0),
          dishes: Math.max(Number(cq.addons?.dishes) || 0, Number(curState.addons?.dishes) || 0),
          windows: Math.max(Number(cq.addons?.windows) || 0, Number(curState.addons?.windows) || 0),
          powerWashWindows: Math.max(
            Number(cq.addons?.powerWashWindows) || 0,
            Number(curState.addons?.powerWashWindows) || 0
          )
        }
      };
      if (cq.additionalInfo?.hasPets === 'yes' || Number(cq.addons?.pets) > 0) {
        enforcedPatch.additionalInfo = { hasPets: 'yes' };
      }
      if (cq.scopeMode === 'specific') {
        enforcedPatch.scopeMode = 'specific';
        enforcedPatch.specificHours = Math.max(
          Number(cq.specificHours) || 1,
          Number(curState.specificHours) || 1
        );
        if (!curState.specificAreasText && cq.specificAreasText) {
          enforcedPatch.specificAreasText = cq.specificAreasText;
        }
      }
      if (!curState.serviceDetails && cq.serviceDetails) {
        enforcedPatch.serviceDetails = cq.serviceDetails;
      }
      window.SmartsProCalculator.applyQuoteAdjustments(enforcedPatch);
    }

    syncContactFieldsLockState(true);

    if (refs.confirmationSection) refs.confirmationSection.classList.add('is-hidden');
    if (refs.editAdjusterSection) refs.editAdjusterSection.classList.remove('is-hidden');
    if (refs.calSection) refs.calSection.classList.remove('is-hidden');
    if (refs.intakeSection) refs.intakeSection.classList.remove('is-hidden');
    if (refs.statusBanner) refs.statusBanner.classList.add('is-hidden');
    if (refs.postSubmitActions) refs.postSubmitActions.classList.add('is-hidden');

    if (refs.intakeTitle) {
      refs.intakeTitle.textContent = '3. Review Locked Contact Details & Add Notes';
    }

    refreshModalRecapUI();
    renderCalendarUI();
    syncEditAdjusterUI();
    updateSubmitButtonLockState();
  }

  /**
   * Mounts the Progressive-Enhanced Calendar Picker, Confirmation View,
   * Inline Edit & Auto-Adjust Price Panel, and Customer Contact Form
   * using safe DOM APIs (zero raw HTML sinks).
   */
  function ensureMountedUI() {
    if (schedulerState.mounted) return;
    schedulerState.mounted = true;

    // 1. Build Simple, Senior-Friendly Calendar Section (Mon-Fri, 8:00 AM - 4:30 PM)
    if (calendarMount) {
      const calSection = createEl('section', 'modal-scheduler-card');
      calSection.id = 'modal-scheduler-card';
      calSection.setAttribute('aria-label', 'Choose Cleaning Day and Time');

      const headerWrap = createEl('div', 'scheduler-header-wrap');
      const title = createEl('h4', 'scheduler-title', '1. Pick a Day & Time');
      const subtitle = createEl(
        'p',
        'scheduler-subtitle',
        'Mon–Fri, 8:00 AM – 4:30 PM · Up to 1 month ahead'
      );
      headerWrap.append(title, subtitle);

      const lockedBanner = createEl('div', 'calendar-locked-banner is-hidden');
      lockedBanner.id = 'calendar-locked-banner';
      lockedBanner.setAttribute('role', 'status');

      const overnightBanner = createEl('div', 'modal-overnight-banner is-hidden');
      overnightBanner.id = 'calendar-overnight-banner';
      overnightBanner.setAttribute('role', 'status');
      overnightBanner.textContent =
        'Overnight Business: Pick a tentative Mon–Fri night window (6–10 PM, 9 PM–1 AM, or 11 PM–3 AM), then call (318) 564-4360 to confirm keys, alarms, and scope.';

      // Month Switcher Bar (Current Month vs. Next Month) + Refresh Live Calendar Control
      const monthNavWrap = createEl('div', 'calendar-month-nav');
      monthNavWrap.id = 'calendar-month-nav';
      const monthTabs = createEl('div', 'calendar-month-tabs');
      monthTabs.id = 'calendar-month-tabs';
      monthTabs.setAttribute('role', 'tablist');
      monthTabs.setAttribute('aria-label', 'Select Calendar Month');

      const syncControlsWrap = createEl('div', 'calendar-sync-controls');
      const advanceLimitNote = createEl(
        'span',
        'calendar-advance-note',
        'Open 1 month ahead'
      );
      advanceLimitNote.id = 'calendar-advance-note';
      const refreshBtn = createEl('button', 'calendar-refresh-btn', 'Refresh Times');
      refreshBtn.type = 'button';
      refreshBtn.id = 'btn-refresh-calendar';
      refreshBtn.addEventListener('click', () => {
        loadCalendarSchedule(true);
      });
      syncControlsWrap.append(advanceLimitNote, refreshBtn);
      monthNavWrap.append(monthTabs, syncControlsWrap);

      // Side-by-Side Picker Grid: Left = Vertical iOS-Style Date Wheel, Right = Arrival Windows
      const pickerGrid = createEl('div', 'scheduler-picker-grid');

      const wheelCol = createEl('div', 'scheduler-wheel-col');
      const wheelHeaderRow = createEl('div', 'date-wheel-header-row');
      const wheelTitleGroup = createEl('div', 'date-wheel-title-group');
      const dateLabel = createEl('div', 'scheduler-step-label', 'Day (Mon–Fri)');
      const wheelHint = createEl('span', 'date-wheel-hint', 'Scroll or tap');
      wheelTitleGroup.append(dateLabel, wheelHint);

      const wheelControls = createEl('div', 'date-wheel-controls');
      const btnWheelPrev = createEl('button', 'date-wheel-nudge-btn');
      btnWheelPrev.type = 'button';
      btnWheelPrev.id = 'btn-wheel-prev';
      btnWheelPrev.setAttribute('aria-label', 'Previous open day');
      btnWheelPrev.append(createSvgIcon('18 15 12 9 6 15', 15, 2.4));
      btnWheelPrev.addEventListener('click', () => stepWheelSelectable(-1));

      const btnWheelNext = createEl('button', 'date-wheel-nudge-btn');
      btnWheelNext.type = 'button';
      btnWheelNext.id = 'btn-wheel-next';
      btnWheelNext.setAttribute('aria-label', 'Next open day');
      btnWheelNext.append(createSvgIcon('6 9 12 15 18 9', 15, 2.4));
      btnWheelNext.addEventListener('click', () => stepWheelSelectable(1));

      wheelControls.append(btnWheelPrev, btnWheelNext);
      wheelHeaderRow.append(wheelTitleGroup, wheelControls);

      const wheelFrame = createEl('div', 'date-wheel-frame');
      wheelFrame.id = 'calendar-date-wheel-frame';
      const wheelHighlight = createEl('div', 'date-wheel-highlight');
      wheelHighlight.setAttribute('aria-hidden', 'true');
      const wheelFadeTop = createEl('div', 'date-wheel-fade-top');
      wheelFadeTop.setAttribute('aria-hidden', 'true');
      const wheelFadeBottom = createEl('div', 'date-wheel-fade-bottom');
      wheelFadeBottom.setAttribute('aria-hidden', 'true');

      const dateGrid = createEl('div', 'calendar-date-grid calendar-date-wheel');
      dateGrid.id = 'calendar-date-grid';
      dateGrid.tabIndex = 0;
      dateGrid.setAttribute('role', 'listbox');
      dateGrid.setAttribute('aria-label', 'Available Cleaning Days (Scroll to select)');
      dateGrid.addEventListener('scroll', handleWheelScroll, { passive: true });
      dateGrid.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          stepWheelSelectable(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          stepWheelSelectable(-1);
        }
      });

      wheelFrame.append(wheelHighlight, wheelFadeTop, dateGrid, wheelFadeBottom);
      wheelCol.append(wheelHeaderRow, wheelFrame);

      // Time Window Grid Label & Container
      const slotCol = createEl('div', 'scheduler-slot-col');
      const slotLabel = createEl('div', 'scheduler-step-label', 'Arrival Window:');
      const slotGrid = createEl('div', 'calendar-slot-grid');
      slotGrid.id = 'calendar-slot-grid';
      slotGrid.setAttribute('role', 'group');
      slotGrid.setAttribute('aria-label', 'Available Arrival Time Windows');
      slotCol.append(slotLabel, slotGrid);

      pickerGrid.append(wheelCol, slotCol);

      // Selected Appointment Summary Banner
      const selectedSummary = createEl(
        'div',
        'selected-appointment-banner',
        'Selected Time: Loading schedule...'
      );
      selectedSummary.id = 'selected-appointment-banner';

      // Subtle, low-visual-noise Upcoming Bookings line
      const upcomingBox = createEl('div', 'upcoming-bookings-panel');
      const upcomingTitle = createEl(
        'span',
        'upcoming-bookings-title',
        'Booked slots:'
      );
      const upcomingList = createEl('div', 'upcoming-bookings-list');
      upcomingList.id = 'upcoming-bookings-list';
      upcomingBox.append(upcomingTitle, upcomingList);

      calSection.append(
        headerWrap,
        lockedBanner,
        overnightBanner,
        monthNavWrap,
        pickerGrid,
        selectedSummary,
        upcomingBox
      );
      calendarMount.append(calSection);

      schedulerState.refs.calSection = calSection;
      schedulerState.refs.calTitle = title;
      schedulerState.refs.calSubtitle = subtitle;
      schedulerState.refs.lockedBanner = lockedBanner;
      schedulerState.refs.overnightBanner = overnightBanner;
      schedulerState.refs.slotLabel = slotLabel;
      schedulerState.refs.monthTabs = monthTabs;
      schedulerState.refs.advanceLimitNote = advanceLimitNote;
      schedulerState.refs.refreshBtn = refreshBtn;
      schedulerState.refs.upcomingList = upcomingList;
      schedulerState.refs.wheelFrame = wheelFrame;
      schedulerState.refs.btnWheelPrev = btnWheelPrev;
      schedulerState.refs.btnWheelNext = btnWheelNext;
      schedulerState.refs.dateGrid = dateGrid;
      schedulerState.refs.slotGrid = slotGrid;
      schedulerState.refs.selectedSummary = selectedSummary;
    }

    // 2. Build Confirmation View, Inline Edit & Auto-Adjust Price Panel, and Contact Form
    if (intakeMount) {
      // 2A. Post-Submit Confirmation Card (hidden until estimate is submitted)
      const confirmationSection = createEl('section', 'modal-confirmation-card is-hidden');
      confirmationSection.id = 'intake-confirmation-card';
      confirmationSection.setAttribute('aria-live', 'polite');

      // 2B. Inline Edit & Auto-Adjust Price Panel (shown when user clicks "Edit Request")
      const editAdjusterSection = createEl('section', 'modal-edit-adjuster-card is-hidden');
      editAdjusterSection.id = 'intake-edit-adjuster-card';
      editAdjusterSection.setAttribute('aria-label', 'Edit Estimate Options and Additional Information');

      const editHeaderRow = createEl('div', 'edit-adjuster-header');
      const editTitleWrap = createEl('div', 'edit-adjuster-title-wrap');
      const editTitle = createEl(
        'h4',
        'scheduler-title',
        'Edit Request: Add-Ons & Home Info'
      );
      const editSub = createEl(
        'p',
        'scheduler-subtitle',
        'Your estimate updates automatically as you adjust items below.'
      );
      editTitleWrap.append(editTitle, editSub);

      const editLivePriceBadge = createEl(
        'div',
        'edit-live-price-badge',
        'Updated Total: $140.00'
      );
      editLivePriceBadge.id = 'edit-live-price-badge';
      editHeaderRow.append(editTitleWrap, editLivePriceBadge);

      // Control Group 1: Service Tier (Locked to confirmed booking tier once submitted)
      const modeGroup = createEl('div', 'edit-adjuster-group');
      const modeLabel = createEl(
        'div',
        'scheduler-step-label',
        'Service Tier (Locked):'
      );
      const modeBtnGrid = createEl('div', 'edit-chip-grid');

      const modeBtnStandard = createEl(
        'button',
        'edit-option-chip',
        'Standard Clean'
      );
      modeBtnStandard.type = 'button';
      modeBtnStandard.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission?.quote) return;
        handleModalQuoteAdjustment({ serviceType: 'standard' });
      });

      const modeBtnDeep = createEl(
        'button',
        'edit-option-chip',
        'Deep Clean'
      );
      modeBtnDeep.type = 'button';
      modeBtnDeep.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission?.quote) return;
        handleModalQuoteAdjustment({ serviceType: 'deep' });
      });

      modeBtnGrid.append(modeBtnStandard, modeBtnDeep);
      modeGroup.append(modeLabel, modeBtnGrid);

      // Control Group 1B: Bedrooms / Baths (Locked to confirmed property size once booked)
      const editRoomsRow = createEl('div', 'edit-adjuster-group');
      const roomsLabel = createEl(
        'div',
        'scheduler-step-label',
        'Home Size (Locked · Call (318) 564-4360 to change):'
      );
      const roomsStepperGrid = createEl('div', 'edit-rooms-grid');

      // Bedrooms Stepper
      const bedControl = createEl('div', 'edit-stepper-row');
      const btnBedMinus = createEl('button', 'edit-stepper-btn', '−');
      btnBedMinus.type = 'button';
      btnBedMinus.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission?.quote) return;
        const cur = Number(window.SmartsProCurrentQuote?.state?.bedrooms) || 3;
        handleModalQuoteAdjustment({ bedrooms: Math.max(1, cur - 1) });
      });
      const editBedVal = createEl('strong', 'edit-stepper-val', '3 Bed (Locked)');
      editBedVal.id = 'edit-bed-val';
      const btnBedPlus = createEl('button', 'edit-stepper-btn', '+');
      btnBedPlus.type = 'button';
      btnBedPlus.id = 'btn-edit-bed-plus';
      btnBedPlus.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission?.quote) return;
        const cur = Number(window.SmartsProCurrentQuote?.state?.bedrooms) || 3;
        handleModalQuoteAdjustment({ bedrooms: Math.min(8, cur + 1) });
      });
      bedControl.append(btnBedMinus, editBedVal, btnBedPlus);

      // Full Baths Stepper
      const bathControl = createEl('div', 'edit-stepper-row');
      const btnBathMinus = createEl('button', 'edit-stepper-btn', '−');
      btnBathMinus.type = 'button';
      btnBathMinus.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission?.quote) return;
        const cur = Number(window.SmartsProCurrentQuote?.state?.fullBaths) || 2;
        handleModalQuoteAdjustment({ fullBaths: Math.max(1, cur - 1) });
      });
      const editBathVal = createEl('strong', 'edit-stepper-val', '2 Full Bath (Locked)');
      editBathVal.id = 'edit-bath-val';
      const btnBathPlus = createEl('button', 'edit-stepper-btn', '+');
      btnBathPlus.type = 'button';
      btnBathPlus.id = 'btn-edit-bath-plus';
      btnBathPlus.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission?.quote) return;
        const cur = Number(window.SmartsProCurrentQuote?.state?.fullBaths) || 2;
        handleModalQuoteAdjustment({ fullBaths: Math.min(6, cur + 1) });
      });
      bathControl.append(btnBathMinus, editBathVal, btnBathPlus);

      roomsStepperGrid.append(bedControl, bathControl);
      editRoomsRow.append(roomsLabel, roomsStepperGrid);

      // Control Group 2: Additional Information (Pets & Home Condition)
      const addInfoGroup = createEl('div', 'edit-adjuster-group');
      const petsLabel = createEl(
        'div',
        'scheduler-step-label',
        'Pets in Home (+$35 flat fee):'
      );
      const petsGrid = createEl('div', 'edit-chip-grid');
      const petsBtnNo = createEl('button', 'edit-option-chip', 'No Pets ($0)');
      petsBtnNo.type = 'button';
      petsBtnNo.id = 'btn-edit-pets-no';
      petsBtnNo.addEventListener('click', () => {
        const cq = schedulerState.confirmedSubmission?.quote;
        if (cq && (cq.additionalInfo?.hasPets === 'yes' || Number(cq.addons?.pets) > 0)) {
          return;
        }
        handleModalQuoteAdjustment({ additionalInfo: { hasPets: 'no' } });
      });
      const petsBtnYes = createEl(
        'button',
        'edit-option-chip',
        'Yes, Pets (+$35)'
      );
      petsBtnYes.type = 'button';
      petsBtnYes.id = 'btn-edit-pets-yes';
      petsBtnYes.addEventListener('click', () => {
        handleModalQuoteAdjustment({ additionalInfo: { hasPets: 'yes' } });
      });
      petsGrid.append(petsBtnNo, petsBtnYes);

      const condLabel = createEl(
        'div',
        'scheduler-step-label',
        'Home Condition:'
      );
      const condGrid = createEl('div', 'edit-chip-grid');
      const conditionOptions = [
        'Well maintained',
        'Average, normal use',
        'Needs extra attention',
        'Heavy buildup'
      ];
      const conditionButtons = conditionOptions.map((condText) => {
        const btn = createEl('button', 'edit-option-chip', condText);
        btn.type = 'button';
        btn.setAttribute('data-edit-condition', condText);
        btn.addEventListener('click', () => {
          handleModalQuoteAdjustment({ additionalInfo: { condition: condText } });
        });
        condGrid.append(btn);
        return btn;
      });
      addInfoGroup.append(petsLabel, petsGrid, condLabel, condGrid);

      // Control Group 3: Custom Add-Ons (Starting-from items + Stackable Specific Areas Add-On)
      const addonsGroup = createEl('div', 'edit-adjuster-group');
      const addonsLabel = createEl(
        'div',
        'scheduler-step-label',
        'Add Extra Services or Details (confirmed items locked; prices starting from):'
      );
      const addonsGrid = createEl('div', 'edit-rooms-grid');

      const buildAddonStepper = (titleText, key, valId, maxQty = 5) => {
        const wrap = createEl('div', 'edit-addon-box');
        const nameSpan = createEl('span', 'edit-addon-name', titleText);
        const stepRow = createEl('div', 'edit-stepper-row');
        const minusBtn = createEl('button', 'edit-stepper-btn', '−');
        minusBtn.type = 'button';
        minusBtn.id = `btn-${valId}-minus`;
        minusBtn.addEventListener('click', () => {
          const minFloor = Number(schedulerState.confirmedSubmission?.quote?.addons?.[key]) || 0;
          const cur = Number(window.SmartsProCurrentQuote?.state?.addons?.[key]) || 0;
          handleModalQuoteAdjustment({ addons: { [key]: Math.max(minFloor, cur - 1) } });
        });
        const valEl = createEl('strong', 'edit-stepper-val', '0');
        valEl.id = valId;
        const plusBtn = createEl('button', 'edit-stepper-btn', '+');
        plusBtn.type = 'button';
        plusBtn.id = `btn-${valId}-plus`;
        plusBtn.addEventListener('click', () => {
          const cur = Number(window.SmartsProCurrentQuote?.state?.addons?.[key]) || 0;
          handleModalQuoteAdjustment({ addons: { [key]: Math.min(maxQty, cur + 1) } });
        });
        stepRow.append(minusBtn, valEl, plusBtn);
        wrap.append(nameSpan, stepRow);
        addonsGrid.append(wrap);
        return { valEl, minusBtn, plusBtn };
      };

      const fridgeCtrl = buildAddonStepper('Single Fridge (from $54.99)', 'fridge', 'edit-fridge-val');
      const fridgeDoubleCtrl = buildAddonStepper(
        'Double Fridge (from $64.99)',
        'fridgeDouble',
        'edit-fridge-double-val'
      );
      const ovenCtrl = buildAddonStepper('Inside Oven (from $61.88)', 'oven', 'edit-oven-val');
      const laundryCtrl = buildAddonStepper(
        'Laundry — Wash, dry & fold (from $48.98/load)',
        'laundry',
        'edit-laundry-val'
      );
      const organizingCtrl = buildAddonStepper(
        'Organizing per Area (from $29.60/area)',
        'organizing',
        'edit-organizing-val'
      );
      const dishesCtrl = buildAddonStepper('Dishes (from $24.78)', 'dishes', 'edit-dishes-val');
      const windowsCtrl = buildAddonStepper('Windows (from $8 ea)', 'windows', 'edit-windows-val', 30);
      const powerWashCtrl = buildAddonStepper(
        'Power Wash Window Sets (from $25/set)',
        'powerWashWindows',
        'edit-powerwash-val',
        30
      );

      // Details on what they may need done
      const editDetailsWrap = createEl('div', 'edit-specific-fields');
      const editDetailsLabel = createEl(
        'label',
        'intake-label',
        'Details on what you may need done (Optional):'
      );
      editDetailsLabel.setAttribute('for', 'edit-service-details-input');
      const editServiceDetailsInput = createEl('input', 'intake-input');
      editServiceDetailsInput.id = 'edit-service-details-input';
      editServiceDetailsInput.type = 'text';
      editServiceDetailsInput.maxLength = 500;
      editServiceDetailsInput.autocomplete = 'off';
      editServiceDetailsInput.placeholder = 'e.g., Extra baseboards, inside patio glass, laundry details...';
      editServiceDetailsInput.addEventListener('input', (e) => {
        handleModalQuoteAdjustment({
          serviceDetails: String(e.target.value || '')
        });
      });
      editDetailsWrap.append(editDetailsLabel, editServiceDetailsInput);

      // Specific Areas (Starting at +$50, Levels 1–6) Stackable Add-On Card
      const editSpecificCard = createEl('div', 'edit-specific-addon-card');
      const editSpecificTop = createEl('div', 'edit-specific-addon-top');
      const editSpecificTitle = createEl(
        'span',
        'edit-addon-name',
        'Specific Areas Add-On (Starting at +$50 · Levels 1–6)'
      );
      const editSpecificToggleBtn = createEl(
        'button',
        'edit-option-chip',
        '+ Add Specific Areas (Starting at +$50)'
      );
      editSpecificToggleBtn.type = 'button';
      editSpecificToggleBtn.id = 'btn-edit-specific-toggle';
      editSpecificToggleBtn.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission?.quote?.scopeMode === 'specific') {
          return;
        }
        const curMode = window.SmartsProCurrentQuote?.state?.scopeMode || 'full';
        handleModalQuoteAdjustment({ scopeMode: curMode === 'specific' ? 'full' : 'specific' });
      });
      editSpecificTop.append(editSpecificTitle, editSpecificToggleBtn);

      const editSpecificFields = createEl('div', 'edit-specific-fields is-hidden');
      const hoursStepperWrap = createEl('div', 'edit-stepper-row');
      const btnHoursMinus = createEl('button', 'edit-stepper-btn', '− 1 Level');
      btnHoursMinus.type = 'button';
      btnHoursMinus.id = 'btn-edit-hours-minus';
      btnHoursMinus.addEventListener('click', () => {
        const cq = schedulerState.confirmedSubmission?.quote;
        const minHrs =
          cq && cq.scopeMode === 'specific' ? Math.max(1, Number(cq.specificHours) || 1) : 1;
        const cur = Number(window.SmartsProCurrentQuote?.state?.specificHours) || 1;
        handleModalQuoteAdjustment({ scopeMode: 'specific', specificHours: Math.max(minHrs, cur - 1) });
      });
      const editHoursVal = createEl('strong', 'edit-stepper-val', 'Level 1 (+$50)');
      editHoursVal.id = 'edit-hours-val';
      const btnHoursPlus = createEl('button', 'edit-stepper-btn', '+ 1 Level');
      btnHoursPlus.type = 'button';
      btnHoursPlus.id = 'btn-edit-hours-plus';
      btnHoursPlus.addEventListener('click', () => {
        const cur = Number(window.SmartsProCurrentQuote?.state?.specificHours) || 1;
        handleModalQuoteAdjustment({ scopeMode: 'specific', specificHours: Math.min(6, cur + 1) });
      });
      hoursStepperWrap.append(btnHoursMinus, editHoursVal, btnHoursPlus);

      const editSpecificAreasLabel = createEl(
        'label',
        'intake-label',
        'Specific Areas Description (Required when Specific Areas Add-On is enabled):'
      );
      editSpecificAreasLabel.setAttribute('for', 'edit-specific-areas-input');
      const editSpecificAreasInput = createEl('input', 'intake-input');
      editSpecificAreasInput.id = 'edit-specific-areas-input';
      editSpecificAreasInput.type = 'text';
      editSpecificAreasInput.maxLength = 180;
      editSpecificAreasInput.autocomplete = 'off';
      editSpecificAreasInput.placeholder = 'e.g., Patio, sunroom, garage sweep, extra playroom';
      editSpecificAreasInput.addEventListener('input', (e) => {
        handleModalQuoteAdjustment({
          scopeMode: 'specific',
          specificAreasText: String(e.target.value || '')
        });
      });

      editSpecificFields.append(hoursStepperWrap, editSpecificAreasLabel, editSpecificAreasInput);
      editSpecificCard.append(editSpecificTop, editSpecificFields);
      addonsGroup.append(addonsLabel, addonsGrid, editDetailsWrap, editSpecificCard);

      // Cancel Edit Button (return to Confirmation Card without resending)
      const cancelEditRow = createEl('div', 'edit-cancel-row');
      const cancelEditBtn = createEl(
        'button',
        'btn btn-outline btn-sm',
        'Cancel Edit & Return to Confirmed Summary'
      );
      cancelEditBtn.type = 'button';
      cancelEditBtn.id = 'btn-cancel-edit-request';
      cancelEditBtn.addEventListener('click', enterConfirmedView);
      cancelEditRow.append(cancelEditBtn);

      editAdjusterSection.append(
        editHeaderRow,
        modeGroup,
        editRoomsRow,
        addInfoGroup,
        addonsGroup,
        cancelEditRow
      );

      // 2C. Customer Contact & Additional Notes Section
      const intakeSection = createEl('section', 'modal-intake-card');
      intakeSection.id = 'modal-intake-card';
      intakeSection.setAttribute('aria-label', 'Your Contact Details');

      const headerWrap = createEl('div', 'scheduler-header-wrap');
      const title = createEl('h4', 'scheduler-title', '2. Your Contact Info');
      const subtitle = createEl(
        'p',
        'scheduler-subtitle',
        'We email your quote and confirm your slot — 50% deposit required in person.'
      );
      headerWrap.append(title, subtitle);

      const fieldsGrid = createEl('div', 'intake-fields-grid');

      const buildCheckableField = (fieldKey, id, labelText, type, maxLength, autocomplete, placeholder) => {
        const wrap = createEl('div', 'intake-field-group');
        const label = createEl('label', 'intake-label', labelText);
        label.setAttribute('for', id);
        const inputWrap = createEl('div', 'intake-input-wrap');
        const input = createEl('input', 'intake-input intake-input-checkable');
        input.id = id;
        input.type = type;
        input.maxLength = maxLength;
        input.required = true;
        input.autocomplete = autocomplete;
        input.placeholder = placeholder;

        const validIcon = createEl('span', 'intake-valid-icon');
        validIcon.setAttribute('aria-hidden', 'true');
        validIcon.append(createSvgIcon('20 6 9 17 4 12', 16, 2.8));

        const hint = createEl('span', 'intake-field-hint is-hidden');
        hint.id = `${id}-hint`;
        hint.setAttribute('role', 'alert');

        input.addEventListener('input', () => {
          syncSingleContactFieldUI(fieldKey, false);
          updateSubmitButtonLockState();
        });
        input.addEventListener('blur', () => {
          schedulerState.contactTouched[fieldKey] = true;
          if (fieldKey === 'phone') {
            const check = validateClientUsPhone(input.value);
            if (check.valid) {
              input.value = check.formatted;
            }
          }
          syncSingleContactFieldUI(fieldKey, false);
          updateSubmitButtonLockState();
        });

        inputWrap.append(input, validIcon);
        wrap.append(label, inputWrap, hint);
        return { wrap, input, hint };
      };

      const firstField = buildCheckableField(
        'firstName',
        'intake-first-name',
        'First Name *',
        'text',
        60,
        'given-name',
        'First name'
      );
      const lastField = buildCheckableField(
        'lastName',
        'intake-last-name',
        'Last Name *',
        'text',
        60,
        'family-name',
        'Last name'
      );
      const phoneField = buildCheckableField(
        'phone',
        'intake-phone',
        'Phone Number *',
        'tel',
        32,
        'tel',
        '(318) 555-0199'
      );
      const emailField = buildCheckableField(
        'email',
        'intake-email',
        'Email Address *',
        'email',
        254,
        'email',
        'you@example.com'
      );

      const firstInput = firstField.input;
      const lastInput = lastField.input;
      const phoneInput = phoneField.input;
      const emailInput = emailField.input;

      fieldsGrid.append(firstField.wrap, lastField.wrap, phoneField.wrap, emailField.wrap);

      // Additional Notes
      const notesWrap = createEl('div', 'intake-field-group intake-field-full');
      const notesLabel = createEl(
        'label',
        'intake-label',
        'Notes (Optional)'
      );
      notesLabel.setAttribute('for', 'intake-notes');
      const notesInput = createEl('textarea', 'intake-textarea');
      notesInput.id = 'intake-notes';
      notesInput.rows = 3;
      notesInput.maxLength = 1000;
      notesInput.placeholder =
        'Priority rooms, pets, or entry notes...';
      notesInput.addEventListener('input', updateSubmitButtonLockState);
      notesWrap.append(notesLabel, notesInput);

      // Honeypot field (hidden via CSS class)
      const honeyWrap = createEl('div', 'intake-honeypot-wrap');
      honeyWrap.setAttribute('aria-hidden', 'true');
      const honeyInput = createEl('input', 'intake-input');
      honeyInput.id = 'intake-company-website';
      honeyInput.type = 'text';
      honeyInput.tabIndex = -1;
      honeyInput.autocomplete = 'off';
      honeyWrap.append(honeyInput);

      // Status / Receipt Banner
      const statusBanner = createEl('div', 'intake-status-banner is-hidden');
      statusBanner.id = 'intake-status-banner';
      statusBanner.setAttribute('role', 'status');
      statusBanner.setAttribute('aria-live', 'polite');

      // Fallback / Calendar Download Actions Container
      const postSubmitActions = createEl('div', 'intake-post-actions is-hidden');
      postSubmitActions.id = 'intake-post-actions';

      // Explicit Form Consent, 18+ Age & Zero-Cookie / Data Deletion Disclosure
      const consentNote = createEl(
        'p',
        'intake-consent-note',
        'By sending, you confirm you are 18+ and accept our Privacy, Terms & No-Refunds Policy (50% deposit required in person; 10% fee on bounced checks). Zero tracking cookies or online payment; delete data anytime at smartsprosolutions@gmail.com.'
      );
      consentNote.id = 'intake-consent-note';

      // Submit Button
      const submitBtn = createEl(
        'button',
        'btn btn-green btn-lg intake-submit-btn',
        'Send Estimate & Request Slot'
      );
      submitBtn.type = 'button';
      submitBtn.id = 'btn-submit-estimate-email';
      submitBtn.addEventListener('click', handleEstimateSubmit);

      intakeSection.append(
        headerWrap,
        fieldsGrid,
        notesWrap,
        honeyWrap,
        statusBanner,
        postSubmitActions,
        consentNote,
        submitBtn
      );
      intakeMount.append(confirmationSection, editAdjusterSection, intakeSection);

      schedulerState.refs.confirmationSection = confirmationSection;
      schedulerState.refs.editAdjusterSection = editAdjusterSection;
      schedulerState.refs.editLivePriceBadge = editLivePriceBadge;
      schedulerState.refs.modeGroup = modeGroup;
      schedulerState.refs.modeBtnStandard = modeBtnStandard;
      schedulerState.refs.modeBtnDeep = modeBtnDeep;
      schedulerState.refs.editRoomsRow = editRoomsRow;
      schedulerState.refs.btnBedMinus = btnBedMinus;
      schedulerState.refs.btnBedPlus = btnBedPlus;
      schedulerState.refs.btnBathMinus = btnBathMinus;
      schedulerState.refs.btnBathPlus = btnBathPlus;
      schedulerState.refs.editSpecificCard = editSpecificCard;
      schedulerState.refs.editSpecificToggleBtn = editSpecificToggleBtn;
      schedulerState.refs.editSpecificFields = editSpecificFields;
      schedulerState.refs.editSpecificAreasInput = editSpecificAreasInput;
      schedulerState.refs.editServiceDetailsInput = editServiceDetailsInput;
      schedulerState.refs.editHoursVal = editHoursVal;
      schedulerState.refs.btnHoursMinus = btnHoursMinus;
      schedulerState.refs.btnHoursPlus = btnHoursPlus;
      schedulerState.refs.editBedVal = editBedVal;
      schedulerState.refs.editBathVal = editBathVal;
      schedulerState.refs.petsBtnNo = petsBtnNo;
      schedulerState.refs.petsBtnYes = petsBtnYes;
      schedulerState.refs.conditionButtons = conditionButtons;
      schedulerState.refs.editFridgeVal = fridgeCtrl.valEl;
      schedulerState.refs.btnFridgeMinus = fridgeCtrl.minusBtn;
      schedulerState.refs.editFridgeDoubleVal = fridgeDoubleCtrl.valEl;
      schedulerState.refs.btnFridgeDoubleMinus = fridgeDoubleCtrl.minusBtn;
      schedulerState.refs.editOvenVal = ovenCtrl.valEl;
      schedulerState.refs.btnOvenMinus = ovenCtrl.minusBtn;
      schedulerState.refs.editLaundryVal = laundryCtrl.valEl;
      schedulerState.refs.btnLaundryMinus = laundryCtrl.minusBtn;
      schedulerState.refs.editOrganizingVal = organizingCtrl.valEl;
      schedulerState.refs.btnOrganizingMinus = organizingCtrl.minusBtn;
      schedulerState.refs.editDishesVal = dishesCtrl.valEl;
      schedulerState.refs.btnDishesMinus = dishesCtrl.minusBtn;
      schedulerState.refs.editWindowsVal = windowsCtrl.valEl;
      schedulerState.refs.btnWindowsMinus = windowsCtrl.minusBtn;
      schedulerState.refs.editPowerWashVal = powerWashCtrl.valEl;
      schedulerState.refs.btnPowerWashMinus = powerWashCtrl.minusBtn;
      schedulerState.refs.intakeSection = intakeSection;
      schedulerState.refs.intakeTitle = title;
      schedulerState.refs.firstWrap = firstField.wrap;
      schedulerState.refs.firstHint = firstField.hint;
      schedulerState.refs.lastWrap = lastField.wrap;
      schedulerState.refs.lastHint = lastField.hint;
      schedulerState.refs.phoneWrap = phoneField.wrap;
      schedulerState.refs.phoneHint = phoneField.hint;
      schedulerState.refs.emailWrap = emailField.wrap;
      schedulerState.refs.emailHint = emailField.hint;
      schedulerState.refs.firstInput = firstInput;
      schedulerState.refs.lastInput = lastInput;
      schedulerState.refs.phoneInput = phoneInput;
      schedulerState.refs.emailInput = emailInput;
      schedulerState.refs.notesInput = notesInput;
      schedulerState.refs.honeyInput = honeyInput;
      schedulerState.refs.statusBanner = statusBanner;
      schedulerState.refs.postSubmitActions = postSubmitActions;
      schedulerState.refs.submitBtn = submitBtn;
    }
  }

  function getDaySlotsForDay(dayObj, isOvernightMode) {
    if (!dayObj) return [];
    if (isOvernightMode) {
      if (Array.isArray(dayObj.overnightSlots) && dayObj.overnightSlots.length > 0) {
        return dayObj.overnightSlots;
      }
      const holidayName = dayObj.holidayName || null;
      return [
        {
          slotId: '18:00-22:00',
          label: 'Evening Overnight (6:00 PM – 10:00 PM)',
          shortLabel: '6:00 PM – 10:00 PM',
          status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
          isOvernight: true,
          serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available (Tentative)'
        },
        {
          slotId: '21:00-01:00',
          label: 'Late Night Overnight (9:00 PM – 1:00 AM)',
          shortLabel: '9:00 PM – 1:00 AM',
          status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
          isOvernight: true,
          serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available (Tentative)'
        },
        {
          slotId: '23:00-03:00',
          label: 'Overnight Shift (11:00 PM – 3:00 AM)',
          shortLabel: '11:00 PM – 3:00 AM',
          status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
          isOvernight: true,
          serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available (Tentative)'
        }
      ];
    }
    return dayObj.slots || [];
  }

  function renderCalendarUI() {
    const {
      calTitle,
      calSubtitle,
      lockedBanner,
      overnightBanner,
      slotLabel,
      monthTabs,
      advanceLimitNote,
      upcomingList,
      dateGrid,
      slotGrid,
      selectedSummary
    } = schedulerState.refs;
    if (!dateGrid || !slotGrid) return;

    const isOvernightMode = isActiveOvernightMode();
    const confirmedInfo = schedulerState.confirmedSubmission
      ? {
          date: schedulerState.confirmedSubmission.appointment?.preferredDate || '',
          window: schedulerState.confirmedSubmission.appointment?.preferredWindow || '',
          startMinutes: schedulerState.confirmedSubmission.confirmedStartMinutes,
          endMinutes: schedulerState.confirmedSubmission.confirmedEndMinutes
        }
      : { date: '', window: '', startMinutes: null, endMinutes: null };
    const confirmedDate = confirmedInfo.date;
    const confirmedWindow = confirmedInfo.window;
    const isLockedEditMode =
      schedulerState.viewMode === 'editing' && Boolean(confirmedDate && confirmedWindow);
    const durInfo = getActiveDurationInfo();
    const busyIntervals = schedulerState.busyIntervals || [];

    const getDaySlots = (dayObj) => getDaySlotsForDay(dayObj, isOvernightMode);

    if (isLockedEditMode) {
      schedulerState.selectedDate = confirmedDate;
      schedulerState.selectedWindow = confirmedWindow;
      schedulerState.activeMonthKey = confirmedDate.slice(0, 7);
    }

    if (calTitle) {
      if (isLockedEditMode) {
        calTitle.textContent = '1. Reserved Time (Locked)';
      } else if (isOvernightMode) {
        calTitle.textContent = '1. Pick a Tentative Overnight Slot';
      } else {
        calTitle.textContent = '1. Pick a Day & Time';
      }
    }
    if (calSubtitle) {
      if (isLockedEditMode) {
        calSubtitle.textContent =
          'Your time is locked. Add extras below, or call (318) 564-4360 to reschedule.';
      } else if (isOvernightMode) {
        calSubtitle.textContent =
          'Mon–Fri nights (6:00 PM – 3:00 AM) · Tentative pending call at (318) 564-4360.';
      } else {
        calSubtitle.textContent =
          'Mon–Fri, 8:00 AM – 4:30 PM · Up to 1 month ahead.';
      }
    }
    if (overnightBanner) {
      overnightBanner.classList.toggle('is-hidden', !isOvernightMode);
    }
    if (slotLabel) {
      slotLabel.textContent = isOvernightMode
        ? 'Overnight Window (Mon–Fri):'
        : 'Arrival Window:';
    }

    const countOpenSlotsForDay = (dayObj) => {
      if (!dayObj || dayObj.holidayName || dayObj.withinAdvanceWindow === false) return 0;
      return getDaySlots(dayObj).filter((slot) =>
        evaluateClientSlot(
          dayObj,
          slot,
          durInfo.durationMinutes,
          confirmedInfo,
          busyIntervals
        ).selectable
      ).length;
    };

    // 1. Render subtle Upcoming Bookings summary chips (isolated to daytime vs overnight)
    if (upcomingList) {
      upcomingList.replaceChildren();
      const items = (schedulerState.upcomingBookings || []).filter(
        (item) => Boolean(item.isOvernight) === isOvernightMode
      );
      if (items.length === 0) {
        const emptyChip = createEl(
          'span',
          'upcoming-booking-chip',
          isOvernightMode
            ? 'All weekday night windows are currently open'
            : 'All weekday windows are currently open'
        );
        upcomingList.append(emptyChip);
      } else {
        items.slice(0, 4).forEach((item) => {
          const shortDate = item.dateFormatted.replace(/,\s*\d{4}$/, '');
          const chip = createEl(
            'span',
            'upcoming-booking-chip',
            `${shortDate} (${item.slotLabel})`
          );
          upcomingList.append(chip);
        });
      }
    }

    // Ensure valid selectedDate from availableDates that has at least 1 eligible slot
    const dates = schedulerState.availableDates || [];
    if (!isLockedEditMode && dates.length > 0) {
      const currentFound = dates.find((d) => d.date === schedulerState.selectedDate);
      if (!currentFound || countOpenSlotsForDay(currentFound) === 0) {
        const firstOpenDate = dates.find((d) => countOpenSlotsForDay(d) > 0) || dates[0];
        schedulerState.selectedDate = firstOpenDate.date;
      }
    }

    const months = schedulerState.calendarMonths || [];
    if (months.length > 0) {
      const hasActiveMonth = months.some((m) => m.monthKey === schedulerState.activeMonthKey);
      if (!hasActiveMonth) {
        const currentMonthWithDays = months.find((m) => m.days && m.days.length > 0) || months[0];
        schedulerState.activeMonthKey = currentMonthWithDays.monthKey;
      }
    }

    // Render Month Switcher Tabs (Current Month vs. Next Month)
    if (monthTabs) {
      monthTabs.replaceChildren();
      months.forEach((mObj, idx) => {
        const isCurrentTab = mObj.monthKey === schedulerState.activeMonthKey;
        const tabLabel = idx === 0 ? `${mObj.monthLabel} (This Month)` : `${mObj.monthLabel} (Next Month)`;
        const tabBtn = createEl(
          'button',
          `calendar-month-tab${isCurrentTab ? ' active' : ''}${isLockedEditMode ? ' is-locked-control' : ''}`,
          tabLabel
        );
        tabBtn.type = 'button';
        tabBtn.disabled = isLockedEditMode;
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-selected', isCurrentTab ? 'true' : 'false');
        tabBtn.setAttribute('data-cal-month', mObj.monthKey);
        if (!isLockedEditMode) {
          tabBtn.addEventListener('click', () => {
            schedulerState.activeMonthKey = mObj.monthKey;
            const firstSelectableInMonth = (mObj.days || []).find(
              (d) => countOpenSlotsForDay(d) > 0
            );
            if (firstSelectableInMonth) {
              schedulerState.selectedDate = firstSelectableInMonth.date;
            }
            renderCalendarUI();
            updateSubmitButtonLockState();
          });
        }
        monthTabs.append(tabBtn);
      });
    }

    if (advanceLimitNote) {
      if (isLockedEditMode) {
        advanceLimitNote.textContent = 'Time block locked for this edit session';
      } else if (months.length >= 2) {
        advanceLimitNote.textContent = `Open for ${months[0].monthLabel} & ${months[1].monthLabel}`;
      } else {
        advanceLimitNote.textContent = 'Open for current & next month';
      }
    }

    const activeDateObj = dates.find((d) => d.date === schedulerState.selectedDate) || dates[0];
    const activeDaySlots = getDaySlots(activeDateObj);
    if (!isLockedEditMode && activeDateObj) {
      const evaluatedActiveSlots = activeDaySlots.map((s) => ({
        slot: s,
        evalResult: evaluateClientSlot(
          activeDateObj,
          s,
          durInfo.durationMinutes,
          confirmedInfo,
          busyIntervals
        )
      }));
      const currentMatch = evaluatedActiveSlots.find(
        (entry) => entry.slot.slotId === schedulerState.selectedWindow && entry.evalResult.selectable
      );
      if (!currentMatch) {
        const firstEligible = evaluatedActiveSlots.find((entry) => entry.evalResult.selectable);
        schedulerState.selectedWindow = firstEligible ? firstEligible.slot.slotId : '';
      }
    }

    // 2. Render Vertical iOS-Style Scroll Wheel Weekday Items for Active Month
    dateGrid.replaceChildren();
    const activeMonthObj = months.find((m) => m.monthKey === schedulerState.activeMonthKey);
    const daysToRender =
      activeMonthObj && Array.isArray(activeMonthObj.days) && activeMonthObj.days.length > 0
        ? activeMonthObj.days
        : dates;

    schedulerState.wheelDays = daysToRender;
    if (schedulerState.refs.wheelFrame) {
      schedulerState.refs.wheelFrame.classList.toggle('is-locked-wheel', isLockedEditMode);
    }

    let selectedIdx = 0;
    daysToRender.forEach((dayObj, idx) => {
      const isHoliday = Boolean(dayObj.holidayName);
      const isBeyondLimit = dayObj.withinAdvanceWindow === false && !isHoliday;
      const openCount = countOpenSlotsForDay(dayObj);
      const isFull = !isHoliday && !isBeyondLimit && openCount === 0;
      const isSelected = dayObj.date === schedulerState.selectedDate && (!isFull || isLockedEditMode);
      const isDisabled = isLockedEditMode || isHoliday || isBeyondLimit || isFull;
      if (dayObj.date === schedulerState.selectedDate) {
        selectedIdx = idx;
      }

      const btn = createEl(
        'button',
        `calendar-date-btn calendar-wheel-item${isSelected ? ' active' : ''}${isDisabled && !isSelected ? ' is-full' : ''}${isLockedEditMode ? ' is-locked-control' : ''}`
      );
      btn.type = 'button';
      btn.disabled = isDisabled;
      btn.setAttribute('role', 'option');
      btn.setAttribute('data-cal-date', dayObj.date);
      btn.setAttribute('data-wheel-index', String(idx));
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

      const parts = dayObj.dateFormatted.split(',');
      const weekday = (parts[0] || '').trim();
      const monthDay = (parts[1] || dayObj.date).trim();

      let metaLabel = openCount === 1 ? '1 open' : `${openCount} open`;
      if (isLockedEditMode && isSelected) metaLabel = 'Locked ✓';
      else if (isLockedEditMode) metaLabel = 'Locked';
      else if (isHoliday) metaLabel = 'Holiday';
      else if (isBeyondLimit) metaLabel = '1-Mo Limit';
      else if (isFull) metaLabel = 'Full';
      else if (isSelected) metaLabel = 'Selected ✓';

      const dayTop = createEl('span', 'cal-date-weekday', weekday);
      const dayMain = createEl('strong', 'cal-date-main', monthDay);
      const dayMeta = createEl('span', 'cal-date-meta', metaLabel);
      btn.append(dayTop, dayMain, dayMeta);

      if (!isDisabled) {
        btn.addEventListener('click', () => {
          schedulerState.selectedDate = dayObj.date;
          syncWheelActiveRowMetadata(idx);
          scrollWheelToIndex(idx, true);
          renderCalendarSlotsAndStatus(dayObj);
          updateSubmitButtonLockState();
        });
      }

      dateGrid.append(btn);
    });

    applyWheelVisualClasses(selectedIdx);
    scrollWheelToIndex(selectedIdx, false);
    requestAnimationFrame(() => recenterActiveWheelDate(false));
    syncWheelNudgeButtons();

    // 3. Render Arrival Windows & Status Banners for Active Day
    const centeredDayObj = daysToRender[selectedIdx] || activeDateObj;
    renderCalendarSlotsAndStatus(centeredDayObj);
  }

  function applyWheelVisualClasses(centerIdx) {
    const { dateGrid } = schedulerState.refs;
    if (!dateGrid) return;
    const buttons = dateGrid.children;
    for (let i = 0; i < buttons.length; i++) {
      const dist = Math.abs(i - centerIdx);
      buttons[i].classList.toggle('is-wheel-center', dist === 0);
      buttons[i].classList.toggle('is-wheel-near', dist === 1);
    }
  }

  function syncWheelActiveRowMetadata(selectedIdx) {
    const { dateGrid } = schedulerState.refs;
    if (!dateGrid) return;
    const isLockedEditMode =
      schedulerState.viewMode === 'editing' &&
      Boolean(schedulerState.confirmedSubmission?.appointment?.preferredDate);
    const days = schedulerState.wheelDays || [];
    const buttons = dateGrid.children;
    const isOvernightMode = isActiveOvernightMode();
    const durInfo = getActiveDurationInfo();
    const busyIntervals = schedulerState.busyIntervals || [];
    const confirmedInfo = schedulerState.confirmedSubmission
      ? {
          date: schedulerState.confirmedSubmission.appointment?.preferredDate || '',
          window: schedulerState.confirmedSubmission.appointment?.preferredWindow || '',
          startMinutes: schedulerState.confirmedSubmission.confirmedStartMinutes,
          endMinutes: schedulerState.confirmedSubmission.confirmedEndMinutes
        }
      : { date: '', window: '', startMinutes: null, endMinutes: null };

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const dayObj = days[i];
      if (!dayObj) continue;
      const isSelected = i === selectedIdx && !btn.disabled;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      const metaEl = btn.querySelector('.cal-date-meta');
      if (metaEl && !btn.disabled && !isLockedEditMode) {
        if (isSelected) {
          metaEl.textContent = 'Selected ✓';
        } else {
          const slots = getDaySlotsForDay(dayObj, isOvernightMode);
          const openCount = slots.filter((s) =>
            evaluateClientSlot(dayObj, s, durInfo.durationMinutes, confirmedInfo, busyIntervals).selectable
          ).length;
          metaEl.textContent = openCount === 1 ? '1 open' : `${openCount} open`;
        }
      }
    }
  }

  function scrollWheelToIndex(idx, smooth) {
    const { dateGrid } = schedulerState.refs;
    if (!dateGrid) return;
    const targetTop = Math.max(0, idx * WHEEL_ITEM_HEIGHT);
    const useSmooth = Boolean(smooth) && !prefersReducedMotion();
    schedulerState.wheelSuppressUntil = Date.now() + (useSmooth ? 360 : 180);
    if (useSmooth && typeof dateGrid.scrollTo === 'function') {
      dateGrid.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else if (typeof dateGrid.scrollTo === 'function') {
      dateGrid.scrollTo({ top: targetTop, behavior: 'instant' });
      dateGrid.scrollTop = targetTop;
    } else {
      dateGrid.scrollTop = targetTop;
    }
    applyWheelVisualClasses(idx);
  }

  function recenterActiveWheelDate(smooth) {
    const days = schedulerState.wheelDays || [];
    if (days.length === 0) return;
    const idx = Math.max(
      0,
      days.findIndex((d) => d.date === schedulerState.selectedDate)
    );
    scrollWheelToIndex(idx, smooth);
  }

  function syncWheelNudgeButtons() {
    const { dateGrid, btnWheelPrev, btnWheelNext } = schedulerState.refs;
    if (!dateGrid || !btnWheelPrev || !btnWheelNext) return;
    const isLockedEditMode =
      schedulerState.viewMode === 'editing' &&
      Boolean(schedulerState.confirmedSubmission?.appointment?.preferredDate);
    if (isLockedEditMode) {
      btnWheelPrev.disabled = true;
      btnWheelNext.disabled = true;
      return;
    }
    const buttons = Array.from(dateGrid.children);
    const curIdx = buttons.findIndex((b) => b.getAttribute('data-cal-date') === schedulerState.selectedDate);
    const hasPrev = curIdx > 0 && buttons.slice(0, curIdx).some((b) => !b.disabled);
    const hasNext = curIdx >= 0 && buttons.slice(curIdx + 1).some((b) => !b.disabled);
    btnWheelPrev.disabled = !hasPrev;
    btnWheelNext.disabled = !hasNext;
  }

  function stepWheelSelectable(direction) {
    const { dateGrid } = schedulerState.refs;
    if (!dateGrid) return;
    const isLockedEditMode =
      schedulerState.viewMode === 'editing' &&
      Boolean(schedulerState.confirmedSubmission?.appointment?.preferredDate);
    if (isLockedEditMode) return;

    const days = schedulerState.wheelDays || [];
    const buttons = Array.from(dateGrid.children);
    if (days.length === 0 || buttons.length === 0) return;

    const curIdx = Math.max(
      0,
      Math.min(days.length - 1, Math.round(dateGrid.scrollTop / WHEEL_ITEM_HEIGHT))
    );
    let nextIdx = curIdx + direction;
    while (nextIdx >= 0 && nextIdx < buttons.length) {
      if (!buttons[nextIdx].disabled) {
        const dayObj = days[nextIdx];
        schedulerState.selectedDate = dayObj.date;
        syncWheelActiveRowMetadata(nextIdx);
        scrollWheelToIndex(nextIdx, true);
        syncWheelNudgeButtons();
        renderCalendarSlotsAndStatus(dayObj);
        updateSubmitButtonLockState();
        return;
      }
      nextIdx += direction;
    }
  }

  function handleWheelScroll() {
    const { dateGrid } = schedulerState.refs;
    if (!dateGrid) return;
    const days = schedulerState.wheelDays || [];
    if (days.length === 0) return;

    if (!schedulerState.wheelRafPending) {
      schedulerState.wheelRafPending = true;
      requestAnimationFrame(() => {
        schedulerState.wheelRafPending = false;
        const idx = Math.max(
          0,
          Math.min(days.length - 1, Math.round(dateGrid.scrollTop / WHEEL_ITEM_HEIGHT))
        );
        applyWheelVisualClasses(idx);
      });
    }

    if (Date.now() < schedulerState.wheelSuppressUntil) return;

    if (schedulerState.wheelScrollTimer) {
      clearTimeout(schedulerState.wheelScrollTimer);
    }
    schedulerState.wheelScrollTimer = setTimeout(() => {
      schedulerState.wheelScrollTimer = null;
      const isLockedEditMode =
        schedulerState.viewMode === 'editing' &&
        Boolean(schedulerState.confirmedSubmission?.appointment?.preferredDate);
      if (isLockedEditMode) return;
      const settledIdx = Math.max(
        0,
        Math.min(days.length - 1, Math.round(dateGrid.scrollTop / WHEEL_ITEM_HEIGHT))
      );
      const dayObj = days[settledIdx];
      const btn = dateGrid.children[settledIdx];
      if (!dayObj || !btn) return;
      if (!btn.disabled) {
        if (schedulerState.selectedDate !== dayObj.date) {
          schedulerState.selectedDate = dayObj.date;
        }
        syncWheelActiveRowMetadata(settledIdx);
        syncWheelNudgeButtons();
        renderCalendarSlotsAndStatus(dayObj);
        updateSubmitButtonLockState();
      } else {
        schedulerState.selectedWindow = '';
        renderCalendarSlotsAndStatus(dayObj, true);
        updateSubmitButtonLockState();
      }
    }, 115);
  }

  function renderCalendarSlotsAndStatus(activeDateObj, isCenteredUnavailableDay = false) {
    const { lockedBanner, slotGrid, selectedSummary } = schedulerState.refs;
    if (!slotGrid) return;

    const isOvernightMode = isActiveOvernightMode();
    const confirmedInfo = schedulerState.confirmedSubmission
      ? {
          date: schedulerState.confirmedSubmission.appointment?.preferredDate || '',
          window: schedulerState.confirmedSubmission.appointment?.preferredWindow || '',
          startMinutes: schedulerState.confirmedSubmission.confirmedStartMinutes,
          endMinutes: schedulerState.confirmedSubmission.confirmedEndMinutes
        }
      : { date: '', window: '', startMinutes: null, endMinutes: null };
    const confirmedDate = confirmedInfo.date;
    const confirmedWindow = confirmedInfo.window;
    const isLockedEditMode =
      schedulerState.viewMode === 'editing' && Boolean(confirmedDate && confirmedWindow);
    const durInfo = getActiveDurationInfo();
    const busyIntervals = schedulerState.busyIntervals || [];

    const activeDaySlots = getDaySlotsForDay(activeDateObj, isOvernightMode);

    if (!isLockedEditMode && activeDateObj && !isCenteredUnavailableDay) {
      const evaluatedActiveSlots = activeDaySlots.map((s) => ({
        slot: s,
        evalResult: evaluateClientSlot(
          activeDateObj,
          s,
          durInfo.durationMinutes,
          confirmedInfo,
          busyIntervals
        )
      }));
      const currentMatch = evaluatedActiveSlots.find(
        (entry) => entry.slot.slotId === schedulerState.selectedWindow && entry.evalResult.selectable
      );
      if (!currentMatch) {
        const firstEligible = evaluatedActiveSlots.find((entry) => entry.evalResult.selectable);
        schedulerState.selectedWindow = firstEligible ? firstEligible.slot.slotId : '';
      }
    }

    slotGrid.replaceChildren();
    if (activeDateObj) {
      activeDaySlots.forEach((slot) => {
        const evalResult = evaluateClientSlot(
          activeDateObj,
          slot,
          durInfo.durationMinutes,
          confirmedInfo,
          busyIntervals
        );
        const isCustomerOwnSlot =
          activeDateObj.date === confirmedDate && slot.slotId === confirmedWindow;
        const isSelected = isLockedEditMode
          ? isCustomerOwnSlot
          : !isCenteredUnavailableDay &&
            evalResult.selectable &&
            slot.slotId === schedulerState.selectedWindow;
        const isUnavailable = isLockedEditMode
          ? !isCustomerOwnSlot
          : isCenteredUnavailableDay || !evalResult.selectable;

        const btn = createEl(
          'button',
          `calendar-slot-btn${isSelected ? ' active' : ''}${isUnavailable ? ' is-booked' : ''}${isLockedEditMode ? ' is-locked-control' : ''}`
        );
        btn.type = 'button';
        btn.disabled = isLockedEditMode || isUnavailable;
        btn.setAttribute('data-cal-slot', slot.slotId);
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

        const titleRow = createEl('strong', 'cal-slot-title', slot.shortLabel);
        let statusText =
          isOvernightMode && evalResult.reasonText === 'Available'
            ? 'Tentative Night Slot (Call Owner Req.)'
            : evalResult.reasonText;
        if (isLockedEditMode) {
          statusText = isCustomerOwnSlot
            ? 'Locked Appointment Window ✓'
            : 'Locked on Edit (Call to Reschedule)';
        } else if (evalResult.selectable && !isCenteredUnavailableDay) {
          if (isCustomerOwnSlot && isSelected) {
            statusText = 'Your Current Slot ✓';
          } else if (isSelected) {
            statusText = isOvernightMode
              ? 'Selected Tentative Night Slot ✓'
              : 'Selected ✓';
          }
        }
        const statusRow = createEl('span', 'cal-slot-status', statusText);
        btn.append(titleRow, statusRow);

        if (!isLockedEditMode && !isCenteredUnavailableDay && evalResult.selectable) {
          btn.addEventListener('click', () => {
            schedulerState.selectedWindow = slot.slotId;
            renderCalendarSlotsAndStatus(activeDateObj);
            updateSubmitButtonLockState();
          });
        }

        slotGrid.append(btn);
      });
    }

    updateRecapHoursDisplay();

    const chosenSlot = activeDaySlots.find((s) => s.slotId === schedulerState.selectedWindow);
    const chosenSlotText = chosenSlot ? chosenSlot.shortLabel : schedulerState.selectedWindow;
    const chosenDateText = activeDateObj
      ? activeDateObj.dateFormatted
      : formatFullDateUtc(schedulerState.selectedDate);

    if (lockedBanner) {
      if (isLockedEditMode) {
        lockedBanner.classList.remove('is-hidden');
        lockedBanner.textContent = `Time Locked: ${chosenDateText} • ${chosenSlotText} (Ref: ${schedulerState.confirmedSubmission?.referenceCode || 'Active'}). Add items below or call (318) 564-4360 to reschedule.`;
      } else {
        lockedBanner.classList.add('is-hidden');
        lockedBanner.textContent = '';
      }
    }

    if (selectedSummary) {
      selectedSummary.classList.toggle('is-locked', isLockedEditMode);
      selectedSummary.classList.toggle('is-unavailable-day', Boolean(isCenteredUnavailableDay));
      if (isCenteredUnavailableDay && activeDateObj) {
        const reason = activeDateObj.holidayName
          ? `closed (${activeDateObj.holidayName})`
          : 'fully booked';
        selectedSummary.textContent = `${chosenDateText} is ${reason} — scroll or tap an open weekday.`;
      } else if (activeDateObj && schedulerState.selectedWindow) {
        if (isLockedEditMode) {
          selectedSummary.textContent = `Locked Window: ${chosenDateText} • ${chosenSlotText}`;
        } else if (isOvernightMode) {
          selectedSummary.textContent = `Tentative Overnight: ${chosenDateText} • ${chosenSlotText} (Call (318) 564-4360)`;
        } else {
          selectedSummary.textContent = `Selected: ${chosenDateText} • ${chosenSlotText}`;
        }
      } else {
        selectedSummary.textContent = 'Scroll or tap an available day and time window above.';
      }
    }

    syncStickyFooterUI();
  }

  async function loadCalendarSchedule(isManualRefresh) {
    ensureMountedUI();
    const { refreshBtn } = schedulerState.refs;
    if (refreshBtn && isManualRefresh) {
      schedulerState.isRefreshingCalendar = true;
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
    }

    try {
      if (
        window.SmartsProBackend &&
        typeof window.SmartsProBackend.fetchCalendarAvailability === 'function'
      ) {
        const response = await window.SmartsProBackend.fetchCalendarAvailability();
        if (response && response.ok && response.data) {
          schedulerState.availableDates = response.data.availableDates || [];
          schedulerState.calendarMonths = response.data.calendarMonths || [];
          schedulerState.maxAdvanceDate = response.data.maxAdvanceDate || '';
          schedulerState.maxAdvanceDateFormatted = response.data.maxAdvanceDateFormatted || '';
          schedulerState.upcomingBookings = response.data.upcomingBookings || [];
          schedulerState.busyIntervals = response.data.busyIntervals || [];
          schedulerState.liveCalendarSyncConfigured = Boolean(response.data.liveCalendarSyncConfigured);
          renderCalendarUI();
          if (refreshBtn && isManualRefresh) {
            refreshBtn.textContent = 'Updated ✓';
            setTimeout(() => {
              if (schedulerState.refs.refreshBtn) {
                schedulerState.refs.refreshBtn.textContent = 'Refresh Times';
              }
            }, 1800);
          }
          return;
        }
      }
      const fallback = buildClientFallbackAvailability();
      schedulerState.availableDates = fallback.availableDates;
      schedulerState.calendarMonths = fallback.calendarMonths;
      schedulerState.maxAdvanceDate = fallback.maxAdvanceDate;
      schedulerState.maxAdvanceDateFormatted = fallback.maxAdvanceDateFormatted;
      schedulerState.upcomingBookings = fallback.upcomingBookings;
      schedulerState.busyIntervals = [];
      renderCalendarUI();
    } finally {
      schedulerState.isRefreshingCalendar = false;
      if (refreshBtn) {
        refreshBtn.disabled = false;
        if (!isManualRefresh) {
          refreshBtn.textContent = 'Refresh Times';
        }
      }
    }
  }

  function triggerIcsDownload(icsContent, filename) {
    if (!icsContent) return;
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'smartspro-cleaning-appointment.ics';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function showIntakeStatus(type, headingText, detailText, extraData) {
    const { statusBanner, postSubmitActions } = schedulerState.refs;
    if (!statusBanner) return;

    statusBanner.classList.remove('is-hidden', 'status-success', 'status-warning', 'status-error');
    statusBanner.classList.add(
      type === 'success'
        ? 'status-success'
        : type === 'warning'
          ? 'status-warning'
          : 'status-error'
    );
    statusBanner.replaceChildren();

    const strongEl = createEl('strong', 'intake-status-heading', headingText);
    const bodyEl = createEl('p', 'intake-status-copy', detailText);
    statusBanner.append(strongEl, bodyEl);

    if (postSubmitActions) {
      postSubmitActions.replaceChildren();
      postSubmitActions.classList.add('is-hidden');

      if (extraData && (extraData.icsContent || extraData.fallbackMailtoUrl)) {
        postSubmitActions.classList.remove('is-hidden');

        if (extraData.fallbackMailtoUrl) {
          const mailLink = createEl(
            'a',
            'btn btn-primary btn-sm',
            'Open Pre-Filled Email to smartsprosolutions@gmail.com'
          );
          mailLink.href = extraData.fallbackMailtoUrl;
          postSubmitActions.append(mailLink);
        }

        if (extraData.icsContent) {
          const icsBtn = createEl(
            'button',
            'btn btn-outline btn-sm',
            'Download Calendar Appointment (.ics)'
          );
          icsBtn.type = 'button';
          icsBtn.addEventListener('click', () => {
            triggerIcsDownload(extraData.icsContent, extraData.icsFilename);
          });
          postSubmitActions.append(icsBtn);
        }
      }
    }
  }

  async function handleEstimateSubmit() {
    if (schedulerState.isSubmitting) return;
    const refs = schedulerState.refs;
    if (!refs.firstInput || !refs.lastInput || !refs.phoneInput || !refs.emailInput) return;

    // Anti-spam check: if already confirmed and nothing changed in Edit Mode, show Confirmation View
    const currentSnapshotKey = computeCurrentSnapshotKey();
    if (
      schedulerState.confirmedSubmission &&
      schedulerState.confirmedSubmission.snapshotKey === currentSnapshotKey
    ) {
      enterConfirmedView();
      return;
    }

    const firstName = refs.firstInput.value.trim();
    const lastName = refs.lastInput.value.trim();
    const phone = refs.phoneInput.value.trim();
    const email = refs.emailInput.value.trim();
    const notes = refs.notesInput ? refs.notesInput.value.trim() : '';
    const companyWebsite = refs.honeyInput ? refs.honeyInput.value : '';

    if (!schedulerState.selectedDate || !schedulerState.selectedWindow) {
      showIntakeStatus(
        'error',
        'Appointment Window Required',
        'Please select an open cleaning date and arrival time window on the calendar above.'
      );
      return;
    }

    if (!firstName) {
      syncAllContactValidationUI(true);
      showIntakeStatus('error', 'First Name Required', 'Please enter your First Name.');
      refs.firstInput.focus();
      return;
    }
    if (!lastName) {
      syncAllContactValidationUI(true);
      showIntakeStatus('error', 'Last Name Required', 'Please enter your Last Name.');
      refs.lastInput.focus();
      return;
    }
    if (
      containsPhishingOrUrlLinks(firstName) ||
      containsPhishingOrUrlLinks(lastName) ||
      containsPhishingOrUrlLinks(notes)
    ) {
      syncAllContactValidationUI(true);
      showIntakeStatus(
        'error',
        'Links Not Permitted',
        'For security and anti-phishing protection, website links and URLs are not permitted in contact or note fields.'
      );
      return;
    }

    const phoneCheck = validateClientUsPhone(phone);
    if (!phoneCheck.valid) {
      syncAllContactValidationUI(true);
      showIntakeStatus(
        'error',
        'Valid US Phone Number Required',
        'Please enter a real, active 10-digit US Phone Number (e.g., (318) 564-4360).'
      );
      refs.phoneInput.focus();
      return;
    }
    refs.phoneInput.value = phoneCheck.formatted;
    syncSingleContactFieldUI('phone', false);

    if (!email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)) {
      syncAllContactValidationUI(true);
      showIntakeStatus('error', 'Email Address Required', 'Please enter a valid Email Address.');
      refs.emailInput.focus();
      return;
    }

    const emailDomain = email.toLowerCase().split('@')[1] || '';
    if (
      DISPOSABLE_OR_FAKE_EMAIL_DOMAINS.has(emailDomain) ||
      COMMON_TYPO_EMAIL_DOMAINS.has(emailDomain)
    ) {
      syncAllContactValidationUI(true);
      showIntakeStatus(
        'error',
        'Real Email Address Required',
        'Temporary/disposable email domains or misspelled domains (like @gmial.com) cannot be used to reserve appointments.'
      );
      refs.emailInput.focus();
      return;
    }

    const quotePayload = buildCurrentQuotePayload();
    if (
      quotePayload.serviceCategory !== 'commercial' &&
      quotePayload.scopeMode === 'specific' &&
      !quotePayload.specificAreasText
    ) {
      showIntakeStatus(
        'error',
        'Specific Areas Description Required',
        'Please describe which extra areas you want cleaned for the Specific Areas Add-On (or click to remove it).'
      );
      if (refs.editSpecificAreasInput && schedulerState.viewMode === 'editing') {
        refs.editSpecificAreasInput.focus();
      }
      return;
    }

    const payload = {
      customer: {
        firstName,
        lastName,
        phone: phoneCheck.formatted,
        email,
        notes
      },
      appointment: {
        preferredDate: schedulerState.selectedDate,
        preferredWindow: schedulerState.selectedWindow
      },
      quote: quotePayload,
      companyWebsite
    };

    const isUpdate = Boolean(schedulerState.confirmedSubmission);
    if (isUpdate && schedulerState.confirmedSubmission?.updateToken) {
      payload.updateToken = schedulerState.confirmedSubmission.updateToken;
    }

    schedulerState.isSubmitting = true;
    if (refs.submitBtn) {
      refs.submitBtn.disabled = true;
      refs.submitBtn.textContent = isUpdate
        ? 'Sending Updated Estimate & Calendar Request...'
        : 'Sending Estimate & Calendar Request...';
    }

    try {
      const result = await window.SmartsProBackend.submitEstimateRequest(payload);

      const dates = schedulerState.availableDates || [];
      const dateObj = dates.find((d) => d.date === schedulerState.selectedDate);
      const slotPool =
        dateObj && quotePayload.serviceCategory === 'commercial' && quotePayload.frequency === 'overnight'
          ? dateObj.overnightSlots || dateObj.slots
          : dateObj?.slots;
      const slotObj = slotPool?.find((s) => s.slotId === schedulerState.selectedWindow);
      const dateFormatted =
        result?.appointment?.preferredDateFormatted ||
        dateObj?.dateFormatted ||
        formatFullDateUtc(schedulerState.selectedDate);
      const windowLabel =
        result?.appointment?.preferredWindowLabel ||
        slotObj?.label ||
        schedulerState.selectedWindow;

      const currentCalc = window.SmartsProCurrentQuote?.calculation || {};
      const verifiedEstimate = result?.verifiedEstimate || {
        grandTotal: currentCalc.grandTotal || 0,
        basePrice: currentCalc.basePrice || 0,
        frequencySurcharge: currentCalc.frequencySurcharge || 0,
        addonsTotal: currentCalc.addonsTotal || 0,
        estimatedHours: currentCalc.estimatedHours || 2
      };

      const prevTotalSnapshot =
        schedulerState.confirmedSubmission?.verifiedEstimate?.grandTotal ?? null;

      if (result && result.success) {
        const nextUpdateCount = Number.isInteger(result.updateCount)
          ? result.updateCount
          : isUpdate
            ? (schedulerState.confirmedSubmission?.updateCount || 0) + 1
            : 0;
        const confirmedIsUpdated = Boolean(result.isUpdated || isUpdate);
        schedulerState.confirmedSubmission = {
          isUpdated: confirmedIsUpdated,
          updateCount: nextUpdateCount,
          previousTotal: confirmedIsUpdated ? prevTotalSnapshot : null,
          statusType: 'success',
          referenceCode: result.referenceCode || '',
          updateToken: result.updateToken || schedulerState.confirmedSubmission?.updateToken || '',
          confirmedStartMinutes: result?.appointment?.startMinutes,
          confirmedEndMinutes: result?.appointment?.endMinutes,
          headingText: confirmedIsUpdated
            ? `Updated Appointment Sent! (#${Math.max(1, nextUpdateCount)} · Ref: ${result.referenceCode})`
            : `Estimate & Appointment Sent! (Ref: ${result.referenceCode})`,
          detailText: `${result.message} Verified Total: $${Number(verifiedEstimate.grandTotal || 0).toFixed(2)} (50% deposit required in person).`,
          icsContent: result.icsContent || '',
          icsFilename: result.icsFilename || '',
          fallbackMailtoUrl: '',
          customer: payload.customer,
          appointment: payload.appointment,
          appointmentDateFormatted: dateFormatted,
          appointmentWindowLabel: windowLabel,
          appointmentScheduledEndLabel: result?.appointment?.scheduledEndLabel || '',
          quote: quotePayload,
          verifiedEstimate,
          snapshotKey: computeCurrentSnapshotKey()
        };
        await loadCalendarSchedule();
        enterConfirmedView();
      } else if (
        result &&
        (result.code === 'EMAIL_PROVIDER_UNCONFIGURED' || result.code === 'EMAIL_DISPATCH_FAILED')
      ) {
        const priorToken = schedulerState.confirmedSubmission?.updateToken || '';
        const priorRef = schedulerState.confirmedSubmission?.referenceCode || '';
        const priorUpdateCount = schedulerState.confirmedSubmission?.updateCount || 0;
        schedulerState.confirmedSubmission = {
          isUpdated: isUpdate && Boolean(priorToken),
          updateCount: priorUpdateCount,
          previousTotal: isUpdate ? prevTotalSnapshot : null,
          statusType: 'warning',
          referenceCode: result.referenceCode || priorRef,
          updateToken: priorToken,
          headingText: isUpdate
            ? 'Updated Estimate Validated — Complete Email Dispatch Below'
            : 'Estimate Validated — Complete Email Dispatch Below',
          detailText: result.message,
          icsContent: result.icsContent || '',
          icsFilename: result.icsFilename || '',
          fallbackMailtoUrl: result.fallbackMailtoUrl || '',
          customer: payload.customer,
          appointment: payload.appointment,
          appointmentDateFormatted: dateFormatted,
          appointmentWindowLabel: windowLabel,
          appointmentScheduledEndLabel: result?.appointment?.scheduledEndLabel || '',
          quote: quotePayload,
          verifiedEstimate,
          snapshotKey: computeCurrentSnapshotKey()
        };
        enterConfirmedView();
      } else {
        showIntakeStatus(
          'error',
          'Unable to Submit Estimate Request',
          (result && result.message) || 'Please check your information and try again.'
        );
        if (result && result.code === 'SLOT_ALREADY_BOOKED') {
          await loadCalendarSchedule();
        }
      }
    } finally {
      schedulerState.isSubmitting = false;
      updateSubmitButtonLockState();
    }
  }

  function openBookingModal() {
    ensureMountedUI();
    if (modalQuoteRecap && modalRecapToggle) {
      modalQuoteRecap.classList.add('is-mobile-collapsed');
      modalRecapToggle.setAttribute('aria-expanded', 'false');
    }
    refreshModalRecapUI();
    loadCalendarSchedule();
    syncAllContactValidationUI(false);

    // If a request was already confirmed in this session and calculator options match, keep Confirmed View locked
    if (schedulerState.confirmedSubmission) {
      const currentKey = computeCurrentSnapshotKey();
      if (
        currentKey === schedulerState.confirmedSubmission.snapshotKey ||
        isConfirmedBookingWithin24Hours(schedulerState.confirmedSubmission)
      ) {
        enterConfirmedView();
      } else {
        enterEditRequestView();
      }
    }

    if (modalOverlay) {
      modalOverlay.classList.add('open');
      document.body.classList.add('modal-open');
      void modalOverlay.offsetWidth;
      if (modalBody) modalBody.scrollTop = 0;
      requestAnimationFrame(() => recenterActiveWheelDate(false));
      if (btnCloseModal) btnCloseModal.focus();
    }
    syncStickyFooterUI();
  }

  function closeBookingModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  }

  function handleBookingTriggerClick() {
    if (
      window.SmartsProCalculator &&
      typeof window.SmartsProCalculator.validateAllStepsBeforeBooking === 'function' &&
      !window.SmartsProCalculator.validateAllStepsBeforeBooking()
    ) {
      return;
    }
    openBookingModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (btnOpenModal) btnOpenModal.addEventListener('click', handleBookingTriggerClick);
    if (btnContactOpenScheduler) btnContactOpenScheduler.addEventListener('click', handleBookingTriggerClick);
    if (modalRecapToggle && modalQuoteRecap) {
      modalRecapToggle.addEventListener('click', () => {
        const isCollapsed = modalQuoteRecap.classList.toggle('is-mobile-collapsed');
        modalRecapToggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      });
    }
    if (modalStickyCta) {
      modalStickyCta.addEventListener('click', () => {
        if (schedulerState.isSubmitting || modalStickyCta.disabled) return;
        if (schedulerState.viewMode === 'editing') {
          handleEstimateSubmit();
          return;
        }
        if (!schedulerState.selectedDate || !schedulerState.selectedWindow) {
          if (schedulerState.refs.calSection) {
            schedulerState.refs.calSection.scrollIntoView({
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
          if (schedulerState.refs.dateGrid) schedulerState.refs.dateGrid.focus();
          return;
        }
        const firstInvalid = getFirstInvalidContactInput();
        if (firstInvalid) {
          if (schedulerState.refs.intakeSection) {
            schedulerState.refs.intakeSection.scrollIntoView({
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
          firstInvalid.focus();
          return;
        }
        handleEstimateSubmit();
      });
    }
    if (btnEditDetails) {
      btnEditDetails.addEventListener('click', () => {
        if (schedulerState.confirmedSubmission && schedulerState.confirmedSubmission.updateToken) {
          enterEditRequestView();
          return;
        }
        closeBookingModal();
        if (
          window.SmartsProCalculator &&
          typeof window.SmartsProCalculator.goToDetailsStepFromModal === 'function'
        ) {
          window.SmartsProCalculator.goToDetailsStepFromModal();
        }
      });
    }
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeBookingModal);

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeBookingModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeBookingModal();
    });

    window.addEventListener('resize', () => {
      if (modalOverlay && modalOverlay.classList.contains('open')) {
        recenterActiveWheelDate(false);
      }
    });
  });

  window.SmartsProModal = Object.freeze({
    openBookingModal,
    closeBookingModal
  });
})();
