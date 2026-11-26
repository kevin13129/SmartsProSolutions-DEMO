/**
 * SMARTS PRO SOLUTIONS - LIVE PRICING CALCULATOR ENGINE & MULTI-STEP WIZARD
 * Step 1: Type of Service (Residential, Commercial, Move-In/Out, Airbnb) + Scope Overview
 * Step 2: Property Details (Residential Tiers OR Move-In/Out Property Type + Gauge)
 * Step 3: Additional Information (Pets, Last Professional Cleaning, Occupancy, Current Condition)
 *         (Steps 2 & 3 skipped automatically for Commercial & Offices -> goes straight to Frequency)
 * Step 4: Cleaning Frequency
 * Step 5: Custom Add-Ons (Appliances + Specific Areas Flat-Rate Package Option)
 *
 * Includes per-step fulfillment validation with missing-option highlighting
 * and dispatches structured job envelopes to SmartsProDispatchFramework.
 */

(function () {
  'use strict';

  // --- Pricing Configuration (Flat-rate property valuation) ---
  const PRICING_CONFIG = {
    minimumJobCharge: 50,
    specificAreas: {
      minHours: 1,
      maxHours: 6,
      baseOneHourFlatRate: 50,
      extraHourRate: 50
    },
    hourlyRates: {
      standard: 50,
      deep: 60,
      moveinout: 60,
      airbnb: 50,
      commercial: 50
    },
    timeFactors: {
      baseHours: 1.5,
      perBedroomHours: 0.5,
      perFullBathHours: 0.5,
      perHalfBathHours: 0.25,
      perExtraLivingRoomHours: 0.5,
      sqftBaseline: 1000,
      sqftStepSize: 500,
      hoursPerSqftStep: 0.5
    },
    serviceMultipliers: {
      standard: 1.0,
      deep: 1.1,
      moveinout: 1.25,
      airbnb: 1.0
    },
    scheduleSurcharges: {
      weekly: { flatMin: 0, pct: 0 },
      turnover: { flatMin: 0, pct: 0 },
      biweekly: { flatMin: 30, pct: 0.12 },
      monthly: { flatMin: 50, pct: 0.20 },
      onetime: { flatMin: 65, pct: 0.26 },
      overnight: { flatMin: 85, pct: 0.30 }
    },
    addons: {
      fridge: 54.99,
      fridgeDouble: 64.99,
      oven: 61.88,
      laundry: 48.98,
      organizing: 29.60,
      dishes: 24.78,
      windows: 8,
      powerWashWindows: 25,
      pets: 35
    },
    recurringDiscountsEnabled: false,
    onlinePaymentsEnabled: false
  };

  function roundMoney(val) {
    return Math.round((Number(val) || 0) * 100) / 100;
  }

  function calcFrequencySurcharge(basePrice, freq) {
    const rule = PRICING_CONFIG.scheduleSurcharges[freq];
    if (!rule || (rule.flatMin <= 0 && rule.pct <= 0)) {
      return 0;
    }
    return Math.max(rule.flatMin, Math.round(Number(basePrice || 0) * rule.pct));
  }

  // --- Service Scope Overviews for Step 1 ---
  const SERVICE_OVERVIEWS = {
    default: {
      kicker: "What's Included",
      title: 'Compare Cleaning Categories',
      desc: 'Pick a card above to view what is included and unlock the next step.',
      items: [
        'Residential: Kitchens, baths, floors & dusting (Standard, Deep, or Specific Areas add-on)',
        'Commercial: Lobbies, desks, restrooms, breakrooms & custom schedule',
        'Move-In / Out: Inside empty cabinets, closets, baseboards & lease prep',
        'Airbnb / STR: Linen reset, kitchen & bath sanitize, restock check'
      ]
    },
    residential: {
      kicker: 'RESIDENTIAL HOMES',
      title: 'Whole-Home Care (Standard · Deep · Specific Areas)',
      desc: 'Tailored cleaning for houses and apartments across Shreveport & Bossier City.',
      items: [
        'Kitchens: Counters, sink, stovetop degrease, microwave & cabinet fronts',
        'Bathrooms: Showers, tubs, toilets, mirrors & fixtures sanitized',
        'Living & Bedrooms: Fans, sills, baseboards, dusting & floor care',
        'Flexible Options: Standard, Deep Clean, or Specific Areas add-on'
      ]
    },
    commercial: {
      kicker: 'COMMERCIAL & OFFICES',
      title: 'Office & Facility Care (Walkthrough & Custom Schedule)',
      desc: 'Reliable janitorial service for offices, clinics, retail, and banks. Next: pick your schedule.',
      items: [
        'Lobbies & Desks: Entry glass, workstations, conference tables & dusting',
        'Restrooms & Breakrooms: Multi-stall sanitizing, refills & breakroom wipe-down',
        'Floors & Hallways: HEPA vacuuming, mopping & entryway detailing',
        'Direct Flow: Goes straight to Frequency & Walkthrough Request'
      ]
    },
    moveinout: {
      kicker: 'MOVE-IN / MOVE-OUT',
      title: 'Empty-Home Reset for Leases & Closings',
      desc: 'Inspection-ready detail for empty houses, apartments, condos, and townhomes.',
      items: [
        'Cabinets & Closets: Full wipe-down inside empty kitchen & bath storage',
        'Trim & Fixtures: Hand-wiped baseboards, doors, switches, vents & sills',
        'Kitchen & Bath: Heavy buildup removal, appliance exteriors & fixtures',
        'Next Step: Choose House, Apartment, Condo, or Townhome'
      ]
    },
    airbnb: {
      kicker: 'AIRBNB / STR TURNOVER',
      title: '5-Star Guest-Ready Turnover',
      desc: 'Fast, checklist-driven resets between guest check-out and check-in.',
      items: [
        'Beds & Linens: Fresh linen change, towel staging & bedroom reset',
        'Kitchen & Bath: Disinfected counters, sinks, dishes & supply check',
        'Damage Check: Quick visual scan for left items or maintenance needs',
        'On-Time Window: Timed around check-out and check-in schedules'
      ]
    }
  };

  // --- Calculator State ---
  const state = {
    wizardStep: 1,
    serviceCategory: 'residential', // 'residential' | 'commercial' | 'moveinout' | 'airbnb'
    step1Fulfilled: false,
    step2ResidentialFulfilled: false,
    step2AirbnbConfirmed: false,
    step4FrequencyFulfilled: false,
    step5Visited: false,
    propertyType: '', // 'House' | 'Apartment' | 'Condo' | 'Townhome'
    scopeMode: 'full', // 'full' | 'specific'
    specificAreasText: '',
    serviceDetails: '',
    specificHours: 1,
    bedrooms: 3,
    fullBaths: 2,
    halfBaths: 1,
    extraLivingRooms: 0,
    sqft: 1800,
    serviceType: 'standard', // 'standard' | 'deep' | 'moveinout' | 'airbnb'
    additionalInfo: {
      hasPets: '', // 'yes' | 'no'
      lastCleaned: '',
      occupancy: '',
      condition: ''
    },
    frequency: 'weekly', // 'weekly' | 'biweekly' | 'turnover' | 'monthly' | 'onetime' | 'overnight'
    addons: {
      fridge: 0,
      fridgeDouble: 0,
      oven: 0,
      laundry: 0,
      organizing: 0,
      dishes: 0,
      windows: 0,
      powerWashWindows: 0,
      pets: 0
    }
  };

  // --- DOM Elements Cache ---
  const els = {
    // Top & Bottom Wizard Elements
    calcStepCurrent: document.getElementById('calc-step-current'),
    calcStepTotal: document.getElementById('calc-step-total'),
    calcStepActiveName: document.getElementById('calc-step-active-name'),
    calcWizardProgressBar: document.getElementById('calc-wizard-progressbar'),
    calcWizardProgressFill: document.getElementById('calc-wizard-progress-fill'),
    wizardFooterStatus: document.getElementById('wizard-footer-status'),
    btnWizardPrevTop: document.getElementById('btn-wizard-prev-top'),
    btnWizardNextTop: document.getElementById('btn-wizard-next-top'),
    btnWizardPrev: document.getElementById('btn-wizard-prev'),
    btnWizardNext: document.getElementById('btn-wizard-next'),
    wizardNextLabel: document.getElementById('wizard-next-label'),
    wizardStepTabs: document.querySelectorAll('.wizard-step-tab'),
    wizardStepPanes: document.querySelectorAll('.calc-step-card'),

    // Dynamic Step Numbers & Titles
    step2Badge: document.getElementById('step-badge-2'),
    step2HeadingTitle: document.getElementById('step2-heading-title'),
    step2HeadingDesc: document.getElementById('step2-heading-desc'),
    step3Badge: document.getElementById('step-badge-3'),
    step4Badge: document.getElementById('step-badge-4'),
    step4HeadingTitle: document.getElementById('step4-heading-title'),
    step4HeadingDesc: document.getElementById('step4-heading-desc'),
    wizardTabNum4: document.getElementById('wizard-tab-num-4'),

    // Validation Banner
    validationBanner: document.getElementById('wizard-validation-banner'),
    validationMessage: document.getElementById('wizard-validation-message'),

    // Step 1: Service Category & Overview
    step1ServiceGrid: document.getElementById('step1-service-grid'),
    serviceCategoryCards: document.querySelectorAll('#step1-service-grid .service-card-option'),
    overviewKicker: document.getElementById('overview-kicker'),
    overviewTitle: document.getElementById('overview-title'),
    overviewDesc: document.getElementById('overview-desc'),
    overviewBullet1: document.getElementById('overview-bullet-1'),
    overviewBullet2: document.getElementById('overview-bullet-2'),
    overviewBullet3: document.getElementById('overview-bullet-3'),
    overviewBullet4: document.getElementById('overview-bullet-4'),

    // Step 2: Residential vs Move-In/Out Controls
    step2ResidentialControls: document.getElementById('step2-residential-controls'),
    residentialTierGroup: document.getElementById('residential-tier-group'),
    residentialTierBtns: document.querySelectorAll('#residential-tier-group .scope-mode-btn'),
    step2MoveinoutPropertyType: document.getElementById('step2-moveinout-property-type'),
    movePropertyTypeGroup: document.getElementById('move-property-type-group'),
    propertyTypeBtns: document.querySelectorAll('.property-type-btn'),

    // Scope Mode & Specific Areas Elements (Moved to Step 5 Add-Ons)
    scopePanelFull: document.getElementById('scope-panel-full'),
    step5SpecificAreasBlock: document.getElementById('step5-specific-areas-block'),
    btnScopeSpecific: document.getElementById('btn-scope-specific'),
    specificAreasToggleBadge: document.getElementById('specific-areas-toggle-badge'),
    scopePanelSpecific: document.getElementById('scope-panel-specific'),
    specificAreasInputGroup: document.getElementById('specific-areas-input-group'),
    inputSpecificAreas: document.getElementById('input-specific-areas'),
    valSpecificHours: document.getElementById('val-specific-hours'),
    btnHoursMinus: document.getElementById('btn-hours-minus'),
    btnHoursPlus: document.getElementById('btn-hours-plus'),
    hourTierBtns: document.querySelectorAll('.hour-tier-btn'),

    // Bedrooms & Bathrooms
    valBedrooms: document.getElementById('val-bedrooms'),
    btnBedMinus: document.getElementById('btn-bed-minus'),
    btnBedPlus: document.getElementById('btn-bed-plus'),

    valFullBaths: document.getElementById('val-fullbaths'),
    btnBathMinus: document.getElementById('btn-fullbath-minus'),
    btnBathPlus: document.getElementById('btn-fullbath-plus'),

    valHalfBaths: document.getElementById('val-halfbaths'),
    btnHalfBathMinus: document.getElementById('btn-halfbath-minus'),
    btnHalfBathPlus: document.getElementById('btn-halfbath-plus'),

    valLivingRooms: document.getElementById('val-livingrooms'),
    btnLivingMinus: document.getElementById('btn-living-minus'),
    btnLivingPlus: document.getElementById('btn-living-plus'),

    // Square Footage
    sliderSqft: document.getElementById('slider-sqft'),
    inputSqft: document.getElementById('input-sqft'),

    // Step 3: Additional Information Question Groups & Options
    addinfoGroupPets: document.getElementById('addinfo-group-pets'),
    addinfoGroupLastCleaned: document.getElementById('addinfo-group-lastcleaned'),
    addinfoGroupOccupancy: document.getElementById('addinfo-group-occupancy'),
    addinfoGroupCondition: document.getElementById('addinfo-group-condition'),
    addinfoOptionBtns: document.querySelectorAll('.addinfo-check-option'),

    // Step 4: Frequency Cards
    step4FrequencyGrid: document.getElementById('step4-frequency-grid'),
    freqCards: document.querySelectorAll('.freq-card-option'),
    freqCardOvernight: document.getElementById('freq-card-overnight'),
    step4OvernightNotice: document.getElementById('step4-overnight-notice'),
    freqBadgeWeekly: document.getElementById('freq-badge-weekly'),
    freqBadgeBiweekly: document.getElementById('freq-badge-biweekly'),
    freqBadgeMonthly: document.getElementById('freq-badge-monthly'),
    freqBadgeTurnover: document.getElementById('freq-badge-turnover'),
    freqBadgeOnetime: document.getElementById('freq-badge-onetime'),
    freqBadgeOvernight: document.getElementById('freq-badge-overnight'),
    freqTurnoverTitle: document.getElementById('freq-turnover-title'),
    freqTurnoverSub: document.getElementById('freq-turnover-sub'),
    step4FlatRateText: document.getElementById('step4-flat-rate-text'),

    // Step 5: Add-Ons & Service Details
    inputServiceDetails: document.getElementById('input-service-details'),

    valFridge: document.getElementById('val-addon-fridge'),
    btnFridgeMinus: document.getElementById('btn-fridge-minus'),
    btnFridgePlus: document.getElementById('btn-fridge-plus'),
    cardFridge: document.getElementById('addon-item-fridge'),

    valFridgeDouble: document.getElementById('val-addon-fridge-double'),
    btnFridgeDoubleMinus: document.getElementById('btn-fridge-double-minus'),
    btnFridgeDoublePlus: document.getElementById('btn-fridge-double-plus'),
    cardFridgeDouble: document.getElementById('addon-item-fridge-double'),

    valOven: document.getElementById('val-addon-oven'),
    btnOvenMinus: document.getElementById('btn-oven-minus'),
    btnOvenPlus: document.getElementById('btn-oven-plus'),
    cardOven: document.getElementById('addon-item-oven'),

    valLaundry: document.getElementById('val-addon-laundry'),
    btnLaundryMinus: document.getElementById('btn-laundry-minus'),
    btnLaundryPlus: document.getElementById('btn-laundry-plus'),
    cardLaundry: document.getElementById('addon-item-laundry'),

    valOrganizing: document.getElementById('val-addon-organizing'),
    btnOrganizingMinus: document.getElementById('btn-organizing-minus'),
    btnOrganizingPlus: document.getElementById('btn-organizing-plus'),
    cardOrganizing: document.getElementById('addon-item-organizing'),

    valDishes: document.getElementById('val-addon-dishes'),
    btnDishesMinus: document.getElementById('btn-dishes-minus'),
    btnDishesPlus: document.getElementById('btn-dishes-plus'),
    cardDishes: document.getElementById('addon-item-dishes'),

    valWindows: document.getElementById('val-addon-windows'),
    btnWindowsMinus: document.getElementById('btn-windows-minus'),
    btnWindowsPlus: document.getElementById('btn-windows-plus'),
    cardWindows: document.getElementById('addon-item-windows'),

    valPowerWash: document.getElementById('val-addon-powerwash'),
    btnPowerWashMinus: document.getElementById('btn-powerwash-minus'),
    btnPowerWashPlus: document.getElementById('btn-powerwash-plus'),
    cardPowerWash: document.getElementById('addon-item-powerwash'),

    // Summary Output Elements
    quoteSummaryCard: document.querySelector('.quote-summary-card'),
    quoteHeaderTitle: document.querySelector('.quote-header-title'),
    quoteLivePill: document.getElementById('quote-live-pill'),
    quotePolicyCallout: document.getElementById('quote-policy-callout'),
    quotePriceLabel: document.getElementById('quote-price-label'),
    quotePriceCurrency: document.getElementById('quote-price-currency'),
    quoteTotalAmount: document.getElementById('quote-total-amount'),
    quoteBillingFreq: document.getElementById('quote-billing-freq'),
    quoteRateBasisNote: document.getElementById('quote-rate-basis-note'),
    quoteMinimumNoteText: document.getElementById('quote-minimum-note-text'),

    summaryScopeTitle: document.getElementById('summary-scope-title'),
    summaryBaseRate: document.getElementById('summary-base-rate'),
    summaryPropertyTypeRow: document.getElementById('summary-property-type-row'),
    summaryPropertyTypeVal: document.getElementById('summary-property-type-val'),
    summarySpecificAreasRow: document.getElementById('summary-specific-areas-row'),
    summarySpecificAreasVal: document.getElementById('summary-specific-areas-val'),
    summaryAddinfoRow: document.getElementById('summary-addinfo-row'),
    summaryAddinfoVal: document.getElementById('summary-addinfo-val'),
    summaryServiceType: document.getElementById('summary-service-type'),
    summaryServiceRate: document.getElementById('summary-service-rate'),
    summaryFrequencyRow: document.getElementById('summary-frequency-row'),
    summaryFrequencyVal: document.getElementById('summary-frequency-val'),
    summaryAddonsRow: document.getElementById('summary-addons-row'),
    summaryAddonsVal: document.getElementById('summary-addons-val'),
    summaryDispatchVal: document.getElementById('summary-dispatch-val'),
    summaryOnlinePaymentVal: document.getElementById('summary-online-payment-val'),
    quotePolicyCallout: document.getElementById('quote-policy-callout'),
    btnBookQuoteLabel: document.getElementById('btn-book-quote-label'),

    btnPrintQuote: document.getElementById('btn-print-quote'),
    btnShareQuote: document.getElementById('btn-share-quote'),
    btnResetCalc: document.getElementById('btn-reset-calc')
  };

  /**
   * Returns the ordered array of active wizard step IDs for the current service category.
   * Commercial & Offices only asks Step 1 (Type of Service) -> Step 4 (Cleaning Frequency).
   * Residential, Move-In/Out, and Airbnb include Step 3 (Additional Information) in a 5-step sequence.
   */
  function getActiveStepSequence() {
    if (state.serviceCategory === 'commercial') {
      return [1, 4];
    }
    return [1, 2, 3, 4, 5];
  }

  /**
   * Clears validation banner and any .wizard-field-missing highlights.
   */
  function clearValidationErrors() {
    if (els.validationBanner) {
      els.validationBanner.classList.add('is-hidden');
    }
    document.querySelectorAll('.wizard-field-missing').forEach((node) => {
      node.classList.remove('wizard-field-missing');
    });
  }

  /**
   * Displays a validation message and highlights the missing container(s).
   */
  function showValidationError(message, highlightNodes) {
    clearValidationErrors();
    if (els.validationMessage) {
      els.validationMessage.textContent = message;
    }
    if (els.validationBanner) {
      els.validationBanner.classList.remove('is-hidden');
    }
    if (Array.isArray(highlightNodes)) {
      highlightNodes.forEach((node) => {
        if (node) {
          node.classList.add('wizard-field-missing');
        }
      });
    }
  }

  /**
   * Validates whether the given step has been fulfilled by the user.
   * Highlights missing fields and prevents moving forward if unfulfilled.
   */
  function validateStepFulfillment(stepId) {
    clearValidationErrors();

    if (stepId === 1) {
      if (!state.step1Fulfilled) {
        showValidationError(
          'Select a service category above to continue.',
          [els.step1ServiceGrid]
        );
        return false;
      }
      return true;
    }

    if (stepId === 2) {
      if (state.serviceCategory === 'moveinout') {
        if (!state.propertyType) {
          showValidationError(
            'Select a Property Type (House, Apartment, Condo, or Townhome) to continue.',
            [els.step2MoveinoutPropertyType, els.movePropertyTypeGroup]
          );
          return false;
        }
        return true;
      }

      if (state.serviceCategory === 'residential') {
        if (!state.step2ResidentialFulfilled) {
          showValidationError(
            'Choose Standard Clean or Deep Clean and set your home size to continue.',
            [els.residentialTierGroup, els.scopePanelFull]
          );
          return false;
        }
        return true;
      }

      if (state.serviceCategory === 'airbnb') {
        state.step2AirbnbConfirmed = true;
        return true;
      }
    }

    if (stepId === 3) {
      const missingGroups = [];
      if (!state.additionalInfo.hasPets) missingGroups.push(els.addinfoGroupPets);
      if (!state.additionalInfo.lastCleaned) missingGroups.push(els.addinfoGroupLastCleaned);
      if (!state.additionalInfo.occupancy) missingGroups.push(els.addinfoGroupOccupancy);
      if (!state.additionalInfo.condition) missingGroups.push(els.addinfoGroupCondition);

      if (missingGroups.length > 0) {
        showValidationError(
          'Please answer all 4 Home Info questions before continuing.',
          missingGroups
        );
        return false;
      }
      return true;
    }

    if (stepId === 4) {
      if (state.frequency === 'overnight' && state.serviceCategory !== 'commercial') {
        state.frequency = 'weekly';
        state.step4FrequencyFulfilled = false;
      }
      if (!state.step4FrequencyFulfilled) {
        showValidationError(
          'Select a cleaning frequency below to continue.',
          [els.step4FrequencyGrid]
        );
        return false;
      }
      return true;
    }

    if (stepId === 5) {
      if (
        state.serviceCategory !== 'commercial' &&
        state.scopeMode === 'specific' &&
        state.specificAreasText.trim().length === 0
      ) {
        showValidationError(
          'Describe the Specific Areas to clean (or click Specific Areas again to remove it).',
          [els.specificAreasInputGroup, els.inputSpecificAreas]
        );
        if (els.inputSpecificAreas) els.inputSpecificAreas.focus();
        return false;
      }
      return true;
    }

    return true;
  }

  /**
   * Updates the Step 1 Service Scope Overview box based on the active serviceCategory.
   */
  function updateServiceOverviewUI() {
    const key = state.step1Fulfilled ? state.serviceCategory : 'default';
    const info = SERVICE_OVERVIEWS[key] || SERVICE_OVERVIEWS.default;
    if (els.overviewKicker) els.overviewKicker.textContent = info.kicker;
    if (els.overviewTitle) els.overviewTitle.textContent = info.title;
    if (els.overviewDesc) els.overviewDesc.textContent = info.desc;
    if (els.overviewBullet1) els.overviewBullet1.textContent = info.items[0];
    if (els.overviewBullet2) els.overviewBullet2.textContent = info.items[1];
    if (els.overviewBullet3) els.overviewBullet3.textContent = info.items[2];
    if (els.overviewBullet4) els.overviewBullet4.textContent = info.items[3];

    els.serviceCategoryCards.forEach((card) => {
      const cat = card.getAttribute('data-service-cat');
      const isMatch = state.step1Fulfilled && cat === state.serviceCategory;
      card.classList.toggle('active', isMatch);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = isMatch;
    });
  }

  /**
   * Calculate live pricing & time metrics based on current state
   */
  function calculateQuote() {
    const cfg = PRICING_CONFIG;

    if (state.serviceCategory === 'commercial') {
      const baseRate = cfg.hourlyRates.commercial;
      const estimatedHours = 3.0;
      const basePrice = 0;
      const frequencySurcharge = 0;
      const grandTotal = 0;
      return {
        isCommercial: true,
        isSpecificAreas: false,
        customQuoteAtWalkthrough: true,
        priceDisplay: 'Custom Quote at Walkthrough',
        hourlyRate: baseRate,
        estimatedHours,
        addonHours: 0,
        totalEstimatedHours: estimatedHours,
        durationMinutes: Math.round(estimatedHours * 60),
        basePrice,
        frequencySurcharge,
        minApplied: false,
        discountRate: 0,
        discountAmount: 0,
        addonsTotal: 0,
        grandTotal,
        onlinePaymentsEnabled: false,
        timeRangeText: state.frequency === 'overnight' ? 'Tentative Overnight Window' : 'On-Site Walkthrough',
        crewText: 'Commercial Team'
      };
    }

    const isSpecificAreas =
      state.serviceCategory !== 'commercial' && state.scopeMode === 'specific';

    const hourlyRate = cfg.hourlyRates[state.serviceType] || 50;
    const tf = cfg.timeFactors;
    const extraSqft = Math.max(0, state.sqft - tf.sqftBaseline);
    const sqftHours = (extraSqft / tf.sqftStepSize) * tf.hoursPerSqftStep;

    const rawHours =
      tf.baseHours +
      state.bedrooms * tf.perBedroomHours +
      state.fullBaths * tf.perFullBathHours +
      state.halfBaths * tf.perHalfBathHours +
      state.extraLivingRooms * tf.perExtraLivingRoomHours +
      sqftHours;

    const serviceMult = cfg.serviceMultipliers[state.serviceType] || 1.0;
    const estimatedHours = Math.max(1.0, Math.round(rawHours * serviceMult * 2) / 2);

    const rawPrice = Math.round(estimatedHours * hourlyRate);
    const basePrice = Math.max(cfg.minimumJobCharge, rawPrice);
    const minApplied = rawPrice < cfg.minimumJobCharge;
    const safeFrequency = state.frequency === 'overnight' ? 'weekly' : state.frequency;
    const frequencySurcharge = calcFrequencySurcharge(basePrice, safeFrequency);

    // Specific Areas Add-On stacks +$50 per focus level (1-6) on top of base service
    const specificAddonHours = isSpecificAreas
      ? Math.min(
          cfg.specificAreas.maxHours,
          Math.max(cfg.specificAreas.minHours, state.specificHours)
        )
      : 0;
    const specificAddonPrice = specificAddonHours * cfg.specificAreas.extraHourRate;

    // Add-ons total (Starting from rates, rounded cleanly to cents)
    const addonsTotal = roundMoney(
      state.addons.fridge * cfg.addons.fridge +
      state.addons.fridgeDouble * cfg.addons.fridgeDouble +
      state.addons.oven * cfg.addons.oven +
      state.addons.laundry * cfg.addons.laundry +
      state.addons.organizing * cfg.addons.organizing +
      state.addons.dishes * cfg.addons.dishes +
      state.addons.windows * cfg.addons.windows +
      state.addons.powerWashWindows * cfg.addons.powerWashWindows +
      state.addons.pets * cfg.addons.pets +
      specificAddonPrice
    );

    const grandTotal = roundMoney(basePrice + frequencySurcharge + addonsTotal);

    const addonHours =
      (state.addons.fridge +
        state.addons.fridgeDouble +
        state.addons.oven +
        state.addons.laundry +
        state.addons.organizing) * 0.5 +
      state.addons.dishes * 0.25 +
      state.addons.windows * 0.1 +
      state.addons.powerWashWindows * 0.25 +
      state.addons.pets * 0.25 +
      specificAddonHours;
    const totalHours = estimatedHours + addonHours;
    const totalEstimatedHours = Number(totalHours.toFixed(2));
    const durationMinutes = Math.max(60, Math.round(totalEstimatedHours * 60));

    const minHrs = Math.max(1.5, Math.round((totalHours - 0.5) * 2) / 2);
    const maxHrs = Math.round((totalHours + 0.5) * 2) / 2;
    const timeRangeText = `${minHrs} – ${maxHrs} hrs`;

    let crewSize = '1 – 2 Pros';
    if (totalHours >= 4.5) crewSize = '2 – 3 Pros';
    if (totalHours >= 7.0) crewSize = '3 – 4 Pros';

    return {
      isCommercial: false,
      isSpecificAreas,
      specificAddonHours,
      specificAddonPrice,
      hourlyRate,
      estimatedHours,
      addonHours,
      totalEstimatedHours,
      durationMinutes,
      basePrice,
      frequencySurcharge,
      minApplied,
      discountRate: 0,
      discountAmount: 0,
      addonsTotal,
      grandTotal,
      onlinePaymentsEnabled: false,
      timeRangeText,
      crewText: crewSize
    };
  }

  /**
   * Synchronize Wizard Step UI, Progress Bar, and Step-Specific Panels
   */
  function updateWizardUI() {
    const sequence = getActiveStepSequence();
    const totalSteps = sequence.length;
    if (!sequence.includes(state.wizardStep)) {
      state.wizardStep = sequence[0];
    }
    const stepIndex = sequence.indexOf(state.wizardStep);
    const displayStepNum = stepIndex + 1;

    const stepTitles = {
      1: 'Type of Service',
      2:
        state.serviceCategory === 'moveinout'
          ? 'Move-In / Out'
          : state.serviceCategory === 'airbnb'
            ? 'Airbnb Property'
            : 'Property',
      3: 'Home Info',
      4: 'Frequency',
      5: 'Custom Add-Ons'
    };

    const nextButtonTitles = {
      1: 'Service',
      2: 'Property',
      3: 'Home Info',
      4: 'Frequency',
      5: 'Add-Ons'
    };

    const title = stepTitles[state.wizardStep] || 'Property Details';

    if (els.calcStepCurrent) els.calcStepCurrent.textContent = String(displayStepNum);
    if (els.calcStepTotal) els.calcStepTotal.textContent = String(totalSteps);
    if (els.calcStepActiveName) els.calcStepActiveName.textContent = title;

    if (els.calcWizardProgressBar) {
      els.calcWizardProgressBar.setAttribute('aria-valuemax', String(totalSteps));
      els.calcWizardProgressBar.setAttribute('aria-valuenow', String(displayStepNum));
    }

    if (els.calcWizardProgressFill) {
      els.calcWizardProgressFill.classList.remove(
        'step-fill-1',
        'step-fill-2',
        'step-fill-3',
        'step-fill-4',
        'step-fill-5'
      );
      if (totalSteps === 2) {
        els.calcWizardProgressFill.classList.add(displayStepNum === 1 ? 'step-fill-2' : 'step-fill-5');
      } else {
        els.calcWizardProgressFill.classList.add(`step-fill-${displayStepNum}`);
      }
    }

    if (els.wizardFooterStatus) {
      els.wizardFooterStatus.textContent = `Step ${displayStepNum} of ${totalSteps} · ${title}`;
    }

    const tabsContainer = document.getElementById('calc-wizard-step-tabs');
    if (tabsContainer) {
      tabsContainer.classList.toggle('is-two-step', totalSteps === 2);
    }

    // Show/hide tabs based on Commercial (2 steps) vs 5-step flow
    els.wizardStepTabs.forEach((tab) => {
      const tabStep = parseInt(tab.getAttribute('data-step-target'), 10);
      const posInSeq = sequence.indexOf(tabStep);
      if (posInSeq === -1) {
        tab.classList.add('is-hidden');
        tab.classList.remove('is-active', 'is-completed');
        tab.setAttribute('aria-selected', 'false');
      } else {
        tab.classList.remove('is-hidden');
        const isCurrent = tabStep === state.wizardStep;
        const isCompleted = posInSeq < stepIndex;
        tab.classList.toggle('is-active', isCurrent);
        tab.classList.toggle('is-completed', isCompleted);
        tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      }
    });

    if (els.wizardTabNum4) {
      els.wizardTabNum4.textContent = state.serviceCategory === 'commercial' ? '2' : '4';
    }
    if (els.step4Badge) {
      els.step4Badge.textContent = state.serviceCategory === 'commercial' ? '2' : '4';
    }
    if (els.step4HeadingTitle) {
      els.step4HeadingTitle.textContent =
        state.serviceCategory === 'commercial'
          ? 'Commercial Frequency'
          : 'Cleaning Frequency';
    }
    if (els.step4HeadingDesc) {
      els.step4HeadingDesc.textContent =
        state.serviceCategory === 'commercial'
          ? 'Choose how often your facility needs service.'
          : 'Choose how often you\'d like service.';
    }
    const isCommercialCategory = state.serviceCategory === 'commercial';
    if (els.freqCardOvernight) {
      els.freqCardOvernight.classList.toggle('is-hidden', !isCommercialCategory);
    }
    if (els.step4FrequencyGrid) {
      els.step4FrequencyGrid.classList.toggle('has-overnight', isCommercialCategory);
    }
    if (els.step4OvernightNotice) {
      const showOvernightNotice = isCommercialCategory && state.frequency === 'overnight';
      els.step4OvernightNotice.classList.toggle('is-hidden', !showOvernightNotice);
    }
    if (els.freqTurnoverTitle && els.freqTurnoverSub) {
      if (isCommercialCategory) {
        els.freqTurnoverTitle.textContent = 'Custom / Daily';
        els.freqTurnoverSub.textContent = 'Multi-Day Care';
      } else {
        els.freqTurnoverTitle.textContent = 'Per Turnover';
        els.freqTurnoverSub.textContent = 'Airbnb / Host';
      }
    }

    // Configure Step 2 sub-sections based on serviceCategory
    if (state.serviceCategory === 'moveinout') {
      if (els.step2ResidentialControls) els.step2ResidentialControls.classList.add('is-hidden');
      if (els.step2MoveinoutPropertyType) els.step2MoveinoutPropertyType.classList.remove('is-hidden');
      if (els.step2HeadingTitle) {
        els.step2HeadingTitle.textContent = 'Move-In / Out Property';
      }
      if (els.step2HeadingDesc) {
        els.step2HeadingDesc.textContent = 'Pick your property type and home size.';
      }
    } else if (state.serviceCategory === 'airbnb') {
      if (els.step2ResidentialControls) els.step2ResidentialControls.classList.add('is-hidden');
      if (els.step2MoveinoutPropertyType) els.step2MoveinoutPropertyType.classList.add('is-hidden');
      if (els.step2HeadingTitle) {
        els.step2HeadingTitle.textContent = 'Airbnb / STR Property';
      }
      if (els.step2HeadingDesc) {
        els.step2HeadingDesc.textContent = 'Set your rental bedrooms, baths, and square footage.';
      }
    } else {
      if (els.step2ResidentialControls) els.step2ResidentialControls.classList.remove('is-hidden');
      if (els.step2MoveinoutPropertyType) els.step2MoveinoutPropertyType.classList.add('is-hidden');
      if (els.step2HeadingTitle) {
        els.step2HeadingTitle.textContent = 'Property Details';
      }
      if (els.step2HeadingDesc) {
        els.step2HeadingDesc.textContent = 'Choose your clean level and home size.';
      }
    }

    // Specific Areas Add-On in Step 5 applies to all non-commercial services (Residential, Move-In/Out, Airbnb)
    if (els.step5SpecificAreasBlock) {
      els.step5SpecificAreasBlock.classList.toggle(
        'is-hidden',
        state.serviceCategory === 'commercial'
      );
    }

    // Update Step Panes
    els.wizardStepPanes.forEach((pane) => {
      const paneStep = parseInt(pane.getAttribute('data-wizard-step'), 10);
      pane.classList.toggle('is-active-step', paneStep === state.wizardStep);
    });

    // Prev / Next buttons
    const isFirstStep = stepIndex === 0;
    const isLastStep = stepIndex === totalSteps - 1;
    if (els.btnWizardPrev) els.btnWizardPrev.disabled = isFirstStep;
    if (els.btnWizardPrevTop) els.btnWizardPrevTop.disabled = isFirstStep;

    if (els.wizardNextLabel) {
      if (isLastStep) {
        els.wizardNextLabel.textContent =
          state.serviceCategory === 'commercial'
            ? 'Review Walkthrough'
            : 'Review Estimate';
      } else {
        const nextStepId = sequence[stepIndex + 1];
        const nextLabel = nextButtonTitles[nextStepId] || 'Next';
        els.wizardNextLabel.textContent = `Next: ${nextLabel}`;
      }
    }

    if (state.wizardStep === 5) {
      state.step5Visited = true;
    }

    if (
      window.SmartsProCurrentQuote &&
      window.SmartsProCurrentQuote.state
    ) {
      window.SmartsProCurrentQuote.state.wizardStep = state.wizardStep;
    }
  }

  function handlePrevStep() {
    const sequence = getActiveStepSequence();
    const pos = sequence.indexOf(state.wizardStep);
    if (pos > 0) {
      clearValidationErrors();
      state.wizardStep = sequence[pos - 1];
      updateWizardUI();
    }
  }

  function handleNextStep() {
    const sequence = getActiveStepSequence();
    const pos = sequence.indexOf(state.wizardStep);
    if (!validateStepFulfillment(state.wizardStep)) {
      return;
    }
    if (pos < sequence.length - 1) {
      state.wizardStep = sequence[pos + 1];
      updateWizardUI();
    } else if (
      window.SmartsProModal &&
      typeof window.SmartsProModal.openBookingModal === 'function'
    ) {
      window.SmartsProModal.openBookingModal();
    }
  }

  function goToWizardStep(targetStepId) {
    const sequence = getActiveStepSequence();
    if (!sequence.includes(targetStepId)) return;

    const currentPos = sequence.indexOf(state.wizardStep);
    const targetPos = sequence.indexOf(targetStepId);

    if (targetPos > currentPos) {
      for (let i = currentPos; i < targetPos; i++) {
        if (!validateStepFulfillment(sequence[i])) {
          return;
        }
      }
    } else {
      clearValidationErrors();
    }

    state.wizardStep = targetStepId;
    updateWizardUI();
  }

  /**
   * Update DOM UI to reflect current state and calculations
   */
  function updateUI() {
    // Sync flat $35 Pet Hair & Detailing fee directly with Step 3 answer
    state.addons.pets = state.additionalInfo.hasPets === 'yes' ? 1 : 0;

    const calc = calculateQuote();
    const isSpecific = calc.isSpecificAreas;
    const isCommercial = calc.isCommercial;

    updateServiceOverviewUI();

    // 1. Update Residential Tier Buttons & Scope Panels (keep base Standard/Deep tier active even with Specific Areas Add-On)
    els.residentialTierBtns.forEach((btn) => {
      const tier = btn.getAttribute('data-res-tier');
      const isActive = state.step2ResidentialFulfilled && tier === state.serviceType;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Property Type Buttons (House, Apartment, Condo, Townhome)
    els.propertyTypeBtns.forEach((btn) => {
      const pType = btn.getAttribute('data-prop-type');
      const isActive = state.propertyType === pType;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (els.scopePanelFull) {
      els.scopePanelFull.classList.remove('is-hidden');
    }
    if (els.btnScopeSpecific) {
      els.btnScopeSpecific.classList.toggle('active', isSpecific);
      els.btnScopeSpecific.setAttribute('aria-pressed', isSpecific ? 'true' : 'false');
    }
    if (els.specificAreasToggleBadge) {
      els.specificAreasToggleBadge.textContent = isSpecific
        ? 'Added ✓ · Remove'
        : 'Add';
    }
    if (els.scopePanelSpecific) {
      els.scopePanelSpecific.classList.toggle('is-hidden', !isSpecific);
    }

    // Specific Hours UI
    if (els.valSpecificHours) els.valSpecificHours.textContent = state.specificHours;
    if (els.btnHoursMinus) {
      els.btnHoursMinus.disabled = state.specificHours <= PRICING_CONFIG.specificAreas.minHours;
    }
    if (els.btnHoursPlus) {
      els.btnHoursPlus.disabled = state.specificHours >= PRICING_CONFIG.specificAreas.maxHours;
    }
    els.hourTierBtns.forEach((btn) => {
      const h = parseInt(btn.getAttribute('data-hours-val'), 10);
      btn.classList.toggle('active', h === state.specificHours);
    });

    // 2. Update Stepper Values
    if (els.valBedrooms) els.valBedrooms.textContent = state.bedrooms;
    if (els.btnBedMinus) els.btnBedMinus.disabled = state.bedrooms <= 1;
    if (els.btnBedPlus) els.btnBedPlus.disabled = state.bedrooms >= 8;

    if (els.valFullBaths) els.valFullBaths.textContent = state.fullBaths;
    if (els.btnBathMinus) els.btnBathMinus.disabled = state.fullBaths <= 1;
    if (els.btnBathPlus) els.btnBathPlus.disabled = state.fullBaths >= 6;

    if (els.valHalfBaths) els.valHalfBaths.textContent = state.halfBaths;
    if (els.btnHalfBathMinus) els.btnHalfBathMinus.disabled = state.halfBaths <= 0;
    if (els.btnHalfBathPlus) els.btnHalfBathPlus.disabled = state.halfBaths >= 4;

    if (els.valLivingRooms) els.valLivingRooms.textContent = state.extraLivingRooms;
    if (els.btnLivingMinus) els.btnLivingMinus.disabled = state.extraLivingRooms <= 0;
    if (els.btnLivingPlus) els.btnLivingPlus.disabled = state.extraLivingRooms >= 4;

    if (els.sliderSqft && document.activeElement !== els.sliderSqft) {
      els.sliderSqft.value = state.sqft;
    }
    if (els.inputSqft && document.activeElement !== els.inputSqft) {
      els.inputSqft.value = state.sqft;
    }

    // 3. Update Step 3 Additional Information Checkboxes
    els.addinfoOptionBtns.forEach((btn) => {
      const group = btn.getAttribute('data-addinfo-group');
      const val = btn.getAttribute('data-addinfo-val');
      const isChecked = Boolean(group && state.additionalInfo[group] === val);
      btn.classList.toggle('active', isChecked);
      btn.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    });

    // 4. Update Step 4 Frequency Cards & Dynamic Hybrid Surcharge Badges
    els.freqCards.forEach((card) => {
      const cardFreq = card.getAttribute('data-freq');
      const isSelected = state.step4FrequencyFulfilled && cardFreq === state.frequency;
      card.classList.toggle('active', isSelected);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = isSelected;
    });

    if (isCommercial) {
      if (els.freqBadgeWeekly) els.freqBadgeWeekly.textContent = 'Preferred';
      if (els.freqBadgeTurnover) els.freqBadgeTurnover.textContent = 'Multi-Day';
      if (els.freqBadgeBiweekly) els.freqBadgeBiweekly.textContent = 'Every 2 Weeks';
      if (els.freqBadgeMonthly) els.freqBadgeMonthly.textContent = 'Monthly';
      if (els.freqBadgeOnetime) els.freqBadgeOnetime.textContent = 'Single Visit';
      if (els.freqBadgeOvernight) els.freqBadgeOvernight.textContent = 'After-Hours';
      if (els.step4FlatRateText) {
        els.step4FlatRateText.textContent =
          'Commercial Walkthrough Pricing: Choose your preferred facility cleaning schedule above, then pick a walkthrough time. The owner settles your custom quote with you at the walkthrough (50% deposit required in person once finalized).';
      }
    } else {
      const biweeklyExtra = calcFrequencySurcharge(calc.basePrice, 'biweekly');
      const monthlyExtra = calcFrequencySurcharge(calc.basePrice, 'monthly');
      const onetimeExtra = calcFrequencySurcharge(calc.basePrice, 'onetime');
      const overnightExtra = calcFrequencySurcharge(calc.basePrice, 'overnight');

      if (els.freqBadgeWeekly) els.freqBadgeWeekly.textContent = 'Anchor · $0';
      if (els.freqBadgeTurnover) els.freqBadgeTurnover.textContent = '$0 Extra';
      if (els.freqBadgeBiweekly) els.freqBadgeBiweekly.textContent = `+$${biweeklyExtra}`;
      if (els.freqBadgeMonthly) els.freqBadgeMonthly.textContent = `+$${monthlyExtra}`;
      if (els.freqBadgeOnetime) els.freqBadgeOnetime.textContent = `+$${onetimeExtra}`;
      if (els.freqBadgeOvernight) els.freqBadgeOvernight.textContent = 'After-Hours';
      if (els.step4FlatRateText) {
        els.step4FlatRateText.textContent =
          'Weekly-Anchor Pricing: Weekly & Per Turnover keep our base rate ($0 extra). Less frequent visits add a schedule fee (Bi-Weekly +$30+, Monthly +$50+, One-Time +$65+). No online payment today — 50% deposit required in person.';
      }
    }

    // 5. Update Step 5 Add-on Quantities
    if (els.valFridge) els.valFridge.textContent = state.addons.fridge;
    if (els.btnFridgeMinus) els.btnFridgeMinus.disabled = state.addons.fridge <= 0;
    if (els.btnFridgePlus) els.btnFridgePlus.disabled = state.addons.fridge >= 5;
    if (els.cardFridge) els.cardFridge.classList.toggle('has-quantity', state.addons.fridge > 0);

    if (els.valFridgeDouble) els.valFridgeDouble.textContent = state.addons.fridgeDouble;
    if (els.btnFridgeDoubleMinus) {
      els.btnFridgeDoubleMinus.disabled = state.addons.fridgeDouble <= 0;
    }
    if (els.btnFridgeDoublePlus) {
      els.btnFridgeDoublePlus.disabled = state.addons.fridgeDouble >= 5;
    }
    if (els.cardFridgeDouble) {
      els.cardFridgeDouble.classList.toggle('has-quantity', state.addons.fridgeDouble > 0);
    }

    if (els.valOven) els.valOven.textContent = state.addons.oven;
    if (els.btnOvenMinus) els.btnOvenMinus.disabled = state.addons.oven <= 0;
    if (els.btnOvenPlus) els.btnOvenPlus.disabled = state.addons.oven >= 5;
    if (els.cardOven) els.cardOven.classList.toggle('has-quantity', state.addons.oven > 0);

    if (els.valLaundry) els.valLaundry.textContent = state.addons.laundry;
    if (els.btnLaundryMinus) els.btnLaundryMinus.disabled = state.addons.laundry <= 0;
    if (els.btnLaundryPlus) els.btnLaundryPlus.disabled = state.addons.laundry >= 5;
    if (els.cardLaundry) els.cardLaundry.classList.toggle('has-quantity', state.addons.laundry > 0);

    if (els.valOrganizing) els.valOrganizing.textContent = state.addons.organizing;
    if (els.btnOrganizingMinus) els.btnOrganizingMinus.disabled = state.addons.organizing <= 0;
    if (els.btnOrganizingPlus) els.btnOrganizingPlus.disabled = state.addons.organizing >= 5;
    if (els.cardOrganizing) els.cardOrganizing.classList.toggle('has-quantity', state.addons.organizing > 0);

    if (els.valDishes) els.valDishes.textContent = state.addons.dishes;
    if (els.btnDishesMinus) els.btnDishesMinus.disabled = state.addons.dishes <= 0;
    if (els.btnDishesPlus) els.btnDishesPlus.disabled = state.addons.dishes >= 5;
    if (els.cardDishes) els.cardDishes.classList.toggle('has-quantity', state.addons.dishes > 0);

    if (els.valWindows) els.valWindows.textContent = state.addons.windows;
    if (els.btnWindowsMinus) els.btnWindowsMinus.disabled = state.addons.windows <= 0;
    if (els.btnWindowsPlus) els.btnWindowsPlus.disabled = state.addons.windows >= 30;
    if (els.cardWindows) els.cardWindows.classList.toggle('has-quantity', state.addons.windows > 0);

    if (els.valPowerWash) els.valPowerWash.textContent = state.addons.powerWashWindows;
    if (els.btnPowerWashMinus) els.btnPowerWashMinus.disabled = state.addons.powerWashWindows <= 0;
    if (els.btnPowerWashPlus) els.btnPowerWashPlus.disabled = state.addons.powerWashWindows >= 30;
    if (els.cardPowerWash) els.cardPowerWash.classList.toggle('has-quantity', state.addons.powerWashWindows > 0);

    if (els.inputServiceDetails && document.activeElement !== els.inputServiceDetails) {
      els.inputServiceDetails.value = state.serviceDetails;
    }

    // 6. Update Summary Card Outputs
    if (els.quoteSummaryCard) {
      els.quoteSummaryCard.classList.toggle('is-commercial-quote', isCommercial);
    }
    if (els.quoteHeaderTitle) {
      els.quoteHeaderTitle.textContent = isCommercial ? 'Your Walkthrough' : 'Your Estimate';
    }
    if (els.quoteLivePill) {
      els.quoteLivePill.textContent = isCommercial ? 'On-Site Quote' : 'Live Quote';
    }
    if (els.quotePolicyCallout) {
      els.quotePolicyCallout.textContent = isCommercial
        ? 'Deposit & Policy: Owner settles your custom quote at the walkthrough. 50% deposit required in person once finalized (no online payment today); returned checks incur a 10% fee.'
        : 'Deposit & Policy: 50% deposit required in person at service (no online payment today). Weekly & Turnover keep our base rate; returned checks incur a 10% fee.';
    }
    if (els.quotePriceLabel) {
      els.quotePriceLabel.textContent = isCommercial ? 'Walkthrough Pricing' : 'Estimated Total';
    }
    if (els.quotePriceCurrency) {
      els.quotePriceCurrency.classList.toggle('is-hidden', isCommercial);
    }
    if (els.quoteTotalAmount) {
      els.quoteTotalAmount.textContent = isCommercial
        ? 'Custom Quote at Walkthrough'
        : calc.grandTotal.toFixed(2);
      const priceParent = els.quoteTotalAmount.closest('.quote-price-amount');
      if (priceParent) {
        priceParent.classList.toggle('is-custom-walkthrough-quote', isCommercial);
        priceParent.classList.remove('price-pulse');
        void priceParent.offsetWidth;
        priceParent.classList.add('price-pulse');
      }
    }

    const surchargeText =
      calc.frequencySurcharge > 0 ? `+$${calc.frequencySurcharge.toFixed(2)}` : '+$0.00';
    const freqLabels = {
      weekly: 'Weekly · Base Rate ($0 extra)',
      biweekly: `Bi-Weekly (+$${calc.frequencySurcharge} schedule fee)`,
      turnover: isCommercial
        ? 'Custom / Daily'
        : 'Per Turnover · Base Rate ($0 extra)',
      monthly: `Monthly (+$${calc.frequencySurcharge} schedule fee)`,
      onetime: `One-Time (+$${calc.frequencySurcharge} schedule fee)`,
      overnight: 'Overnight (Tentative)'
    };
    const freqShortNames = {
      weekly: 'Weekly',
      biweekly: 'Every 2 Wks',
      turnover: isCommercial ? 'Custom / Daily' : 'Per Turnover',
      monthly: 'Monthly',
      onetime: 'One Time',
      overnight: 'Overnight (Tentative)'
    };
    if (els.quoteBillingFreq) {
      els.quoteBillingFreq.textContent = isCommercial
        ? `Preferred Schedule: ${freqShortNames[state.frequency] || 'Weekly'}`
        : freqLabels[state.frequency] || 'Weekly · Base Rate ($0 extra)';
    }

    if (els.summaryFrequencyVal) {
      els.summaryFrequencyVal.textContent = isCommercial
        ? `${freqShortNames[state.frequency] || 'Weekly'}`
        : `${freqShortNames[state.frequency] || 'Weekly'} (${surchargeText})`;
    }

    if (els.quoteMinimumNoteText) {
      if (isCommercial) {
        els.quoteMinimumNoteText.textContent =
          state.frequency === 'overnight'
            ? 'Tentative Slot · Owner Quotes On-Site'
            : 'Owner Quotes On-Site · 50% Deposit In Person';
      } else {
        els.quoteMinimumNoteText.textContent = 'No Online Payment · 50% Deposit In Person';
      }
    }

    const serviceNames = {
      standard: 'Standard Clean',
      deep: 'Deep Clean',
      moveinout: 'Move-In / Out Clean',
      airbnb: 'Airbnb Turnover'
    };
    if (els.summaryServiceType) {
      if (isCommercial) {
        els.summaryServiceType.textContent = 'Commercial Walkthrough';
      } else {
        els.summaryServiceType.textContent =
          serviceNames[state.serviceType] || 'Standard Clean';
      }
    }
    if (els.summaryServiceRate) {
      els.summaryServiceRate.textContent = isCommercial
        ? 'Custom Quote at Walkthrough'
        : `$${calc.basePrice.toFixed(2)}`;
      const serviceRow = els.summaryServiceRate.closest('.breakdown-row');
      if (serviceRow) {
        serviceRow.classList.add('breakdown-row-service');
      }
    }

    // Property Type Row (for Move-In/Out when selected)
    if (els.summaryPropertyTypeRow && els.summaryPropertyTypeVal) {
      if (state.serviceCategory === 'moveinout') {
        els.summaryPropertyTypeRow.classList.remove('is-hidden');
        els.summaryPropertyTypeVal.textContent = state.propertyType || 'Select in Step 2';
      } else {
        els.summaryPropertyTypeRow.classList.add('is-hidden');
      }
    }

    if (els.summaryScopeTitle && els.summaryBaseRate) {
      if (isCommercial) {
        els.summaryScopeTitle.textContent = 'Facility Scope';
        els.summaryBaseRate.textContent = 'Confirmed at walkthrough';
      } else {
        els.summaryScopeTitle.textContent = 'Property Size';
        const bathText =
          state.halfBaths > 0
            ? `${state.fullBaths} Full, ${state.halfBaths} Half`
            : `${state.fullBaths} Full Bath`;
        const livingText =
          state.extraLivingRooms > 0
            ? `, ${state.extraLivingRooms} Extra Living`
            : '';
        els.summaryBaseRate.textContent = `${state.bedrooms} Bed, ${bathText}${livingText} • ${state.sqft.toLocaleString()} sq ft`;
      }
    }

    if (els.summarySpecificAreasRow && els.summarySpecificAreasVal) {
      if (isSpecific) {
        els.summarySpecificAreasRow.classList.remove('is-hidden');
        const cleanedText = state.specificAreasText.trim();
        els.summarySpecificAreasVal.textContent =
          cleanedText.length > 0
            ? `Level ${calc.specificAddonHours} (+$${calc.specificAddonPrice}): ${cleanedText}`
            : `Level ${calc.specificAddonHours} (+$${calc.specificAddonPrice}) — Describe in Step 5`;
      } else {
        els.summarySpecificAreasRow.classList.add('is-hidden');
      }
    }

    if (els.summaryAddinfoRow && els.summaryAddinfoVal) {
      const info = state.additionalInfo;
      const hasAnyAddinfo = Boolean(
        info.hasPets || info.lastCleaned || info.occupancy || info.condition
      );
      if (!isCommercial && hasAnyAddinfo) {
        els.summaryAddinfoRow.classList.remove('is-hidden');
        const parts = [];
        if (info.hasPets) parts.push(info.hasPets === 'yes' ? 'Pets: Yes' : 'No Pets');
        if (info.condition) parts.push(info.condition);
        else if (info.occupancy) parts.push(info.occupancy);
        els.summaryAddinfoVal.textContent = parts.join(' • ') || 'Saved';
      } else {
        els.summaryAddinfoRow.classList.add('is-hidden');
      }
    }

    if (els.summaryAddonsRow) {
      if (calc.addonsTotal > 0) {
        els.summaryAddonsRow.classList.remove('addons-hidden', 'is-hidden');
        if (els.summaryAddonsVal) {
          els.summaryAddonsVal.textContent = `+$${calc.addonsTotal.toFixed(2)}`;
        }
      } else {
        els.summaryAddonsRow.classList.add('addons-hidden');
      }
    }

    if (els.summaryDispatchVal) {
      els.summaryDispatchVal.textContent = isCommercial
        ? 'Walkthrough Slot + Email'
        : 'Calendar Slot + Email';
    }

    if (els.summaryOnlinePaymentVal) {
      els.summaryOnlinePaymentVal.textContent = '50% In Person';
    }

    if (els.btnBookQuoteLabel) {
      els.btnBookQuoteLabel.textContent = isCommercial
        ? 'Pick Walkthrough & Send Bid'
        : 'Pick Time & Send Estimate';
    }

    updateWizardUI();

    const quoteSnapshot = {
      state: JSON.parse(JSON.stringify(state)),
      calculation: calc
    };

    if (
      window.SmartsProDispatchFramework &&
      typeof window.SmartsProDispatchFramework.buildJobEnvelope === 'function'
    ) {
      quoteSnapshot.dispatchEnvelope =
        window.SmartsProDispatchFramework.buildJobEnvelope(quoteSnapshot);
    }

    window.SmartsProCurrentQuote = quoteSnapshot;
  }

  /**
   * Select a Step 1 Service Category ('residential' | 'commercial' | 'moveinout' | 'airbnb')
   */
  function selectServiceCategory(category) {
    if (!['residential', 'commercial', 'moveinout', 'airbnb'].includes(category)) return;
    state.serviceCategory = category;
    state.step1Fulfilled = true;
    state.step2AirbnbConfirmed = false;
    state.step5Visited = false;
    clearValidationErrors();

    if (category !== 'commercial' && state.frequency === 'overnight') {
      state.frequency = 'weekly';
      state.step4FrequencyFulfilled = false;
    }

    if (category === 'residential') {
      if (state.serviceType === 'moveinout' || state.serviceType === 'airbnb') {
        state.serviceType = 'standard';
      }
    } else if (category === 'moveinout') {
      state.serviceType = 'moveinout';
    } else if (category === 'airbnb') {
      state.serviceType = 'airbnb';
      state.frequency = 'turnover';
    } else if (category === 'commercial') {
      state.scopeMode = 'full';
    }

    updateUI();
  }

  /**
   * Bind Event Listeners
   */
  function initCalculatorEvents() {
    // Wizard Step Tabs
    els.wizardStepTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = parseInt(tab.getAttribute('data-step-target'), 10);
        if (!isNaN(target)) goToWizardStep(target);
      });
    });

    if (els.btnWizardPrev) els.btnWizardPrev.addEventListener('click', handlePrevStep);
    if (els.btnWizardPrevTop) els.btnWizardPrevTop.addEventListener('click', handlePrevStep);
    if (els.btnWizardNext) els.btnWizardNext.addEventListener('click', handleNextStep);
    if (els.btnWizardNextTop) els.btnWizardNextTop.addEventListener('click', handleNextStep);

    // Step 1: Service Category Cards
    els.serviceCategoryCards.forEach((card) => {
      card.addEventListener('click', () => {
        const cat = card.getAttribute('data-service-cat');
        if (cat) selectServiceCategory(cat);
      });
    });

    // Step 2: Residential Tier Buttons (Standard Clean, Deep Clean — preserves Specific Areas Add-On)
    els.residentialTierBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-res-tier');
        state.step2ResidentialFulfilled = true;
        clearValidationErrors();
        state.serviceType = tier === 'deep' ? 'deep' : 'standard';
        updateUI();
      });
    });

    // Step 5: Specific Areas Add-On Toggle Button (stacks +$50/hr on top of base service)
    if (els.btnScopeSpecific) {
      els.btnScopeSpecific.addEventListener('click', () => {
        if (state.serviceCategory === 'commercial') return;
        state.scopeMode = state.scopeMode === 'specific' ? 'full' : 'specific';
        clearValidationErrors();
        updateUI();
      });
    }

    // Step 2: Move-In/Out Property Type Buttons (House, Apartment, Condo, Townhome)
    els.propertyTypeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pType = btn.getAttribute('data-prop-type');
        if (pType) {
          state.propertyType = pType;
          clearValidationErrors();
          updateUI();
        }
      });
    });

    // Specific Areas Text Input
    if (els.inputSpecificAreas) {
      els.inputSpecificAreas.addEventListener('input', (e) => {
        state.specificAreasText = String(e.target.value || '').slice(0, 180);
        if (state.specificAreasText.trim().length > 0) {
          state.step2ResidentialFulfilled = true;
          clearValidationErrors();
        }
        updateUI();
      });
    }

    // Specific Areas Hours Stepper & Pills
    if (els.btnHoursMinus) {
      els.btnHoursMinus.addEventListener('click', () => {
        if (state.specificHours > PRICING_CONFIG.specificAreas.minHours) {
          state.specificHours--;
          state.scopeMode = 'specific';
          state.step2ResidentialFulfilled = true;
          updateUI();
        }
      });
    }
    if (els.btnHoursPlus) {
      els.btnHoursPlus.addEventListener('click', () => {
        if (state.specificHours < PRICING_CONFIG.specificAreas.maxHours) {
          state.specificHours++;
          state.scopeMode = 'specific';
          state.step2ResidentialFulfilled = true;
          updateUI();
        }
      });
    }
    els.hourTierBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const hrs = parseInt(btn.getAttribute('data-hours-val'), 10);
        if (!isNaN(hrs)) {
          state.specificHours = Math.min(
            PRICING_CONFIG.specificAreas.maxHours,
            Math.max(PRICING_CONFIG.specificAreas.minHours, hrs)
          );
          state.scopeMode = 'specific';
          state.step2ResidentialFulfilled = true;
          updateUI();
        }
      });
    });

    // Bedrooms
    if (els.btnBedMinus) {
      els.btnBedMinus.addEventListener('click', () => {
        if (state.bedrooms > 1) {
          state.bedrooms--;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }
    if (els.btnBedPlus) {
      els.btnBedPlus.addEventListener('click', () => {
        if (state.bedrooms < 8) {
          state.bedrooms++;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }

    // Full Baths
    if (els.btnBathMinus) {
      els.btnBathMinus.addEventListener('click', () => {
        if (state.fullBaths > 1) {
          state.fullBaths--;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }
    if (els.btnBathPlus) {
      els.btnBathPlus.addEventListener('click', () => {
        if (state.fullBaths < 6) {
          state.fullBaths++;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }

    // Half Baths
    if (els.btnHalfBathMinus) {
      els.btnHalfBathMinus.addEventListener('click', () => {
        if (state.halfBaths > 0) {
          state.halfBaths--;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }
    if (els.btnHalfBathPlus) {
      els.btnHalfBathPlus.addEventListener('click', () => {
        if (state.halfBaths < 4) {
          state.halfBaths++;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }

    // Extra Living Rooms
    if (els.btnLivingMinus) {
      els.btnLivingMinus.addEventListener('click', () => {
        if (state.extraLivingRooms > 0) {
          state.extraLivingRooms--;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }
    if (els.btnLivingPlus) {
      els.btnLivingPlus.addEventListener('click', () => {
        if (state.extraLivingRooms < 4) {
          state.extraLivingRooms++;
          state.step2ResidentialFulfilled = true;
          state.step2AirbnbConfirmed = true;
          clearValidationErrors();
          updateUI();
        }
      });
    }

    // Sqft Slider
    if (els.sliderSqft) {
      els.sliderSqft.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) || 1800;
        state.sqft = Math.min(6000, Math.max(400, val));
        state.step2ResidentialFulfilled = true;
        state.step2AirbnbConfirmed = true;
        clearValidationErrors();
        if (els.inputSqft) els.inputSqft.value = state.sqft;
        updateUI();
      });
    }

    // Sqft Number Input
    if (els.inputSqft) {
      els.inputSqft.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = 400;
        state.sqft = Math.min(6000, Math.max(400, val));
        state.step2ResidentialFulfilled = true;
        state.step2AirbnbConfirmed = true;
        clearValidationErrors();
        if (els.sliderSqft) els.sliderSqft.value = state.sqft;
        updateUI();
      });

      els.inputSqft.addEventListener('blur', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 400) val = 400;
        if (val > 6000) val = 6000;
        state.sqft = val;
        e.target.value = val;
        if (els.sliderSqft) els.sliderSqft.value = val;
        updateUI();
      });
    }

    // Step 3: Additional Information Checkbox Options
    els.addinfoOptionBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = btn.getAttribute('data-addinfo-group');
        const val = btn.getAttribute('data-addinfo-val');
        if (!group || !val) return;

        state.additionalInfo[group] = val;

        // Sync Pets answer with flat $35 Pet Hair & Detailing fee
        if (group === 'hasPets') {
          state.addons.pets = val === 'yes' ? 1 : 0;
        }

        const block = btn.closest('.addinfo-question-block');
        if (block) {
          block.classList.remove('wizard-field-missing');
        }
        if (
          state.additionalInfo.hasPets &&
          state.additionalInfo.lastCleaned &&
          state.additionalInfo.occupancy &&
          state.additionalInfo.condition
        ) {
          clearValidationErrors();
        }
        updateUI();
      });
    });

    // Step 4: Frequency Cards
    els.freqCards.forEach((card) => {
      card.addEventListener('click', () => {
        const selectedFreq = card.getAttribute('data-freq');
        if (!selectedFreq) return;
        if (selectedFreq === 'overnight' && state.serviceCategory !== 'commercial') {
          return;
        }
        state.frequency = selectedFreq;
        state.step4FrequencyFulfilled = true;
        clearValidationErrors();
        updateUI();
      });
    });

    // Step 5: Add-on Steppers
    if (els.btnFridgeMinus) {
      els.btnFridgeMinus.addEventListener('click', () => {
        if (state.addons.fridge > 0) {
          state.addons.fridge--;
          updateUI();
        }
      });
    }
    if (els.btnFridgePlus) {
      els.btnFridgePlus.addEventListener('click', () => {
        if (state.addons.fridge < 5) {
          state.addons.fridge++;
          updateUI();
        }
      });
    }

    if (els.btnFridgeDoubleMinus) {
      els.btnFridgeDoubleMinus.addEventListener('click', () => {
        if (state.addons.fridgeDouble > 0) {
          state.addons.fridgeDouble--;
          updateUI();
        }
      });
    }
    if (els.btnFridgeDoublePlus) {
      els.btnFridgeDoublePlus.addEventListener('click', () => {
        if (state.addons.fridgeDouble < 5) {
          state.addons.fridgeDouble++;
          updateUI();
        }
      });
    }

    if (els.btnOvenMinus) {
      els.btnOvenMinus.addEventListener('click', () => {
        if (state.addons.oven > 0) {
          state.addons.oven--;
          updateUI();
        }
      });
    }
    if (els.btnOvenPlus) {
      els.btnOvenPlus.addEventListener('click', () => {
        if (state.addons.oven < 5) {
          state.addons.oven++;
          updateUI();
        }
      });
    }

    const bindStepper = (minusBtn, plusBtn, key, maxVal) => {
      if (minusBtn) {
        minusBtn.addEventListener('click', () => {
          if (state.addons[key] > 0) {
            state.addons[key]--;
            updateUI();
          }
        });
      }
      if (plusBtn) {
        plusBtn.addEventListener('click', () => {
          if (state.addons[key] < maxVal) {
            state.addons[key]++;
            updateUI();
          }
        });
      }
    };

    bindStepper(els.btnLaundryMinus, els.btnLaundryPlus, 'laundry', 5);
    bindStepper(els.btnOrganizingMinus, els.btnOrganizingPlus, 'organizing', 5);
    bindStepper(els.btnDishesMinus, els.btnDishesPlus, 'dishes', 5);
    bindStepper(els.btnWindowsMinus, els.btnWindowsPlus, 'windows', 30);
    bindStepper(els.btnPowerWashMinus, els.btnPowerWashPlus, 'powerWashWindows', 30);

    if (els.inputServiceDetails) {
      els.inputServiceDetails.addEventListener('input', (e) => {
        state.serviceDetails = String(e.target.value || '').slice(0, 500);
        updateUI();
      });
    }

    // Print Quote
    if (els.btnPrintQuote) {
      els.btnPrintQuote.addEventListener('click', () => {
        window.print();
      });
    }

    // Reset Calculator
    if (els.btnResetCalc) {
      els.btnResetCalc.addEventListener('click', () => {
        state.wizardStep = 1;
        state.serviceCategory = 'residential';
        state.step1Fulfilled = false;
        state.step2ResidentialFulfilled = false;
        state.step2AirbnbConfirmed = false;
        state.step4FrequencyFulfilled = false;
        state.step5Visited = false;
        state.propertyType = '';
        state.scopeMode = 'full';
        state.specificAreasText = '';
        state.serviceDetails = '';
        state.specificHours = 1;
        state.bedrooms = 3;
        state.fullBaths = 2;
        state.halfBaths = 1;
        state.extraLivingRooms = 0;
        state.sqft = 1800;
        state.serviceType = 'standard';
        state.additionalInfo = {
          hasPets: '',
          lastCleaned: '',
          occupancy: '',
          condition: ''
        };
        state.frequency = 'weekly';
        state.addons = {
          fridge: 0,
          fridgeDouble: 0,
          oven: 0,
          laundry: 0,
          organizing: 0,
          dishes: 0,
          windows: 0,
          powerWashWindows: 0,
          pets: 0
        };
        if (els.inputSpecificAreas) els.inputSpecificAreas.value = '';
        if (els.inputServiceDetails) els.inputServiceDetails.value = '';
        clearValidationErrors();
        updateUI();
      });
    }
  }

  /**
   * Public helper to allow Service Showcase Cards to pre-select a calculator service
   */
  window.selectCalculatorService = function (serviceKey) {
    if (serviceKey === 'specific') {
      selectServiceCategory('residential');
      state.scopeMode = 'specific';
      state.step2ResidentialFulfilled = true;
      state.wizardStep = 5;
      updateUI();
    } else if (serviceKey === 'commercial') {
      selectServiceCategory('commercial');
      state.wizardStep = 4;
      updateUI();
    } else if (serviceKey === 'moveinout') {
      selectServiceCategory('moveinout');
      state.wizardStep = 2;
      updateUI();
    } else if (serviceKey === 'airbnb') {
      selectServiceCategory('airbnb');
      state.wizardStep = 2;
      updateUI();
    } else if (serviceKey === 'deep' || serviceKey === 'standard') {
      selectServiceCategory('residential');
      state.scopeMode = 'full';
      state.serviceType = serviceKey;
      state.step2ResidentialFulfilled = true;
      state.wizardStep = 2;
      updateUI();
    }
    const calcSection = document.getElementById('calculator');
    if (calcSection) {
      calcSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  /**
   * Public helper to allow the Booking Modal's "Edit Request" panel to adjust
   * hours, service scope, additional home info, or appliance add-ons and
   * immediately recalculate the live flat-rate estimate.
   */
  function applyQuoteAdjustments(patch) {
    if (!patch || typeof patch !== 'object') {
      return window.SmartsProCurrentQuote;
    }

    if (patch.scopeMode === 'full' || patch.scopeMode === 'specific') {
      state.scopeMode = patch.scopeMode;
      state.step2ResidentialFulfilled = true;
    }

    if (
      patch.serviceType === 'standard' ||
      patch.serviceType === 'deep' ||
      patch.serviceType === 'moveinout' ||
      patch.serviceType === 'airbnb'
    ) {
      state.serviceType = patch.serviceType;
      state.step2ResidentialFulfilled = true;
    }

    if (patch.specificHours !== undefined) {
      const h = parseInt(patch.specificHours, 10);
      if (!Number.isNaN(h)) {
        state.specificHours = Math.min(
          PRICING_CONFIG.specificAreas.maxHours,
          Math.max(PRICING_CONFIG.specificAreas.minHours, h)
        );
        state.step2ResidentialFulfilled = true;
      }
    }

    if (typeof patch.specificAreasText === 'string') {
      state.specificAreasText = patch.specificAreasText.slice(0, 180);
      if (els.inputSpecificAreas) {
        els.inputSpecificAreas.value = state.specificAreasText;
      }
    }

    if (patch.bedrooms !== undefined) {
      const b = parseInt(patch.bedrooms, 10);
      if (!Number.isNaN(b)) {
        state.bedrooms = Math.min(8, Math.max(1, b));
        state.step2ResidentialFulfilled = true;
      }
    }

    if (patch.fullBaths !== undefined) {
      const fb = parseInt(patch.fullBaths, 10);
      if (!Number.isNaN(fb)) {
        state.fullBaths = Math.min(6, Math.max(1, fb));
        state.step2ResidentialFulfilled = true;
      }
    }

    if (typeof patch.serviceDetails === 'string') {
      state.serviceDetails = patch.serviceDetails.slice(0, 500);
      if (els.inputServiceDetails) {
        els.inputServiceDetails.value = state.serviceDetails;
      }
    }

    if (patch.extraLivingRooms !== undefined) {
      const lv = parseInt(patch.extraLivingRooms, 10);
      if (!Number.isNaN(lv)) {
        state.extraLivingRooms = Math.min(4, Math.max(0, lv));
        state.step2ResidentialFulfilled = true;
      }
    }

    if (patch.halfBaths !== undefined) {
      const hb = parseInt(patch.halfBaths, 10);
      if (!Number.isNaN(hb)) {
        state.halfBaths = Math.min(4, Math.max(0, hb));
        state.step2ResidentialFulfilled = true;
      }
    }

    if (patch.sqft !== undefined) {
      const sq = parseInt(patch.sqft, 10);
      if (!Number.isNaN(sq)) {
        state.sqft = Math.min(6000, Math.max(400, sq));
        state.step2ResidentialFulfilled = true;
        if (els.sliderSqft) els.sliderSqft.value = state.sqft;
        if (els.inputSqft) els.inputSqft.value = state.sqft;
      }
    }

    if (patch.additionalInfo && typeof patch.additionalInfo === 'object') {
      const infoPatch = patch.additionalInfo;
      if (infoPatch.hasPets === 'yes' || infoPatch.hasPets === 'no') {
        state.additionalInfo.hasPets = infoPatch.hasPets;
        state.addons.pets = infoPatch.hasPets === 'yes' ? 1 : 0;
      }
      if (typeof infoPatch.lastCleaned === 'string' && infoPatch.lastCleaned) {
        state.additionalInfo.lastCleaned = infoPatch.lastCleaned;
      }
      if (typeof infoPatch.occupancy === 'string' && infoPatch.occupancy) {
        state.additionalInfo.occupancy = infoPatch.occupancy;
      }
      if (typeof infoPatch.condition === 'string' && infoPatch.condition) {
        state.additionalInfo.condition = infoPatch.condition;
      }
    }

    if (patch.addons && typeof patch.addons === 'object') {
      const addonLimits = {
        fridge: 5,
        fridgeDouble: 5,
        oven: 5,
        laundry: 5,
        organizing: 5,
        dishes: 5,
        windows: 30,
        powerWashWindows: 30
      };
      Object.entries(addonLimits).forEach(([addonKey, maxQty]) => {
        if (patch.addons[addonKey] !== undefined) {
          const qty = parseInt(patch.addons[addonKey], 10);
          if (!Number.isNaN(qty)) {
            state.addons[addonKey] = Math.min(maxQty, Math.max(0, qty));
          }
        }
      });
    }

    updateUI();
    return window.SmartsProCurrentQuote;
  }

  function scrollWizardIntoView() {
    const shell = document.getElementById('calc-wizard-shell') || document.getElementById('calculator');
    if (shell && typeof shell.scrollIntoView === 'function') {
      shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Ensures all active evaluation steps (1-5 for Residential/Move-In-Out/Airbnb, or 1 & 4 for Commercial)
   * have been completed before opening the Estimate & Schedule modal. If any step is incomplete, jumps to
   * that step, highlights missing fields in red, and instructs the user.
   */
  function validateAllStepsBeforeBooking() {
    if (!state.step1Fulfilled) {
      state.wizardStep = 1;
      updateWizardUI();
      showValidationError(
        'Pick a service category first to finish your estimate.',
        [els.step1ServiceGrid]
      );
      scrollWizardIntoView();
      return false;
    }

    const sequence = getActiveStepSequence();

    if (sequence.includes(2)) {
      if (state.serviceCategory === 'moveinout' && !state.propertyType) {
        state.wizardStep = 2;
        updateWizardUI();
        validateStepFulfillment(2);
        scrollWizardIntoView();
        return false;
      }
      if (state.serviceCategory === 'residential' && !state.step2ResidentialFulfilled) {
        state.wizardStep = 2;
        updateWizardUI();
        showValidationError(
          'Choose Standard Clean or Deep Clean and confirm your home size.',
          [els.residentialTierGroup, els.scopePanelFull]
        );
        scrollWizardIntoView();
        return false;
      }
      if (state.serviceCategory === 'airbnb' && !state.step2AirbnbConfirmed) {
        state.wizardStep = 2;
        updateWizardUI();
        showValidationError(
          'Confirm your rental bedrooms, baths, and square footage below.',
          [els.scopePanelFull]
        );
        scrollWizardIntoView();
        return false;
      }
    }

    if (sequence.includes(3)) {
      const hasMissingAddInfo =
        !state.additionalInfo.hasPets ||
        !state.additionalInfo.lastCleaned ||
        !state.additionalInfo.occupancy ||
        !state.additionalInfo.condition;
      if (hasMissingAddInfo) {
        state.wizardStep = 3;
        updateWizardUI();
        validateStepFulfillment(3);
        scrollWizardIntoView();
        return false;
      }
    }

    if (!state.step4FrequencyFulfilled) {
      state.wizardStep = 4;
      updateWizardUI();
      validateStepFulfillment(4);
      scrollWizardIntoView();
      return false;
    }

    if (sequence.includes(5)) {
      if (!state.step5Visited) {
        state.wizardStep = 5;
        updateWizardUI();
        showValidationError(
          'Review optional add-ons below, then click Pick Time & Send Estimate.',
          [document.getElementById('calc-step-5')]
        );
        scrollWizardIntoView();
        return false;
      }
      if (!validateStepFulfillment(5)) {
        state.wizardStep = 5;
        updateWizardUI();
        scrollWizardIntoView();
        return false;
      }
    }

    return true;
  }

  /**
   * Jumps directly to Property Details (Step 2, or Step 1 for Commercial) when the customer clicks
   * "Edit Details" inside the Estimate & Schedule modal header.
   */
  function goToDetailsStepFromModal() {
    clearValidationErrors();
    state.wizardStep = state.serviceCategory === 'commercial' ? 1 : 2;
    updateWizardUI();
    scrollWizardIntoView();
  }

  window.SmartsProCalculator = Object.freeze({
    applyQuoteAdjustments,
    validateAllStepsBeforeBooking,
    goToDetailsStepFromModal
  });

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initCalculatorEvents();
    updateUI();
  });
})();
