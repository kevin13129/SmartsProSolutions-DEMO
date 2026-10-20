/**
 * SMARTS PRO SOLUTIONS - PRICE CALCULATOR ENGINE
 * Live interactive estimate calculator with property details, service tiers,
 * recurring frequency discounts, and itemized add-ons.
 */

(function () {
  'use strict';

  // Calculator State
  const state = {
    bedrooms: 3,
    fullBaths: 2,
    halfBaths: 1,
    sqft: 1800,
    serviceType: 'standard', // 'standard' | 'deep' | 'moveinout' | 'airbnb'
    frequency: 'biweekly',   // 'weekly' | 'biweekly' | 'turnover' | 'monthly' | 'onetime'
    addons: {
      linens: 0,
      fridgeSingle: 0,
      fridgeDouble: 0,
      oven: 0,
      pets: 0
    }
  };

  // Pricing Parameters & Rates ($40/hr standard, $50/hr deep clean baseline)
  const PRICING = {
    minimumFloor: 110,
    baseFlat: 60,
    perBedroom: 20,
    perFullBath: 30,
    perHalfBath: 15,
    sqftBaseThreshold: 1000,
    sqftPerFootOver: 0.04,
    
    serviceMultipliers: {
      standard: 1.0,
      deep: 1.45,
      moveinout: 1.65,
      airbnb: 1.15
    },

    frequencyDiscounts: {
      weekly: 0.20,     // 20% OFF
      biweekly: 0.15,   // 15% OFF
      turnover: 0.15,   // 15% OFF (Airbnb host partner)
      monthly: 0.10,    // 10% OFF
      onetime: 0.00     // No discount
    },

    addonRates: {
      linens: 5,           // $5 each
      fridgeSingle: 65,    // $65 each
      fridgeDouble: 75,    // $75 each
      oven: 80,            // $80 each (subject to condition)
      pets: 35             // $35 pet hair/detailing fee
    }
  };

  // DOM Elements Cache
  const els = {
    // Steppers
    bedVal: document.getElementById('val-bedrooms'),
    bedMinus: document.getElementById('btn-bed-minus'),
    bedPlus: document.getElementById('btn-bed-plus'),

    fullBathVal: document.getElementById('val-fullbaths'),
    fullBathMinus: document.getElementById('btn-fullbath-minus'),
    fullBathPlus: document.getElementById('btn-fullbath-plus'),

    halfBathVal: document.getElementById('val-halfbaths'),
    halfBathMinus: document.getElementById('btn-halfbath-minus'),
    halfBathPlus: document.getElementById('btn-halfbath-plus'),

    // Sqft
    sqftSlider: document.getElementById('slider-sqft'),
    sqftInput: document.getElementById('input-sqft'),

    // Service types & Frequency
    serviceCards: document.querySelectorAll('.service-card-option'),
    freqCards: document.querySelectorAll('.freq-card-option'),

    // Addons
    addonLinensVal: document.getElementById('val-addon-linens'),
    addonLinensMinus: document.getElementById('btn-linens-minus'),
    addonLinensPlus: document.getElementById('btn-linens-plus'),

    addonFridgeVal: document.getElementById('val-addon-fridge'),
    addonFridgeMinus: document.getElementById('btn-fridge-minus'),
    addonFridgePlus: document.getElementById('btn-fridge-plus'),

    addonFridgeDoubleVal: document.getElementById('val-addon-fridge-double'),
    addonFridgeDoubleMinus: document.getElementById('btn-fridge-double-minus'),
    addonFridgeDoublePlus: document.getElementById('btn-fridge-double-plus'),

    addonOvenVal: document.getElementById('val-addon-oven'),
    addonOvenMinus: document.getElementById('btn-oven-minus'),
    addonOvenPlus: document.getElementById('btn-oven-plus'),

    addonPetsVal: document.getElementById('val-addon-pets'),
    addonPetsMinus: document.getElementById('btn-pets-minus'),
    addonPetsPlus: document.getElementById('btn-pets-plus'),

    // Summary outputs
    quoteTotal: document.getElementById('quote-total-amount'),
    quoteBillingFreq: document.getElementById('quote-billing-freq'),
    quoteSavingsAlert: document.getElementById('quote-savings-alert'),
    quoteSavingsAmount: document.getElementById('quote-savings-amount'),
    
    breakdownBaseRate: document.getElementById('summary-base-rate'),
    breakdownServiceType: document.getElementById('summary-service-type'),
    breakdownServiceRate: document.getElementById('summary-service-rate'),
    breakdownDiscountRow: document.getElementById('summary-discount-row'),
    breakdownDiscountVal: document.getElementById('summary-discount-val'),
    breakdownDiscountLabel: document.getElementById('summary-discount-label'),
    breakdownAddonsRow: document.getElementById('summary-addons-row'),
    breakdownAddonsVal: document.getElementById('summary-addons-val'),
    
    summaryEstTime: document.getElementById('summary-est-time'),
    summaryCrew: document.getElementById('summary-crew-size'),

    btnBookNow: document.getElementById('btn-book-quote-now'),
    btnPrintQuote: document.getElementById('btn-print-quote'),
    btnShareQuote: document.getElementById('btn-share-quote')
  };

  /**
   * Calculate a display-only estimate. This is never a trusted price for billing.
   */
  function calculateQuote() {
    // 1. Base rooms calculation
    const roomCost = PRICING.baseFlat +
      (state.bedrooms * PRICING.perBedroom) +
      (state.fullBaths * PRICING.perFullBath) +
      (state.halfBaths * PRICING.perHalfBath);

    // 2. Square footage adjustment
    const sqftExcess = Math.max(0, state.sqft - PRICING.sqftBaseThreshold);
    const sqftCost = sqftExcess * PRICING.sqftPerFootOver;
    const baseSubtotal = roomCost + sqftCost;

    // 3. Service type multiplier
    const serviceMultiplier = PRICING.serviceMultipliers[state.serviceType] || 1.0;
    const serviceSubtotal = baseSubtotal * serviceMultiplier;

    // 4. Frequency Discount
    const discountRate = PRICING.frequencyDiscounts[state.frequency] || 0;
    const discountAmount = serviceSubtotal * discountRate;
    let cleanAfterDiscount = serviceSubtotal - discountAmount;

    // 5. Minimum Job Floor ($110 floor)
    let isFloorApplied = false;
    if (cleanAfterDiscount < PRICING.minimumFloor) {
      cleanAfterDiscount = PRICING.minimumFloor;
      isFloorApplied = true;
    }

    // 6. Add-ons
    const addonsTotal = 
      (state.addons.linens * PRICING.addonRates.linens) +
      (state.addons.fridgeSingle * PRICING.addonRates.fridgeSingle) +
      (state.addons.fridgeDouble * PRICING.addonRates.fridgeDouble) +
      (state.addons.oven * PRICING.addonRates.oven) +
      (state.addons.pets * PRICING.addonRates.pets);

    // 7. Grand total
    const grandTotal = cleanAfterDiscount + addonsTotal;

    // 8. Time estimation
    let estHours = 1.75 + (state.bedrooms * 0.45) + (state.fullBaths * 0.6) + (state.sqft / 1400);
    if (state.serviceType === 'deep') estHours += 1.5;
    if (state.serviceType === 'moveinout') estHours += 2.0;
    if (state.serviceType === 'airbnb') estHours += 0.5;
    if (state.addons.fridgeSingle > 0) estHours += 0.6 * state.addons.fridgeSingle;
    if (state.addons.fridgeDouble > 0) estHours += 0.9 * state.addons.fridgeDouble;
    if (state.addons.oven > 0) estHours += 0.75 * state.addons.oven;
    if (state.addons.linens > 0) estHours += 0.15 * state.addons.linens;
    if (state.addons.pets > 0) estHours += 0.5 * state.addons.pets;

    const roundedHoursMin = (Math.floor(estHours * 2) / 2).toFixed(1);
    const roundedHoursMax = (Math.ceil((estHours + 0.75) * 2) / 2).toFixed(1);
    const crewSize = estHours > 4.5 ? '2 - 3 Specialists' : '2 Cleaning Specialists';

    return {
      baseSubtotal,
      serviceSubtotal,
      serviceMultiplier,
      discountRate,
      discountAmount,
      isFloorApplied,
      addonsTotal,
      grandTotal,
      estTime: `${roundedHoursMin} - ${roundedHoursMax} hrs`,
      crewSize
    };
  }

  /**
   * Animate number transition smoothly
   */
  let currentAnimatedTotal = 0;
  function animateQuoteTotal(targetVal) {
    if (!els.quoteTotal) return;
    const duration = 250;
    const startTime = performance.now();
    const startVal = currentAnimatedTotal || targetVal;

    function step(timestamp) {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetVal - startVal) * easeOut;
      els.quoteTotal.textContent = current.toFixed(2);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        els.quoteTotal.textContent = targetVal.toFixed(2);
        currentAnimatedTotal = targetVal;
      }
    }
    requestAnimationFrame(step);
  }

  /**
   * Update UI elements from state and calculated quote
   */
  function updateUI() {
    const quote = calculateQuote();

    // Update Stepper displays
    if (els.bedVal) els.bedVal.textContent = state.bedrooms;
    if (els.fullBathVal) els.fullBathVal.textContent = state.fullBaths;
    if (els.halfBathVal) els.halfBathVal.textContent = state.halfBaths;

    if (els.bedMinus) els.bedMinus.disabled = state.bedrooms <= 0;
    if (els.fullBathMinus) els.fullBathMinus.disabled = state.fullBaths <= 1;
    if (els.halfBathMinus) els.halfBathMinus.disabled = state.halfBaths <= 0;

    // Sqft input & slider sync
    if (els.sqftSlider && els.sqftSlider.value != state.sqft) {
      els.sqftSlider.value = state.sqft;
    }
    if (els.sqftInput && els.sqftInput.value != state.sqft) {
      els.sqftInput.value = state.sqft;
    }
    updateSliderBackground(els.sqftSlider);

    // Addons display
    if (els.addonLinensVal) els.addonLinensVal.textContent = state.addons.linens;
    if (els.addonFridgeVal) els.addonFridgeVal.textContent = state.addons.fridgeSingle;
    if (els.addonFridgeDoubleVal) els.addonFridgeDoubleVal.textContent = state.addons.fridgeDouble;
    if (els.addonOvenVal) els.addonOvenVal.textContent = state.addons.oven;
    if (els.addonPetsVal) els.addonPetsVal.textContent = state.addons.pets;

    if (els.addonLinensMinus) els.addonLinensMinus.disabled = state.addons.linens <= 0;
    if (els.addonFridgeMinus) els.addonFridgeMinus.disabled = state.addons.fridgeSingle <= 0;
    if (els.addonFridgeDoubleMinus) els.addonFridgeDoubleMinus.disabled = state.addons.fridgeDouble <= 0;
    if (els.addonOvenMinus) els.addonOvenMinus.disabled = state.addons.oven <= 0;
    if (els.addonPetsMinus) els.addonPetsMinus.disabled = state.addons.pets <= 0;

    // Highlight addon card if quantity > 0
    toggleAddonCardHighlight('addon-item-linens', state.addons.linens > 0);
    toggleAddonCardHighlight('addon-item-fridge', state.addons.fridgeSingle > 0);
    toggleAddonCardHighlight('addon-item-fridge-double', state.addons.fridgeDouble > 0);
    toggleAddonCardHighlight('addon-item-oven', state.addons.oven > 0);
    toggleAddonCardHighlight('addon-item-pets', state.addons.pets > 0);

    // Active Service radio card
    els.serviceCards.forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio && radio.value === state.serviceType) {
        card.classList.add('active');
        radio.checked = true;
      } else {
        card.classList.remove('active');
      }
    });

    // Active Frequency radio card
    els.freqCards.forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio && radio.value === state.frequency) {
        card.classList.add('active');
        radio.checked = true;
      } else {
        card.classList.remove('active');
      }
    });

    // Update Summary Price & Breakdown
    animateQuoteTotal(quote.grandTotal);

    const freqLabels = {
      weekly: 'Billed Weekly (Every 7 Days)',
      biweekly: 'Billed Bi-Weekly (Every 2 Weeks)',
      turnover: 'Per Guest Turnover (Airbnb / STR)',
      monthly: 'Billed Monthly (Every 4 Weeks)',
      onetime: 'One-Time Cleaning Rate'
    };
    if (els.quoteBillingFreq) {
      els.quoteBillingFreq.textContent = freqLabels[state.frequency] || '';
    }

    // Savings badge
    if (els.quoteSavingsAlert && els.quoteSavingsAmount) {
      if (quote.discountAmount > 0) {
        els.quoteSavingsAlert.style.display = 'inline-flex';
        els.quoteSavingsAmount.textContent = `$${quote.discountAmount.toFixed(2)}`;
      } else {
        els.quoteSavingsAlert.style.display = 'none';
      }
    }

    // Breakdown lines
    if (els.breakdownBaseRate) {
      els.breakdownBaseRate.textContent = `${state.bedrooms} Bed, ${state.fullBaths} Full, ${state.halfBaths} Half • ${state.sqft.toLocaleString()} sq ft`;
    }

    const serviceNames = {
      standard: 'Standard Clean',
      deep: 'Deep Restoration Clean',
      moveinout: 'Move In / Move Out Clean',
      airbnb: 'Airbnb / STR Turnover'
    };
    if (els.breakdownServiceType) {
      els.breakdownServiceType.textContent = serviceNames[state.serviceType] || 'Standard';
    }
    if (els.breakdownServiceRate) {
      els.breakdownServiceRate.textContent = `$${quote.serviceSubtotal.toFixed(2)}`;
    }

    // Discount row
    if (els.breakdownDiscountRow) {
      if (quote.discountAmount > 0) {
        els.breakdownDiscountRow.style.display = 'flex';
        const pct = Math.round(quote.discountRate * 100);
        if (els.breakdownDiscountLabel) {
          els.breakdownDiscountLabel.textContent = `Recurring Discount (${pct}% OFF)`;
        }
        if (els.breakdownDiscountVal) {
          els.breakdownDiscountVal.textContent = `-$${quote.discountAmount.toFixed(2)}`;
        }
      } else {
        els.breakdownDiscountRow.style.display = 'none';
      }
    }

    // Addons row
    if (els.breakdownAddonsRow && els.breakdownAddonsVal) {
      if (quote.addonsTotal > 0) {
        els.breakdownAddonsRow.style.display = 'flex';
        els.breakdownAddonsVal.textContent = `+$${quote.addonsTotal.toFixed(2)}`;
      } else {
        els.breakdownAddonsRow.style.display = 'none';
      }
    }

    // Duration & crew
    if (els.summaryEstTime) els.summaryEstTime.textContent = quote.estTime;
    if (els.summaryCrew) els.summaryCrew.textContent = quote.crewSize;

    // Public display state for the estimate recap, never a booking/payment authority.
    window.SmartsProCurrentQuote = {
      state: JSON.parse(JSON.stringify(state)),
      calculation: quote
    };
  }

  function toggleAddonCardHighlight(id, hasQty) {
    const card = document.getElementById(id);
    if (card) {
      card.classList.toggle('has-quantity', hasQty);
    }
  }

  function updateSliderBackground(slider) {
    if (!slider) return;
    const min = parseInt(slider.min, 10) || 400;
    const max = parseInt(slider.max, 10) || 6000;
    const val = parseInt(slider.value, 10);
    const percentage = ((val - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #0066CC 0%, #00B4D8 ${percentage}%, #CBD5E1 ${percentage}%, #CBD5E1 100%)`;
  }

  /**
   * Set up event listeners
   */
  function initListeners() {
    // Bedrooms Stepper
    els.bedMinus?.addEventListener('click', () => {
      if (state.bedrooms > 0) {
        state.bedrooms--;
        updateUI();
      }
    });
    els.bedPlus?.addEventListener('click', () => {
      if (state.bedrooms < 10) {
        state.bedrooms++;
        updateUI();
      }
    });

    // Full Baths Stepper
    els.fullBathMinus?.addEventListener('click', () => {
      if (state.fullBaths > 1) {
        state.fullBaths--;
        updateUI();
      }
    });
    els.fullBathPlus?.addEventListener('click', () => {
      if (state.fullBaths < 8) {
        state.fullBaths++;
        updateUI();
      }
    });

    // Half Baths Stepper
    els.halfBathMinus?.addEventListener('click', () => {
      if (state.halfBaths > 0) {
        state.halfBaths--;
        updateUI();
      }
    });
    els.halfBathPlus?.addEventListener('click', () => {
      if (state.halfBaths < 6) {
        state.halfBaths++;
        updateUI();
      }
    });

    // Bound both controls consistently. Server-side validation is still required
    // before these display-only values can be used in a real booking.
    function updateSquareFootage(value) {
      const parsed = Number(value);
      state.sqft = Number.isFinite(parsed) ? Math.min(6000, Math.max(400, Math.round(parsed))) : 400;
      updateUI();
    }

    // Sqft slider & input
    els.sqftSlider?.addEventListener('input', (e) => {
      updateSquareFootage(e.target.value);
    });

    els.sqftInput?.addEventListener('input', (e) => {
      updateSquareFootage(e.target.value);
    });

    // Service Type radio cards
    els.serviceCards.forEach(card => {
      card.addEventListener('click', () => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio && Object.hasOwn(PRICING.serviceMultipliers, radio.value)) {
          state.serviceType = radio.value;
          updateUI();
        }
      });
    });

    // Frequency radio cards
    els.freqCards.forEach(card => {
      card.addEventListener('click', () => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio && Object.hasOwn(PRICING.frequencyDiscounts, radio.value)) {
          state.frequency = radio.value;
          updateUI();
        }
      });
    });

    // Addons Steppers
    els.addonLinensMinus?.addEventListener('click', () => {
      if (state.addons.linens > 0) { state.addons.linens--; updateUI(); }
    });
    els.addonLinensPlus?.addEventListener('click', () => {
      if (state.addons.linens < 15) { state.addons.linens++; updateUI(); }
    });

    els.addonFridgeMinus?.addEventListener('click', () => {
      if (state.addons.fridgeSingle > 0) { state.addons.fridgeSingle--; updateUI(); }
    });
    els.addonFridgePlus?.addEventListener('click', () => {
      if (state.addons.fridgeSingle < 5) { state.addons.fridgeSingle++; updateUI(); }
    });

    els.addonFridgeDoubleMinus?.addEventListener('click', () => {
      if (state.addons.fridgeDouble > 0) { state.addons.fridgeDouble--; updateUI(); }
    });
    els.addonFridgeDoublePlus?.addEventListener('click', () => {
      if (state.addons.fridgeDouble < 5) { state.addons.fridgeDouble++; updateUI(); }
    });

    els.addonOvenMinus?.addEventListener('click', () => {
      if (state.addons.oven > 0) { state.addons.oven--; updateUI(); }
    });
    els.addonOvenPlus?.addEventListener('click', () => {
      if (state.addons.oven < 5) { state.addons.oven++; updateUI(); }
    });

    els.addonPetsMinus?.addEventListener('click', () => {
      if (state.addons.pets > 0) { state.addons.pets--; updateUI(); }
    });
    els.addonPetsPlus?.addEventListener('click', () => {
      if (state.addons.pets < 5) { state.addons.pets++; updateUI(); }
    });

    // Print Quote button
    els.btnPrintQuote?.addEventListener('click', () => {
      window.print();
    });

    // Share / Copy Link or summary
    els.btnShareQuote?.addEventListener('click', () => {
      const q = window.SmartsProCurrentQuote;
      const shareText = `Smarts Pro Solutions Estimate: $${q.calculation.grandTotal.toFixed(2)} (${state.bedrooms} Bed, ${state.fullBaths} Bath, ${state.sqft} sqft - ${state.serviceType.toUpperCase()} CLEAN). Call (318) 564-4360 to book!`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
          alert('Estimate summary copied to clipboard! You can paste and send this via text or email.');
        }).catch(() => alert(shareText));
      } else {
        alert(shareText);
      }
    });

    // Trigger Book Now Modal
    els.btnBookNow?.addEventListener('click', () => {
      if (window.SmartsProModal && typeof window.SmartsProModal.openBookingModal === 'function') {
        window.SmartsProModal.openBookingModal(window.SmartsProCurrentQuote);
      }
    });
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initListeners();
    updateUI();
  });

})();
