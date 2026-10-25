/** In-memory estimate controls. Customer intake remains unavailable. */
(function () {
  'use strict';
  const model = window.SmartsProEstimate;
  const state = model.initialState();
  const get = id => document.getElementById(id);
  const set = (id, value) => {
    const el = get(id);
    if (el) el.textContent = value;
  };
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function renderAddons() {
    const container = get('addon-options');
    container.replaceChildren();
    set('addon-prompt', state.serviceType ? 'Choose extras for this service. The owners will confirm the scope.' : 'Choose a service in step 2 to see its extras.');
    for (const item of model.addons[state.serviceType] || []) {
      const card = node('div', undefined, 'addon-card-item');
      const label = node('div', undefined, 'addon-text-wrap');
      label.append(node('h4', item.label), node('span', item.rate === null ? 'Price after assessment' : `${model.money(item.rate)} each · provisional`, 'addon-rate-badge'));
      const controls = node('div', undefined, 'stepper-control stepper-auto');
      const count = node('span', '0', 'stepper-value');
      count.id = `val-addon-${item.id}`;
      for (const direction of [-1, 1]) {
        const button = node('button', direction === -1 ? '−' : '+', 'stepper-btn');
        button.type = 'button';
        button.id = `btn-${item.id}-${direction === -1 ? 'minus' : 'plus'}`;
        button.setAttribute('aria-label', `${direction === -1 ? 'Decrease' : 'Increase'} ${item.label}`);
        button.addEventListener('click', () => {
          state.addons[item.id] = Math.max(0, Math.min(item.max, (state.addons[item.id] || 0) + direction));
          update();
        });
        controls.append(button);
        if (direction === -1) controls.append(count);
      }
      card.append(label, controls);
      container.append(card);
    }
  }
  function syncRadioGroup(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
      input.checked = input.value === value;
    });
  }
  function scrollToNextNeeded() {
    const firstMissing = document.querySelector('#calculator .needs-answer');
    const target = firstMissing || get('calc-step-2') || get('calculator');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function update() {
    const calculation = model.calculate(state);
    const summary = model.describe(state, calculation);
    const selection = model.selection(state);
    window.SmartsProCurrentQuote = { state: structuredClone(state), calculation, summary, selection };
    for (const card of document.querySelectorAll('.service-card-option, .freq-card-option')) {
      const input = card.querySelector('input');
      const isService = input.name === 'service_type';
      input.checked = input.value === (isService ? state.serviceType : state.frequency);
      card.classList.toggle('active', input.checked);
      if (!isService) {
        const available = model.frequencyOptions[state.serviceType]?.includes(input.value) || false;
        card.hidden = !available;
        input.disabled = !available;
      }
    }
    syncRadioGroup('cleaningLevel', state.cleaningLevel);
    syncRadioGroup('condition', state.condition);
    syncRadioGroup('pets', state.pets);
    for (const family of ['residential', 'commercial', 'airbnb']) get(`${family}-requirements`).hidden = state.serviceType !== family;
    set('frequency-prompt', state.serviceType ? 'Select a cleaning frequency.' : 'Choose a service in step 2 first.');
    get('frequency-prompt').hidden = Boolean(state.frequency);
    document.querySelectorAll('[data-required]').forEach(group => {
      const field = group.dataset.required;
      const unanswered = !group.closest('[hidden]') && calculation.missingFields.includes(field) && (field !== 'frequency' || Boolean(state.serviceType));
      group.classList.toggle('needs-answer', unanswered);
      group.setAttribute('aria-invalid', String(unanswered));
      const prompt = get(`${field}-prompt`);
      if (prompt && field !== 'frequency') prompt.hidden = !unanswered;
      group.querySelectorAll('input').forEach(input => input.setAttribute('aria-invalid', String(unanswered)));
    });
    const usesRooms = ['residential', 'airbnb'].includes(state.serviceType);
    get('home-room-controls').hidden = !usesRooms;
    const roomPill = get('step2-room-pill');
    if (roomPill) {
      roomPill.hidden = !usesRooms;
      set('step2-room-summary', `${state.sqft.toLocaleString()} sq ft · ${state.bedrooms} bed${state.bedrooms === 1 ? '' : 's'} · ${state.fullBaths} full bath${state.fullBaths === 1 ? '' : 's'} · ${state.halfBaths} half bath${state.halfBaths === 1 ? '' : 's'}`);
    }
    for (const [key, suffix, min, max] of [['bedrooms', 'bed', 0, 10], ['fullBaths', 'fullbath', 1, 8], ['halfBaths', 'halfbath', 0, 6]]) {
      set(`val-${key.toLowerCase()}`, state[key]);
      get(`btn-${suffix}-minus`).disabled = state[key] <= min;
      get(`btn-${suffix}-plus`).disabled = state[key] >= max;
    }
    get('slider-sqft').value = state.sqft;
    get('input-sqft').value = state.sqft;
    document.querySelectorAll('.space-preset-btn').forEach(btn => {
      const match = Number(btn.dataset.presetSqft) === state.sqft &&
        Number(btn.dataset.presetBeds) === state.bedrooms &&
        Number(btn.dataset.presetFull) === state.fullBaths &&
        Number(btn.dataset.presetHalf) === state.halfBaths;
      btn.classList.toggle('active', match);
    });
    for (const item of model.addons[state.serviceType] || []) {
      const quantity = state.addons[item.id] || 0;
      set(`val-addon-${item.id}`, quantity);
      get(`btn-${item.id}-minus`).disabled = quantity === 0;
      get(`btn-${item.id}-plus`).disabled = quantity >= item.max;
      get(`val-addon-${item.id}`).closest('.addon-card-item').classList.toggle('has-quantity', quantity > 0);
    }
    set('quote-total-amount', summary.price);
    get('quote-total-amount').classList.toggle('quote-text-status', calculation.grandTotal === null);
    set('quote-billing-freq', summary.frequency);
    set('quote-explanation', summary.explanation);
    const rows = get('summary-rows');
    rows.replaceChildren();
    for (const [label, value] of summary.rows) {
      const row = node('div', undefined, 'breakdown-row');
      row.append(node('span', label, 'breakdown-label'), node('span', value, 'breakdown-value'));
      rows.append(row);
    }
    const list = get('summary-addon-list');
    list.replaceChildren(...summary.addonLines.map(line => node('li', line)));
    const dropdown = get('summary-addons');
    dropdown.hidden = !summary.addonLines.length;
    dropdown.classList.toggle('single-addon', summary.addonLines.length === 1);
    // One extra is always visible; two or more start collapsed.
    if (dropdown.dataset.count !== String(summary.addonLines.length)) dropdown.open = summary.addonLines.length === 1;
    dropdown.dataset.count = String(summary.addonLines.length);
    set('summary-addons-heading', `${summary.addonLines.length} selected extra${summary.addonLines.length === 1 ? '' : 's'}${calculation.addonsTotal === null ? '' : ` · ${model.money(calculation.addonsTotal)}`}`);
    set('estimate-print-summary', summary.text);

    // Update Funnel Progress Bar & Mobile Dock
    const step2Missing = calculation.missingFields.some(field => field !== 'frequency');
    get('funnel-pill-1')?.classList.toggle('done', true);
    get('funnel-pill-2')?.classList.toggle('done', Boolean(state.serviceType) && !step2Missing);
    get('funnel-pill-2')?.classList.toggle('needs-step', step2Missing);
    get('funnel-pill-3')?.classList.toggle('done', Boolean(state.frequency));
    get('funnel-pill-3')?.classList.toggle('needs-step', Boolean(state.serviceType) && !state.frequency);
    get('funnel-pill-4')?.classList.toggle('done', calculation.missing.length === 0);

    const nextChip = get('calc-next-action');
    if (nextChip) {
      const ready = calculation.missing.length === 0;
      nextChip.classList.toggle('ready', ready);
      nextChip.textContent = ready
        ? `✓ Scope complete (${summary.price}) — Review Estimate`
        : `Next: Select ${calculation.missing[0]} ↓`;
    }
    const dockBtn = get('mobile-dock-btn');
    if (dockBtn) {
      const ready = calculation.missing.length === 0;
      set('mobile-dock-status', ready ? `${summary.service} · ${summary.frequency}` : `${calculation.missing.length} choice${calculation.missing.length === 1 ? '' : 's'} needed`);
      set('mobile-dock-price', ready ? summary.price : `Next: ${calculation.missing[0]}`);
      dockBtn.textContent = ready ? 'Review Estimate' : 'Next Step ↓';
    }
    const table = document.querySelector('.clean-comparison-table');
    if (table) {
      table.dataset.activeLevel = state.serviceType === 'residential' ? state.cleaningLevel : '';
    }
  }
  function quickSelectService(serviceType, cleaningLevel) {
    if (!Object.hasOwn(model.services, serviceType)) return;
    if (state.serviceType !== serviceType) {
      state.serviceType = serviceType;
      state.frequency = '';
      state.addons = {};
      renderAddons();
    }
    if (serviceType === 'residential' && cleaningLevel && Object.hasOwn(model.levels, cleaningLevel)) {
      state.cleaningLevel = cleaningLevel;
    }
    update();
    requestAnimationFrame(() => scrollToNextNeeded());
  }
  window.SmartsProQuickSelect = quickSelectService;
  document.addEventListener('DOMContentLoaded', () => {
    for (const [key, suffix, min, max] of [['bedrooms', 'bed', 0, 10], ['fullBaths', 'fullbath', 1, 8], ['halfBaths', 'halfbath', 0, 6]]) {
      for (const direction of [-1, 1]) get(`btn-${suffix}-${direction === -1 ? 'minus' : 'plus'}`).addEventListener('click', () => {
        state[key] = Math.max(min, Math.min(max, state[key] + direction)); update();
      });
    }
    for (const id of ['input-sqft', 'slider-sqft']) get(id).addEventListener(id === 'input-sqft' ? 'change' : 'input', event => {
      const value = Number(event.target.value);
      state.sqft = Number.isFinite(value) ? Math.max(400, Math.min(6000, Math.round(value))) : 400;
      update();
    });
    document.querySelectorAll('.space-preset-btn').forEach(btn => btn.addEventListener('click', () => {
      state.sqft = Number(btn.dataset.presetSqft) || 1800;
      state.bedrooms = Number(btn.dataset.presetBeds) || 0;
      state.fullBaths = Number(btn.dataset.presetFull) || 1;
      state.halfBaths = Number(btn.dataset.presetHalf) || 0;
      update();
    }));
    get('btn-edit-rooms')?.addEventListener('click', () => {
      get('calc-step-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.querySelectorAll('.funnel-step-pill').forEach(pill => pill.addEventListener('click', () => {
      get(pill.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    get('calc-next-action')?.addEventListener('click', () => {
      if (window.SmartsProCurrentQuote?.calculation.missing.length === 0) {
        window.SmartsProModal.openBookingModal();
      } else {
        scrollToNextNeeded();
      }
    });
    get('mobile-dock-btn')?.addEventListener('click', () => {
      if (window.SmartsProCurrentQuote?.calculation.missing.length === 0) {
        window.SmartsProModal.openBookingModal();
      } else {
        scrollToNextNeeded();
      }
    });
    document.querySelectorAll('[data-quick-service]').forEach(trigger => trigger.addEventListener('click', event => {
      event.preventDefault();
      quickSelectService(trigger.dataset.quickService, trigger.dataset.quickLevel || '');
    }));
    document.querySelectorAll('input[name="service_type"]').forEach(input => input.addEventListener('change', () => {
      if (!Object.hasOwn(model.services, input.value)) return;
      state.serviceType = input.value;
      state.frequency = '';
      state.addons = {};
      renderAddons(); update();
    }));
    document.querySelectorAll('input[name="frequency_choice"]').forEach(input => input.addEventListener('change', () => {
      if (model.frequencyOptions[state.serviceType]?.includes(input.value)) state.frequency = input.value;
      update();
    }));
    document.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', () => {
      const key = input.dataset.field;
      if (input.type === 'radio' && !input.checked) return;
      if (input.type === 'number') {
        const value = Number(input.value);
        state[key] = Number.isFinite(value) ? Math.max(Number(input.min), Math.min(Number(input.max), Math.round(value))) : Number(input.min);
        input.value = state[key];
      } else state[key] = input.value;
      update();
    }));
    document.querySelectorAll('input[name="floor_type"]').forEach(input => input.addEventListener('change', () => {
      state.floors = [...document.querySelectorAll('input[name="floor_type"]:checked')].map(field => field.value);
      update();
    }));
    get('summary-addons').querySelector('summary').addEventListener('click', event => {
      if (get('summary-addons').classList.contains('single-addon')) event.preventDefault();
    });
    get('btn-print-quote').addEventListener('click', () => window.print());
    get('btn-share-quote').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.SmartsProCurrentQuote.summary.text);
        set('copy-status', 'Scope and estimate copied. Nothing has been submitted.');
      } catch {
        set('copy-status', 'Copy is unavailable here. Use Print Estimate to keep your summary.');
      }
    });
    get('btn-book-quote-now').addEventListener('click', () => window.SmartsProModal.openBookingModal());
    renderAddons(); update();
  });
})();
