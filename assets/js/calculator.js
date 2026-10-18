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
    serviceType: 'standard', // 'standard' | 'deep' | 'moveinout'
    frequency: 'biweekly',   // 'weekly' | 'biweekly' | 'monthly' | 'onetime'
    addons: {
      linens: 0,
      fridge: 0,
      oven: 0,
      windows: 0
    }
  };

  // Pricing Parameters & Rates
  const PRICING = {
    baseFlat: 85,
    perBedroom: 25,
    perFullBath: 35,
    perHalfBath: 20,
    sqftBaseThreshold: 1000,
    sqftPerFootOver: 0.05,
    
    serviceMultipliers: {
      standard: 1.0,
      deep: 1.45,
      moveinout: 1.65
    },

    frequencyDiscounts: {
      weekly: 0.20,     // 20% OFF
      biweekly: 0.15,   // 15% OFF
      monthly: 0.10,    // 10% OFF
      onetime: 0.00     // No discount
    },

    addonRates: {
      linens: 5,     // $5 each
      fridge: 50,    // $50 each
      oven: 60,      // $60 each
      windows: 3     // $3 each
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

    addonOvenVal: document.getElementById('val-addon-oven'),
    addonOvenMinus: document.getElementById('btn-oven-minus'),
    addonOvenPlus: document.getElementById('btn-oven-plus'),

    addonWindowsVal: document.getElementById('val-addon-windows'),
    addonWindowsMinus: document.getElementById('btn-windows-minus'),
    addonWindowsPlus: document.getElementById('btn-windows-plus'),

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
   * Calculate exact quote details from current state
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
    const cleanAfterDiscount = serviceSubtotal - discountAmount;

    // 5. Add-ons
    const addonsTotal = 
      (state.addons.linens * PRICING.addonRates.linens) +
      (state.addons.fridge * PRICING.addonRates.fridge) +
      (state.addons.oven * PRICING.addonRates.oven) +
      (state.addons.windows * PRICING.addonRates.windows);

    // 6. Grand total
    const grandTotal = cleanAfterDiscount + addonsTotal;

    // 7. Time estimation
    let estHours = 1.75 + (state.bedrooms * 0.45) + (state.fullBaths * 0.6) + (state.sqft / 1400);
    if (state.serviceType === 'deep') estHours += 1.5;
    if (state.serviceType === 'moveinout') estHours += 2.0;
    if (state.addons.fridge > 0) estHours += 0.5 * state.addons.fridge;
    if (state.addons.oven > 0) estHours += 0.5 * state.addons.oven;
    if (state.addons.windows > 0) estHours += 0.1 * state.addons.windows;

    const roundedHoursMin = (Math.floor(estHours * 2) / 2).toFixed(1);
    const roundedHoursMax = (Math.ceil((estHours + 0.75) * 2) / 2).toFixed(1);
    const crewSize = estHours > 4.5 ? '2 - 3 Specialists' : '2 Cleaning Specialists';

    return {
      baseSubtotal,
      serviceSubtotal,
      serviceMultiplier,
      discountRate,
      discountAmount,
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
    if (els.addonFridgeVal) els.addonFridgeVal.textContent = state.addons.fridge;
    if (els.addonOvenVal) els.addonOvenVal.textContent = state.addons.oven;
    if (els.addonWindowsVal) els.addonWindowsVal.textContent = state.addons.windows;

    if (els.addonLinensMinus) els.addonLinensMinus.disabled = state.addons.linens <= 0;
    if (els.addonFridgeMinus) els.addonFridgeMinus.disabled = state.addons.fridge <= 0;
    if (els.addonOvenMinus) els.addonOvenMinus.disabled = state.addons.oven <= 0;
    if (els.addonWindowsMinus) els.addonWindowsMinus.disabled = state.addons.windows <= 0;

    // Highlight addon card if quantity > 0
    toggleAddonCardHighlight('addon-item-linens', state.addons.linens > 0);
    toggleAddonCardHighlight('addon-item-fridge', state.addons.fridge > 0);
    toggleAddonCardHighlight('addon-item-oven', state.addons.oven > 0);
    toggleAddonCardHighlight('addon-item-windows', state.addons.windows > 0);

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
      moveinout: 'Move In / Move Out Clean'
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

    // Broadcast state for booking modal and backend framework
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

    // Sqft slider & input
    els.sqftSlider?.addEventListener('input', (e) => {
      state.sqft = parseInt(e.target.value, 10);
      updateUI();
    });

    els.sqftInput?.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 400;
      if (val < 200) val = 200;
      if (val > 10000) val = 10000;
      state.sqft = val;
      updateUI();
    });

    // Service Type radio cards
    els.serviceCards.forEach(card => {
      card.addEventListener('click', () => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio) {
          state.serviceType = radio.value;
          updateUI();
        }
      });
    });

    // Frequency radio cards
    els.freqCards.forEach(card => {
      card.addEventListener('click', () => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio) {
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
      if (state.addons.fridge > 0) { state.addons.fridge--; updateUI(); }
    });
    els.addonFridgePlus?.addEventListener('click', () => {
      if (state.addons.fridge < 5) { state.addons.fridge++; updateUI(); }
    });

    els.addonOvenMinus?.addEventListener('click', () => {
      if (state.addons.oven > 0) { state.addons.oven--; updateUI(); }
    });
    els.addonOvenPlus?.addEventListener('click', () => {
      if (state.addons.oven < 5) { state.addons.oven++; updateUI(); }
    });

    els.addonWindowsMinus?.addEventListener('click', () => {
      if (state.addons.windows > 0) { state.addons.windows--; updateUI(); }
    });
    els.addonWindowsPlus?.addEventListener('click', () => {
      if (state.addons.windows < 50) { state.addons.windows++; updateUI(); }
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
        });
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
