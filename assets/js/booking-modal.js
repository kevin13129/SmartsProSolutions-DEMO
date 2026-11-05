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
  const btnOpenModal = document.getElementById('btn-book-quote-now');
  const btnContactOpenScheduler = document.getElementById('btn-contact-open-scheduler');
  const btnCloseModal = document.getElementById('modal-close-btn');
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
  const recapTotalLabel = document.getElementById('modal-recap-total-label');
  const recapTotal = document.getElementById('modal-recap-total');
  const recapPolicyRow = document.getElementById('modal-recap-policy-row');
  const recapPolicy = document.getElementById('modal-recap-policy');

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
    standard: 'Residential Standard Clean ($40/hr)',
    deep: 'Residential Deep Clean ($50/hr)',
    moveinout: 'Move-In / Move-Out Clean ($50/hr)',
    airbnb: 'Airbnb / STR Turnover ($45/hr)',
    specific: 'Specific Areas (Hourly Booking)',
    commercial: 'Commercial & Offices (Walkthrough & Custom Bid)'
  };

  const freqLabels = {
    weekly: 'Weekly (Every 7 Days) • Flat Rate',
    biweekly: 'Every 2 Weeks • Flat Rate',
    turnover: 'Per Turnover / Custom Schedule • Flat Rate',
    monthly: 'Monthly • Flat Rate',
    onetime: 'One-Time Service • Flat Rate'
  };

  // Interactive Scheduler & Intake State
  const schedulerState = {
    availableDates: [],
    calendarMonths: [],
    activeMonthKey: '',
    maxAdvanceDate: '',
    maxAdvanceDateFormatted: '',
    upcomingBookings: [],
    selectedDate: '',
    selectedWindow: '',
    isSubmitting: false,
    mounted: false,
    refs: {}
  };

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function formatYmdLocal(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function addDaysYmd(isoDate, days) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return formatYmdLocal(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function addOneMonthYmd(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const targetYear = m === 12 ? y + 1 : y;
    const targetMonth = m === 12 ? 1 : m + 1;
    const maxDays = new Date(Date.UTC(targetYear, targetMonth, 0, 12, 0, 0)).getUTCDate();
    return formatYmdLocal(targetYear, targetMonth, Math.min(d, maxDays));
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

  /**
   * Builds a fallback Monday-Friday (8:00 AM - 5:30 PM) schedule client-side
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
            slotId: '11:30-14:30',
            label: 'Midday (11:30 AM – 2:30 PM)',
            shortLabel: '11:30 AM – 2:30 PM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available'
          },
          {
            slotId: '14:30-17:30',
            label: 'Afternoon (2:30 PM – 5:30 PM)',
            shortLabel: '2:30 PM – 5:30 PM',
            status: holidayName ? 'CLOSED_HOLIDAY' : 'AVAILABLE',
            serviceLabel: holidayName ? `Closed (${holidayName})` : 'Available'
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
              status: 'BOOKED'
            });
          }
        });

        const dayEntry = {
          date: iso,
          monthKey,
          dateFormatted: formatted,
          slots,
          openSlotCount: slots.filter((s) => s.status === 'AVAILABLE').length,
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
   * Mounts the Progressive-Enhanced Calendar Picker & Customer Contact Form
   * using safe DOM APIs (zero raw HTML sinks).
   */
  function ensureMountedUI() {
    if (schedulerState.mounted) return;
    schedulerState.mounted = true;

    // 1. Build Simple, Senior-Friendly Calendar Section (Mon-Fri, 8:00 AM - 5:30 PM)
    if (calendarMount) {
      const calSection = createEl('section', 'modal-scheduler-card');
      calSection.setAttribute('aria-label', 'Choose Cleaning Day and Time');

      const headerWrap = createEl('div', 'scheduler-header-wrap');
      const title = createEl('h4', 'scheduler-title', '1. Pick a Preferred Day & Time');
      const subtitle = createEl(
        'p',
        'scheduler-subtitle',
        'Monday – Friday, 8:00 AM to 5:30 PM. You can schedule up to 1 month in advance.'
      );
      headerWrap.append(title, subtitle);

      // Month Switcher Bar (Current Month vs. Next Month)
      const monthNavWrap = createEl('div', 'calendar-month-nav');
      monthNavWrap.id = 'calendar-month-nav';
      const monthTabs = createEl('div', 'calendar-month-tabs');
      monthTabs.id = 'calendar-month-tabs';
      monthTabs.setAttribute('role', 'tablist');
      monthTabs.setAttribute('aria-label', 'Select Calendar Month');
      const advanceLimitNote = createEl(
        'span',
        'calendar-advance-note',
        'Bookings allowed up to 1 month in advance'
      );
      advanceLimitNote.id = 'calendar-advance-note';
      monthNavWrap.append(monthTabs, advanceLimitNote);

      // Date Grid Label & Container
      const dateLabel = createEl('div', 'scheduler-step-label', 'Select a Day (Mon – Fri):');
      const dateGrid = createEl('div', 'calendar-date-grid');
      dateGrid.id = 'calendar-date-grid';
      dateGrid.setAttribute('role', 'group');
      dateGrid.setAttribute('aria-label', 'Available Cleaning Days');

      // Time Window Grid Label & Container
      const slotLabel = createEl('div', 'scheduler-step-label', 'Select an Arrival Time Window:');
      const slotGrid = createEl('div', 'calendar-slot-grid');
      slotGrid.id = 'calendar-slot-grid';
      slotGrid.setAttribute('role', 'group');
      slotGrid.setAttribute('aria-label', 'Available Arrival Time Windows');

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
        'Already booked windows:'
      );
      const upcomingList = createEl('div', 'upcoming-bookings-list');
      upcomingList.id = 'upcoming-bookings-list';
      upcomingBox.append(upcomingTitle, upcomingList);

      calSection.append(
        headerWrap,
        monthNavWrap,
        dateLabel,
        dateGrid,
        slotLabel,
        slotGrid,
        selectedSummary,
        upcomingBox
      );
      calendarMount.append(calSection);

      schedulerState.refs.monthTabs = monthTabs;
      schedulerState.refs.advanceLimitNote = advanceLimitNote;
      schedulerState.refs.upcomingList = upcomingList;
      schedulerState.refs.dateGrid = dateGrid;
      schedulerState.refs.slotGrid = slotGrid;
      schedulerState.refs.selectedSummary = selectedSummary;
    }

    // 2. Build Simple Customer Contact & Additional Notes Section
    if (intakeMount) {
      const intakeSection = createEl('section', 'modal-intake-card');
      intakeSection.setAttribute('aria-label', 'Your Contact Details');

      const headerWrap = createEl('div', 'scheduler-header-wrap');
      const title = createEl('h4', 'scheduler-title', '2. Your Contact Information');
      const subtitle = createEl(
        'p',
        'scheduler-subtitle',
        'We will email your estimate and confirm your appointment. No online payment is required.'
      );
      headerWrap.append(title, subtitle);

      const fieldsGrid = createEl('div', 'intake-fields-grid');

      // First Name
      const firstWrap = createEl('div', 'intake-field-group');
      const firstLabel = createEl('label', 'intake-label', 'First Name *');
      firstLabel.setAttribute('for', 'intake-first-name');
      const firstInput = createEl('input', 'intake-input');
      firstInput.id = 'intake-first-name';
      firstInput.type = 'text';
      firstInput.maxLength = 60;
      firstInput.required = true;
      firstInput.autocomplete = 'given-name';
      firstInput.placeholder = 'First name';
      firstWrap.append(firstLabel, firstInput);

      // Last Name
      const lastWrap = createEl('div', 'intake-field-group');
      const lastLabel = createEl('label', 'intake-label', 'Last Name *');
      lastLabel.setAttribute('for', 'intake-last-name');
      const lastInput = createEl('input', 'intake-input');
      lastInput.id = 'intake-last-name';
      lastInput.type = 'text';
      lastInput.maxLength = 60;
      lastInput.required = true;
      lastInput.autocomplete = 'family-name';
      lastInput.placeholder = 'Last name';
      lastWrap.append(lastLabel, lastInput);

      // Phone Number
      const phoneWrap = createEl('div', 'intake-field-group');
      const phoneLabel = createEl('label', 'intake-label', 'Phone Number *');
      phoneLabel.setAttribute('for', 'intake-phone');
      const phoneInput = createEl('input', 'intake-input');
      phoneInput.id = 'intake-phone';
      phoneInput.type = 'tel';
      phoneInput.maxLength = 32;
      phoneInput.required = true;
      phoneInput.autocomplete = 'tel';
      phoneInput.placeholder = '(318) 555-0199';
      phoneWrap.append(phoneLabel, phoneInput);

      // Email Address
      const emailWrap = createEl('div', 'intake-field-group');
      const emailLabel = createEl('label', 'intake-label', 'Email Address *');
      emailLabel.setAttribute('for', 'intake-email');
      const emailInput = createEl('input', 'intake-input');
      emailInput.id = 'intake-email';
      emailInput.type = 'email';
      emailInput.maxLength = 254;
      emailInput.required = true;
      emailInput.autocomplete = 'email';
      emailInput.placeholder = 'you@example.com';
      emailWrap.append(emailLabel, emailInput);

      fieldsGrid.append(firstWrap, lastWrap, phoneWrap, emailWrap);

      // Additional Notes
      const notesWrap = createEl('div', 'intake-field-group intake-field-full');
      const notesLabel = createEl(
        'label',
        'intake-label',
        'Additional Notes (Optional)'
      );
      notesLabel.setAttribute('for', 'intake-notes');
      const notesInput = createEl('textarea', 'intake-textarea');
      notesInput.id = 'intake-notes';
      notesInput.rows = 3;
      notesInput.maxLength = 1000;
      notesInput.placeholder =
        'Any helpful notes about your home, pets, or preferred rooms...';
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

      // Submit Button
      const submitBtn = createEl(
        'button',
        'btn btn-green btn-lg intake-submit-btn',
        'Send Estimate & Request Appointment'
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
        submitBtn
      );
      intakeMount.append(intakeSection);

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

  function renderCalendarUI() {
    const { monthTabs, advanceLimitNote, upcomingList, dateGrid, slotGrid, selectedSummary } =
      schedulerState.refs;
    if (!dateGrid || !slotGrid) return;

    // 1. Render subtle Upcoming Bookings summary chips
    if (upcomingList) {
      upcomingList.replaceChildren();
      const items = schedulerState.upcomingBookings || [];
      if (items.length === 0) {
        const emptyChip = createEl(
          'span',
          'upcoming-booking-chip',
          'All weekday windows are currently open'
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

    // Ensure valid selectedDate from availableDates (up to 1 month in advance)
    const dates = schedulerState.availableDates || [];
    if (dates.length > 0) {
      const currentFound = dates.find((d) => d.date === schedulerState.selectedDate);
      if (!currentFound) {
        const firstOpenDate = dates.find((d) => d.openSlotCount > 0) || dates[0];
        schedulerState.selectedDate = firstOpenDate.date;
      }
    }

    const months = schedulerState.calendarMonths || [];
    if (months.length > 0) {
      const hasActiveMonth = months.some((m) => m.monthKey === schedulerState.activeMonthKey);
      if (!hasActiveMonth) {
        // Default to Current Month if it has remaining days, otherwise Next Month
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
          `calendar-month-tab${isCurrentTab ? ' active' : ''}`,
          tabLabel
        );
        tabBtn.type = 'button';
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-selected', isCurrentTab ? 'true' : 'false');
        tabBtn.setAttribute('data-cal-month', mObj.monthKey);
        tabBtn.addEventListener('click', () => {
          schedulerState.activeMonthKey = mObj.monthKey;
          // If the new month has a selectable open date and current selectedDate is in another month, keep or select first open in that month
          const firstSelectableInMonth = (mObj.days || []).find(
            (d) => d.withinAdvanceWindow !== false && !d.holidayName && d.openSlotCount > 0
          );
          if (firstSelectableInMonth) {
            schedulerState.selectedDate = firstSelectableInMonth.date;
          }
          renderCalendarUI();
        });
        monthTabs.append(tabBtn);
      });
    }

    if (advanceLimitNote) {
      if (months.length >= 2) {
        advanceLimitNote.textContent = `Open for ${months[0].monthLabel} & ${months[1].monthLabel}`;
      } else {
        advanceLimitNote.textContent = 'Open for current & next month';
      }
    }

    const activeDateObj = dates.find((d) => d.date === schedulerState.selectedDate) || dates[0];
    if (activeDateObj) {
      const currentSlot = activeDateObj.slots.find(
        (s) => s.slotId === schedulerState.selectedWindow && s.status === 'AVAILABLE'
      );
      if (!currentSlot) {
        const firstOpenSlot = activeDateObj.slots.find((s) => s.status === 'AVAILABLE');
        schedulerState.selectedWindow = firstOpenSlot ? firstOpenSlot.slotId : '';
      }
    }

    // 2. Render All Weekday Date Buttons for Active Month (all the way to end of month, e.g., Nov 30)
    dateGrid.replaceChildren();
    const activeMonthObj = months.find((m) => m.monthKey === schedulerState.activeMonthKey);
    const daysToRender =
      activeMonthObj && Array.isArray(activeMonthObj.days) && activeMonthObj.days.length > 0
        ? activeMonthObj.days
        : dates;

    daysToRender.forEach((dayObj) => {
      const isHoliday = Boolean(dayObj.holidayName);
      const isBeyondLimit = dayObj.withinAdvanceWindow === false && !isHoliday;
      const isFull = !isHoliday && !isBeyondLimit && dayObj.openSlotCount === 0;
      const isDisabled = isHoliday || isBeyondLimit || isFull;
      const isSelected = !isDisabled && dayObj.date === schedulerState.selectedDate;

      const btn = createEl(
        'button',
        `calendar-date-btn${isSelected ? ' active' : ''}${isDisabled ? ' is-full' : ''}`
      );
      btn.type = 'button';
      btn.disabled = isDisabled;
      btn.setAttribute('data-cal-date', dayObj.date);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

      const parts = dayObj.dateFormatted.split(',');
      const weekday = (parts[0] || '').trim();
      const monthDay = (parts[1] || dayObj.date).trim();

      let metaLabel = 'Available';
      if (isHoliday) metaLabel = 'Holiday';
      else if (isBeyondLimit) metaLabel = '1-Mo Limit';
      else if (isFull) metaLabel = 'Booked';
      else if (isSelected) metaLabel = 'Selected ✓';

      const dayTop = createEl('span', 'cal-date-weekday', weekday);
      const dayMain = createEl('strong', 'cal-date-main', monthDay);
      const dayMeta = createEl('span', 'cal-date-meta', metaLabel);
      btn.append(dayTop, dayMain, dayMeta);

      if (!isDisabled) {
        btn.addEventListener('click', () => {
          schedulerState.selectedDate = dayObj.date;
          renderCalendarUI();
        });
      }

      dateGrid.append(btn);
    });

    // 3. Render Arrival Window Buttons for Selected Date (Mon-Fri 8:00 AM - 5:30 PM)
    slotGrid.replaceChildren();
    if (activeDateObj) {
      activeDateObj.slots.forEach((slot) => {
        const isBooked = slot.status !== 'AVAILABLE';
        const isSelected = !isBooked && slot.slotId === schedulerState.selectedWindow;
        const btn = createEl(
          'button',
          `calendar-slot-btn${isSelected ? ' active' : ''}${isBooked ? ' is-booked' : ''}`
        );
        btn.type = 'button';
        btn.disabled = isBooked;
        btn.setAttribute('data-cal-slot', slot.slotId);
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

        const titleRow = createEl('strong', 'cal-slot-title', slot.shortLabel);
        const statusRow = createEl(
          'span',
          'cal-slot-status',
          isBooked ? 'Booked' : isSelected ? 'Selected ✓' : 'Available — Tap to Choose'
        );
        btn.append(titleRow, statusRow);

        if (!isBooked) {
          btn.addEventListener('click', () => {
            schedulerState.selectedWindow = slot.slotId;
            renderCalendarUI();
          });
        }

        slotGrid.append(btn);
      });
    }

    // 4. Update Selected Summary Banner
    if (selectedSummary) {
      if (activeDateObj && schedulerState.selectedWindow) {
        const chosenSlot = activeDateObj.slots.find((s) => s.slotId === schedulerState.selectedWindow);
        selectedSummary.textContent = `Selected Time: ${activeDateObj.dateFormatted} • ${chosenSlot ? chosenSlot.shortLabel : schedulerState.selectedWindow}`;
      } else {
        selectedSummary.textContent = 'Please select an available day and time window above.';
      }
    }
  }

  async function loadCalendarSchedule() {
    ensureMountedUI();
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
        renderCalendarUI();
        return;
      }
    }
    const fallback = buildClientFallbackAvailability();
    schedulerState.availableDates = fallback.availableDates;
    schedulerState.calendarMonths = fallback.calendarMonths;
    schedulerState.maxAdvanceDate = fallback.maxAdvanceDate;
    schedulerState.maxAdvanceDateFormatted = fallback.maxAdvanceDateFormatted;
    schedulerState.upcomingBookings = fallback.upcomingBookings;
    renderCalendarUI();
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
      showIntakeStatus('error', 'First Name Required', 'Please enter your First Name.');
      refs.firstInput.focus();
      return;
    }
    if (!lastName) {
      showIntakeStatus('error', 'Last Name Required', 'Please enter your Last Name.');
      refs.lastInput.focus();
      return;
    }
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      showIntakeStatus('error', 'Phone Number Required', 'Please enter a valid 10-digit Phone Number.');
      refs.phoneInput.focus();
      return;
    }
    if (!email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)) {
      showIntakeStatus('error', 'Email Address Required', 'Please enter a valid Email Address.');
      refs.emailInput.focus();
      return;
    }

    const currentQuote = window.SmartsProCurrentQuote || { state: {}, calculation: {} };
    const rawState = currentQuote.state || {};
    const rawAddInfo = rawState.additionalInfo || {};
    const isCommercial = rawState.serviceCategory === 'commercial';

    // Ensure Additional Info has valid values if the user opened the scheduler before completing Step 3
    const normalizedAdditionalInfo = isCommercial
      ? { hasPets: '', lastCleaned: '', occupancy: '', condition: '' }
      : {
          hasPets: rawAddInfo.hasPets || (rawState.addons?.pets > 0 ? 'yes' : 'no'),
          lastCleaned: rawAddInfo.lastCleaned || '1-3 Months ago',
          occupancy: rawAddInfo.occupancy || 'Occupied, we live there',
          condition: rawAddInfo.condition || 'Average, normal use'
        };

    const payload = {
      customer: {
        firstName,
        lastName,
        phone,
        email,
        notes
      },
      appointment: {
        preferredDate: schedulerState.selectedDate,
        preferredWindow: schedulerState.selectedWindow
      },
      quote: {
        serviceCategory: rawState.serviceCategory || 'residential',
        serviceType: rawState.serviceType || 'standard',
        propertyType:
          rawState.serviceCategory === 'moveinout'
            ? rawState.propertyType || 'House'
            : rawState.propertyType || '',
        scopeMode: rawState.scopeMode || 'full',
        specificAreasText:
          rawState.scopeMode === 'specific'
            ? rawState.specificAreasText || 'General priority rooms'
            : rawState.specificAreasText || '',
        specificHours: Number(rawState.specificHours) || 2,
        bedrooms: Number(rawState.bedrooms) || 3,
        fullBaths: Number(rawState.fullBaths) || 2,
        halfBaths: Number(rawState.halfBaths) || 0,
        sqft: Number(rawState.sqft) || 1800,
        additionalInfo: normalizedAdditionalInfo,
        frequency: rawState.frequency || 'biweekly',
        addons: {
          fridge: Number(rawState.addons?.fridge) || 0,
          fridgeDouble: Number(rawState.addons?.fridgeDouble) || 0,
          oven: Number(rawState.addons?.oven) || 0,
          pets: Number(rawState.addons?.pets) || 0
        }
      },
      companyWebsite
    };

    schedulerState.isSubmitting = true;
    if (refs.submitBtn) {
      refs.submitBtn.disabled = true;
      refs.submitBtn.textContent = 'Sending Estimate & Calendar Request...';
    }

    try {
      const result = await window.SmartsProBackend.submitEstimateRequest(payload);

      if (result && result.success) {
        showIntakeStatus(
          'success',
          `Estimate & Appointment Sent! (Ref: ${result.referenceCode})`,
          `${result.message} Estimated Flat-Rate Total: $${Number(result.verifiedEstimate?.grandTotal || 0).toFixed(2)} (No online payment required).`,
          {
            icsContent: result.icsContent,
            icsFilename: result.icsFilename
          }
        );
        await loadCalendarSchedule();
      } else if (
        result &&
        (result.code === 'EMAIL_PROVIDER_UNCONFIGURED' || result.code === 'EMAIL_DISPATCH_FAILED')
      ) {
        showIntakeStatus(
          'warning',
          'Estimate Validated — Complete Email Dispatch Below',
          result.message,
          {
            fallbackMailtoUrl: result.fallbackMailtoUrl,
            icsContent: result.icsContent,
            icsFilename: result.icsFilename
          }
        );
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
      if (refs.submitBtn) {
        refs.submitBtn.disabled = false;
        refs.submitBtn.textContent = 'Send Estimate & Request Appointment';
      }
    }
  }

  function openBookingModal() {
    ensureMountedUI();

    const quote = window.SmartsProCurrentQuote;
    if (quote) {
      const isCommercial = quote.state.serviceCategory === 'commercial';
      const isSpecific = quote.calculation.isSpecificAreas;

      if (modalBookingTitle) {
        modalBookingTitle.textContent = isCommercial
          ? 'Schedule Commercial Walkthrough & Send Bid Request'
          : 'Complete Your Estimate & Request Cleaning Appointment';
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
        if (recapAddinfoRow) recapAddinfoRow.classList.add('is-hidden');
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
          recapAreas.textContent = customText || 'To be confirmed';
        }
        if (recapAddonsRow) recapAddonsRow.classList.remove('is-hidden');
        if (recapTotalLabel) recapTotalLabel.textContent = 'Estimated Quote (Flat Rate):';
      } else {
        if (recapSpecsLabel) recapSpecsLabel.textContent = 'Property Specs:';
        if (recapSpecs) {
          recapSpecs.textContent = `${quote.state.bedrooms} Bed, ${quote.state.fullBaths} Full, ${quote.state.halfBaths} Half / ${quote.state.sqft.toLocaleString()} sq ft`;
        }
        if (recapAreasRow) recapAreasRow.classList.add('is-hidden');
        if (recapAddonsRow) recapAddonsRow.classList.remove('is-hidden');
        if (recapTotalLabel) recapTotalLabel.textContent = 'Estimated Quote (Flat Rate):';
      }

      // Additional Information Row (Step 3 answers for Owner Review)
      if (recapAddinfoRow && recapAddinfo) {
        const info = quote.state.additionalInfo || {};
        if (!isCommercial && (info.hasPets || info.lastCleaned || info.occupancy || info.condition)) {
          const infoParts = [];
          if (info.hasPets) infoParts.push(info.hasPets === 'yes' ? 'Pets: Yes' : 'Pets: No');
          if (info.lastCleaned) infoParts.push(`Last Cleaned: ${info.lastCleaned}`);
          if (info.occupancy) infoParts.push(`Occupancy: ${info.occupancy}`);
          if (info.condition) infoParts.push(`Condition: ${info.condition}`);
          recapAddinfoRow.classList.remove('is-hidden');
          recapAddinfo.textContent = infoParts.join(' • ');
        } else {
          recapAddinfoRow.classList.add('is-hidden');
        }
      }

      if (recapFreq) recapFreq.textContent = freqLabels[quote.state.frequency] || 'One-Time Service • Flat Rate';

      const addonParts = [];
      if (quote.state.addons.fridge > 0) addonParts.push(`${quote.state.addons.fridge}x Single Fridge ($65)`);
      if (quote.state.addons.fridgeDouble > 0) addonParts.push(`${quote.state.addons.fridgeDouble}x Double Fridge ($75)`);
      if (quote.state.addons.oven > 0) addonParts.push(`${quote.state.addons.oven}x Inside Oven ($80)`);
      if (quote.state.addons.pets > 0) addonParts.push('Pet Hair & Detailing ($35 flat fee)');
      if (recapAddons) {
        if (quote.state.additionalInfo && quote.state.additionalInfo.hasPets === 'no' && addonParts.length === 0) {
          recapAddons.textContent = 'None selected (No pets)';
        } else {
          recapAddons.textContent = addonParts.length > 0 ? addonParts.join(', ') : 'None selected';
        }
      }

      if (recapTotal) recapTotal.textContent = `$${quote.calculation.grandTotal.toFixed(2)}`;

      if (recapPolicyRow && recapPolicy) {
        recapPolicy.textContent = isCommercial
          ? 'Custom Facility Proposal • No Online Payment Required • Emailed to Owner'
          : 'Flat Rate (No Recurring Discounts) • No Online Payment Required • Emailed to Owner';
      }

      // Populate Automated Email & Calendar Workflow Summary
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
    }

    loadCalendarSchedule();

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
    if (btnContactOpenScheduler) btnContactOpenScheduler.addEventListener('click', openBookingModal);
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
