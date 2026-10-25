/** Display-only scope model. No storage, submissions, or authoritative prices. */
(function () {
  'use strict';
  const services = { residential: 'Residential', commercial: 'Commercial', airbnb: 'Airbnb / short-term rental' };
  const levels = { standard: 'Standard clean', deep: 'Deep clean', moveinout: 'Move-in / move-out' };
  const frequencies = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', onetime: 'One time', turnover: 'Per turnover' };
  const frequencyOptions = {
    residential: ['weekly', 'biweekly', 'monthly', 'onetime'],
    commercial: ['weekly', 'biweekly', 'monthly', 'onetime'],
    airbnb: ['turnover', 'onetime']
  };
  const choices = {
    condition: { routine: 'Routine upkeep', buildup: 'Visible buildup — assessment needed', heavy: 'Heavy cleaning — assessment needed' },
    pets: { none: 'No pets', present: 'Pets present' },
    laundry: { none: 'No laundry needed', onsite: 'Wash and dry on site', offsite: 'Off-site laundry requested', supplied: 'Clean linens supplied' },
    restocking: { none: 'No restocking', supplied: 'Use owner-supplied stock', purchase: 'Purchasing requested — agree allowance' },
    buildingUse: { office: 'Office', retail: 'Retail', shared: 'Shared building areas', other: 'Other — discuss at walkthrough' },
    walkthrough: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', discuss: 'Discuss a time' },
    floors: { carpet: 'Carpet', tile: 'Tile', wood: 'Wood', vinyl: 'Vinyl', concrete: 'Concrete', other: 'Other' }
  };
  // User-supplied hourly rates; time allowances remain planning assumptions.
  // One crew rate is used, not multiplied by crew headcount.
  const rates = {
    minimum: 110,
    hourly: { standard: 40, deep: 50, moveinout: 50 },
    hours: { base: 1.5, bedroom: 0.25, fullBath: 0.5, halfBath: 0.25, sqftThreshold: 1000, perExtra500Sqft: 0.5 },
    durationFactors: { standard: 1, deep: 1.5, moveinout: 1.75 },
    discounts: { weekly: 0.20, biweekly: 0.15, monthly: 0.10, onetime: 0 }
  };
  const addons = {
    residential: [
      { id: 'fridgeSingle', label: 'Single refrigerator', rate: 65, max: 5 },
      { id: 'fridgeDouble', label: 'Double / French door fridge', rate: 75, max: 5 },
      { id: 'oven', label: 'Inside oven', rate: 80, max: 5 },
      { id: 'petDetail', label: 'Pet hair detailing', rate: 35, max: 1 }
    ],
    airbnb: [
      { id: 'fridgeInterior', label: 'Refrigerator interior', rate: null, max: 5 },
      { id: 'ovenInterior', label: 'Oven interior', rate: null, max: 5 },
      { id: 'dishes', label: 'Extra dishwashing', rate: null, max: 1 }
    ],
    commercial: [
      { id: 'interiorGlass', label: 'Interior glass detail', rate: null, max: 1 },
      { id: 'breakroomDetail', label: 'Breakroom detail', rate: null, max: 1 },
      { id: 'floorDetail', label: 'Additional floor care', rate: null, max: 1 }
    ]
  };
  const money = value => `$${value.toFixed(2)}`;
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  function initialState() {
    return {
      serviceType: '', frequency: '', sqft: 1800, bedrooms: 3, fullBaths: 2, halfBaths: 1,
      cleaningLevel: '', condition: '', pets: '', beds: 0, laundry: '', restocking: '',
      checkout: '', checkin: '', buildingUse: '', restrooms: 1, floors: [], walkthrough: '', addons: {}
    };
  }
  function calculate(state) {
    const items = (addons[state.serviceType] || []).filter(item => state.addons[item.id] > 0)
      .map(item => ({ ...item, quantity: state.addons[item.id], total: item.rate === null ? null : round(item.rate * state.addons[item.id]) }));
    const missing = [];
    const missingFields = [];
    const requireAnswer = (field, label) => { missingFields.push(field); missing.push(label); };
    if (!services[state.serviceType]) requireAnswer('serviceType', 'service type');
    if (!frequencyOptions[state.serviceType]?.includes(state.frequency)) requireAnswer('frequency', 'frequency');
    if (state.serviceType === 'residential') {
      if (!levels[state.cleaningLevel]) requireAnswer('cleaningLevel', 'cleaning level');
      if (!choices.condition[state.condition]) requireAnswer('condition', 'condition');
      if (!choices.pets[state.pets]) requireAnswer('pets', 'pets (Yes or No)');
    }
    if (state.serviceType === 'airbnb') {
      for (const key of ['laundry', 'restocking']) if (!choices[key][state[key]]) requireAnswer(key, key);
      if (!state.checkout) requireAnswer('checkout', 'checkout time');
      if (!state.checkin) requireAnswer('checkin', 'check-in time');
    }
    if (state.serviceType === 'commercial') {
      if (!choices.buildingUse[state.buildingUse]) requireAnswer('buildingUse', 'building use');
      if (!state.floors.length) requireAnswer('floors', 'floor types');
      if (!choices.walkthrough[state.walkthrough]) requireAnswer('walkthrough', 'walkthrough preference');
    }
    const result = { items, missing, missingFields, estimatedHours: null, hourlyRate: null, grandTotal: null, serviceSubtotal: null, discountAmount: 0, minimumAdjustment: 0, addonsTotal: null };
    if (missing.length || state.serviceType !== 'residential' || state.condition !== 'routine') return result;
    const time = rates.hours;
    const standardHours = time.base + state.bedrooms * time.bedroom + state.fullBaths * time.fullBath + state.halfBaths * time.halfBath + Math.max(0, state.sqft - time.sqftThreshold) / 500 * time.perExtra500Sqft;
    // Round estimated work up to a quarter hour. Extras have their own prices
    // and are not also added to this base-cleaning duration.
    result.estimatedHours = Math.ceil(standardHours * rates.durationFactors[state.cleaningLevel] * 4) / 4;
    result.hourlyRate = rates.hourly[state.cleaningLevel];
    result.serviceSubtotal = round(result.estimatedHours * result.hourlyRate);
    // Round line items before summing so every surface shows an identical total.
    result.discountAmount = round(result.serviceSubtotal * rates.discounts[state.frequency]);
    result.minimumAdjustment = round(Math.max(0, rates.minimum - result.serviceSubtotal + result.discountAmount));
    result.addonsTotal = round(items.reduce((sum, item) => sum + item.total, 0));
    result.grandTotal = round(result.serviceSubtotal - result.discountAmount + result.minimumAdjustment + result.addonsTotal);
    return result;
  }
  function describe(state, calculation = calculate(state)) {
    const service = services[state.serviceType] || 'Choose a service';
    const frequency = frequencies[state.frequency] || 'Not selected';
    const property = state.serviceType === 'commercial'
      ? `${state.sqft.toLocaleString()} sq ft / ${state.restrooms} restrooms`
      : `${state.sqft.toLocaleString()} sq ft / ${state.bedrooms} bedrooms / ${state.fullBaths} full baths / ${state.halfBaths} half baths`;
    const rows = [['Service', service], ['Property', property], ['Frequency', frequency]];
    const selected = key => choices[key][state[key]] || 'Not selected';
    if (state.serviceType === 'residential') rows.push(['Cleaning level', levels[state.cleaningLevel] || 'Not selected'], ['Condition', selected('condition')], ['Pets', selected('pets')]);
    if (state.serviceType === 'airbnb') rows.push(['Beds to remake', String(state.beds)], ['Laundry', selected('laundry')], ['Restocking', selected('restocking')], ['Checkout', state.checkout || 'Not selected'], ['Check-in', state.checkin || 'Not selected']);
    if (state.serviceType === 'commercial') rows.push(['Building use', selected('buildingUse')], ['Floor types', state.floors.map(value => choices.floors[value]).join(', ') || 'Not selected'], ['Preferred walkthrough', selected('walkthrough')]);
    const addonLines = calculation.items.map(item => `${item.quantity} × ${item.label} — ${item.total === null ? 'Price after assessment' : `${money(item.rate)} each / ${money(item.total)}`}`);
    let price = 'Complete highlighted choices';
    let explanation = calculation.missing.length ? `Answer the red-highlighted items: ${calculation.missing.join(', ')}.` : '';
    if (state.serviceType === 'commercial') {
      price = 'Walkthrough first';
      explanation += ' After a walkthrough, the owners propose a per-visit rate or monthly agreement.';
    } else if (state.serviceType === 'airbnb') {
      price = 'Assessment first';
      explanation += ' A property-specific flat turnover rate follows assessment and timing of the work. Times are preferences, not reserved slots.';
    } else if (state.serviceType === 'residential' && state.condition && state.condition !== 'routine') {
      price = 'Assessment needed';
      explanation += ' The owners need to review the condition before estimating a price.';
    } else if (calculation.grandTotal !== null) {
      price = money(calculation.grandTotal);
      explanation = 'Estimated cleaning time with recurring adjustments and extras shown below. Final scope, price, and availability must be confirmed before booking.';
    }
    if (calculation.grandTotal !== null) {
      rows.push(['Estimated cleaning time', `${calculation.estimatedHours.toFixed(2)} hours`], ['Cleaning subtotal', money(calculation.serviceSubtotal)]);
      if (calculation.discountAmount) rows.push(['Recurring adjustment', `−${money(calculation.discountAmount)}`]);
      if (calculation.minimumAdjustment) rows.push(['Minimum adjustment', `+${money(calculation.minimumAdjustment)}`]);
    }
    const text = ['Smarts Pro Solutions — scope & estimate', ...rows.map(([key, value]) => `${key}: ${value}`), 'Extras:', ...(addonLines.length ? addonLines : ['None selected']), `Estimate: ${price}`, explanation.trim(), 'Nothing has been submitted. This is not a confirmed appointment. Call (318) 564-4360 to discuss.'].join('\n');
    return { rows, addonLines, service, frequency, property, price, explanation: explanation.trim(), text };
  }
  // Future intake adapter input: active service fields only, no contact data,
  // client totals, payment state, or booking authority. Never persisted here.
  function selection(state) {
    const property = { sqft: state.sqft };
    if (state.serviceType !== 'commercial') Object.assign(property, { bedrooms: state.bedrooms, fullBaths: state.fullBaths, halfBaths: state.halfBaths });
    const requirements = {};
    const keys = state.serviceType === 'residential' ? ['cleaningLevel', 'condition', 'pets'] : state.serviceType === 'airbnb' ? ['beds', 'laundry', 'restocking', 'checkout', 'checkin'] : state.serviceType === 'commercial' ? ['buildingUse', 'restrooms', 'floors', 'walkthrough'] : [];
    for (const key of keys) requirements[key] = Array.isArray(state[key]) ? [...state[key]] : state[key];
    return { schemaVersion: 1, serviceType: state.serviceType, frequency: state.frequency, property, requirements, addons: calculate(state).items.map(({ id, quantity }) => ({ id, quantity })) };
  }
  function freeze(value) {
    Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); });
    return Object.freeze(value);
  }
  window.SmartsProEstimate = freeze({ services, levels, frequencies, frequencyOptions, choices, rates, addons, money, initialState, calculate, describe, selection });
})();
