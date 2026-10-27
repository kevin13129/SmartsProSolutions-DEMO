/**
 * SMARTS PRO SOLUTIONS - LIVE PRICING CALCULATOR ENGINE & MULTI-STEP WIZARD
 * Step 1: Type of Service (Residential, Commercial, Move-In/Out, Airbnb) + Scope Overview
 * Step 2: Property Details (Residential Tiers/Specific Areas OR Move-In/Out Property Type + Gauge)
 * Step 3: Additional Information (Pets, Last Professional Cleaning, Occupancy, Current Condition)
 *         (Steps 2 & 3 skipped automatically for Commercial & Offices -> goes straight to Frequency)
 * Step 4: Cleaning Frequency
 * Step 5: Custom Add-Ons (with smart Pet Hair add-on sync from Step 3)
 *
 * Includes per-step fulfillment validation with missing-option highlighting
 * and dispatches structured job envelopes to SmartsProDispatchFramework.
 */

(function () {
  'use strict';

  // --- Pricing Configuration ($40-$50/hr customer valuation) ---
  const PRICING_CONFIG = {
    minimumJobCharge: 120,
    specificAreas: {
      minHours: 2,
      maxHours: 6,
      baseTwoHourFlatRate: 120,
      extraHourRate: 45
    },
    hourlyRates: {
      standard: 40,
      deep: 50,
      moveinout: 50,
      airbnb: 45,
      commercial: 50
    },
    timeFactors: {
      baseHours: 1.5,
      perBedroomHours: 0.5,
      perFullBathHours: 0.5,
      perHalfBathHours: 0.25,
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
    addons: {
      fridge: 65,
      fridgeDouble: 75,
      oven: 80,
      pets: 35
    }
  };

  // --- Service Scope Overviews for Step 1 ---
  const SERVICE_OVERVIEWS = {
    default: {
      kicker: 'Service Scope Overview',
      title: 'What Each Service Category Includes',
      desc: 'Select one of the 4 service categories above to view its full room-by-room checklist and unlock the next step.',
      items: [
        'Residential Homes: Kitchens, baths, floors & dusting ($40/hr Standard, $50/hr Deep, or Specific Areas $120 min)',
        'Commercial & Offices: Lobbies, desks, restrooms, breakrooms & custom facility walkthrough schedule',
        'Move-In / Move-Out: Inside empty cabinets, drawers, closets, hand-wiped baseboards & lease inspection prep',
        'Airbnb / STR Turnover: Linen change, bathroom & kitchen sanitization, restock check & guest-ready presentation'
      ]
    },
    residential: {
      kicker: 'RESIDENTIAL HOMES OVERVIEW',
      title: 'Complete Home Care ($40/hr Standard · $50/hr Deep · $120 Specific Areas Min)',
      desc: 'Customizable cleaning built for houses, apartments, and family homes across Shreveport & Bossier City. Choose full-property Standard/Deep cleaning or target Specific Areas by the hour.',
      items: [
        'Kitchens: Countertops, sink scrubbing, stovetop degreasing, microwave interior & cabinet faces',
        'Bathrooms: Showers, tubs, toilets, mirrors, chrome fixtures & hospital-grade surface sanitization',
        'Bedrooms & Living Spaces: Ceiling fans, window sills, baseboards, furniture dusting & pet-friendly floor care',
        'Flexible Options: Choose Standard ($40/hr), Deep Clean ($50/hr), or Specific Areas ($120 2-hr minimum)'
      ]
    },
    commercial: {
      kicker: 'COMMERCIAL & OFFICES OVERVIEW',
      title: 'Professional Facility & Office Maintenance (Custom Walkthrough & Schedule)',
      desc: 'Tailored janitorial and commercial care for offices, medical suites, retail storefronts, and banks. Click Next to choose your Cleaning Frequency and request an owner walkthrough.',
      items: [
        'Lobby, Reception & Workstations: High-visibility glass, desks, conference tables & electronics-safe dusting',
        'Restrooms & Breakrooms: Multi-stall restroom sanitization, soap/towel restocking & breakroom appliances',
        'Floors & High-Traffic Corridors: Commercial HEPA vacuuming, hard-surface mopping & entryway detailing',
        'Streamlined Commercial Flow: Proceeds directly to Cleaning Frequency & Walkthrough Request'
      ]
    },
    moveinout: {
      kicker: 'MOVE-IN / MOVE-OUT OVERVIEW',
      title: 'Empty-Property Reset for Leases, Closings & Relocations ($50/hr)',
      desc: 'Inspection-ready restoration for houses, apartments, condos, and townhomes. Designed to satisfy landlord move-out checklists and prepare empty residences for new occupants.',
      items: [
        'Inside Cabinets, Drawers & Closets: Full interior wipe-down of empty kitchen, bath & storage cabinetry',
        'Deep Structural Detailing: Hand-washed baseboards, door frames, light switches, vents & window tracks',
        'Kitchen & Bath Restoration: Heavy lime/soap-scum removal, appliance exteriors & sanitized fixtures',
        'Property-Type Tailored: Next step asks whether your property is a House, Apartment, Condo, or Townhome'
      ]
    },
    airbnb: {
      kicker: 'AIRBNB / STR TURNOVER OVERVIEW',
      title: '5-Star Guest-Ready Short-Term Rental Turnover ($45/hr)',
      desc: 'Fast, checklist-driven hospitality resets between guest check-out and check-in so your listing earns spotless reviews every stay.',
      items: [
        'Hotel-Standard Bed & Linen Reset: Fresh linen staging, towel folding & guest-ready bedroom presentation',
        'Kitchen & Bath Sanitization: Dish/appliance check, sanitized counters, gleaming sinks & restocked essentials',
        'Host Damage & Inventory Check: Visual inspection for guest items left behind or maintenance issues',
        'Same-Day Window Reliability: Precision scheduling aligned with 11 AM check-out and 3 PM check-in windows'
      ]
    }
  };

  // --- Calculator State ---
  const state = {
    wizardStep: 1,
    serviceCategory: 'residential', // 'residential' | 'commercial' | 'moveinout' | 'airbnb'
    step1Fulfilled: false,
    step2ResidentialFulfilled: false,
    step4FrequencyFulfilled: false,
    propertyType: '', // 'House' | 'Apartment' | 'Condo' | 'Townhome'
    scopeMode: 'full', // 'full' | 'specific'
    specificAreasText: '',
    specificHours: 2,
    bedrooms: 3,
    fullBaths: 2,
    halfBaths: 1,
    sqft: 1800,
    serviceType: 'standard', // 'standard' | 'deep' | 'moveinout' | 'airbnb'
    additionalInfo: {
      hasPets: '', // 'yes' | 'no'
      lastCleaned: '',
      occupancy: '',
      condition: ''
    },
    frequency: 'biweekly', // 'weekly' | 'biweekly' | 'turnover' | 'monthly' | 'onetime'
    addons: {
      fridge: 0,
      fridgeDouble: 0,
      oven: 0,
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

    // Scope Mode & Specific Areas Elements
    scopePanelFull: document.getElementById('scope-panel-full'),
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
    freqTurnoverTitle: document.getElementById('freq-turnover-title'),
    freqTurnoverSub: document.getElementById('freq-turnover-sub'),

    // Step 5: Add-Ons
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

    valPets: document.getElementById('val-addon-pets'),
    btnPetsMinus: document.getElementById('btn-pets-minus'),
    btnPetsPlus: document.getElementById('btn-pets-plus'),
    cardPets: document.getElementById('addon-item-pets'),
    addonPetsLockNote: document.getElementById('addon-pets-lock-note'),

    // Summary Output Elements
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
    summaryAddonsRow: document.getElementById('summary-addons-row'),
    summaryAddonsVal: document.getElementById('summary-addons-val'),
    btnBookQuoteLabel: document.getElementById('btn-book-quote-label'),

    btnPrintQuote: document.getElementById('btn-print-quote'),
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
          'Please select a Type of Service (Residential Homes, Commercial & Offices, Move-In / Move-Out, or Airbnb Turnover) to fulfill this section before moving forward.',
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
            'Please select your Property Type (House, Apartment, Condo, or Townhome) to fulfill the Property Details section.',
            [els.step2MoveinoutPropertyType, els.movePropertyTypeGroup]
          );
          return false;
        }
        return true;
      }

      if (state.serviceCategory === 'residential') {
        if (!state.step2ResidentialFulfilled) {
          showValidationError(
            'Please select your Residential Cleaning Tier (Standard Clean, Deep Clean, or Specific Areas) or adjust your property details to continue.',
            [els.residentialTierGroup]
          );
          return false;
        }
        if (state.scopeMode === 'specific' && state.specificAreasText.trim().length === 0) {
          showValidationError(
            'Please enter which specific areas you want cleaned before moving forward.',
            [els.specificAreasInputGroup, els.inputSpecificAreas]
          );
          if (els.inputSpecificAreas) els.inputSpecificAreas.focus();
          return false;
        }
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
          'Please answer all 4 required questions in Additional Information (Pets, Last Professional Cleaning, Occupancy, and Current Condition) before moving forward.',
          missingGroups
        );
        return false;
      }
      return true;
    }

    if (stepId === 4) {
      if (!state.step4FrequencyFulfilled) {
        showValidationError(
          'Please select a Cleaning Frequency schedule below to fulfill this section.',
          [els.step4FrequencyGrid]
        );
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
      const basePrice = Math.round(estimatedHours * baseRate);
      return {
        isCommercial: true,
        isSpecificAreas: false,
        hourlyRate: baseRate,
        estimatedHours,
        basePrice,
        minApplied: false,
        discountRate: 0,
        discountAmount: 0,
        addonsTotal: 0,
        grandTotal: basePrice,
        timeRangeText: 'On-Site Walkthrough',
        crewText: 'Commercial Team'
      };
    }

    const isSpecificAreas =
      state.serviceCategory === 'residential' && state.scopeMode === 'specific';

    let basePrice = 0;
    let estimatedHours = 2;
    let minApplied = false;
    let hourlyRate = cfg.hourlyRates[state.serviceType] || 40;

    if (isSpecificAreas) {
      const bookedHours = Math.min(
        cfg.specificAreas.maxHours,
        Math.max(cfg.specificAreas.minHours, state.specificHours)
      );
      estimatedHours = bookedHours;
      const extraHours = Math.max(0, bookedHours - cfg.specificAreas.minHours);
      basePrice =
        cfg.specificAreas.baseTwoHourFlatRate +
        extraHours * cfg.specificAreas.extraHourRate;
      minApplied = bookedHours === cfg.specificAreas.minHours;
      hourlyRate = cfg.specificAreas.extraHourRate;
    } else {
      const tf = cfg.timeFactors;
      const extraSqft = Math.max(0, state.sqft - tf.sqftBaseline);
      const sqftHours = (extraSqft / tf.sqftStepSize) * tf.hoursPerSqftStep;

      const rawHours =
        tf.baseHours +
        state.bedrooms * tf.perBedroomHours +
        state.fullBaths * tf.perFullBathHours +
        state.halfBaths * tf.perHalfBathHours +
        sqftHours;

      const serviceMult = cfg.serviceMultipliers[state.serviceType] || 1.0;
      estimatedHours = Math.max(2.0, Math.round(rawHours * serviceMult * 2) / 2);

      const rawPrice = Math.round(estimatedHours * hourlyRate);
      basePrice = Math.max(cfg.minimumJobCharge, rawPrice);
      minApplied = rawPrice < cfg.minimumJobCharge;
    }

    // Add-ons total
    const addonsTotal =
      state.addons.fridge * cfg.addons.fridge +
      state.addons.fridgeDouble * cfg.addons.fridgeDouble +
      state.addons.oven * cfg.addons.oven +
      state.addons.pets * cfg.addons.pets;

    const grandTotal = basePrice + addonsTotal;

    const addonHours =
      (state.addons.fridge + state.addons.fridgeDouble + state.addons.oven) * 0.5 +
      state.addons.pets * 0.25;
    const totalHours = estimatedHours + addonHours;

    let timeRangeText = '';
    if (isSpecificAreas) {
      timeRangeText =
        addonHours > 0
          ? `${estimatedHours} hrs + ${addonHours.toFixed(1)}h add-ons`
          : `${estimatedHours} Hours Booked`;
    } else {
      const minHrs = Math.max(1.5, Math.round((totalHours - 0.5) * 2) / 2);
      const maxHrs = Math.round((totalHours + 0.5) * 2) / 2;
      timeRangeText = `${minHrs} – ${maxHrs} hrs`;
    }

    let crewSize = '1 – 2 Pros';
    if (totalHours >= 4.5) crewSize = '2 – 3 Pros';
    if (totalHours >= 7.0) crewSize = '3 – 4 Pros';

    return {
      isCommercial: false,
      isSpecificAreas,
      hourlyRate,
      estimatedHours,
      basePrice,
      minApplied,
      discountRate: 0,
      discountAmount: 0,
      addonsTotal,
      grandTotal,
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
          ? 'Move-In / Out Details'
          : state.serviceCategory === 'airbnb'
            ? 'Airbnb Property Details'
            : 'Property Details',
      3: 'Additional Information',
      4: 'Cleaning Frequency',
      5: 'Custom Add-Ons'
    };

    const nextButtonTitles = {
      1: 'Type of Service',
      2: 'Property Details',
      3: 'Additional Info',
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
          ? 'Commercial Cleaning Frequency'
          : 'Cleaning Frequency';
    }
    if (els.step4HeadingDesc) {
      els.step4HeadingDesc.textContent =
        state.serviceCategory === 'commercial'
          ? 'Select how often your office or facility needs service to complete your Commercial walkthrough request'
          : 'Select your preferred service schedule below to continue';
    }
    if (els.freqTurnoverTitle && els.freqTurnoverSub) {
      if (state.serviceCategory === 'commercial') {
        els.freqTurnoverTitle.textContent = 'Custom / Daily';
        els.freqTurnoverSub.textContent = 'Multi-Day Facility Care';
      } else {
        els.freqTurnoverTitle.textContent = 'Per Turnover';
        els.freqTurnoverSub.textContent = 'Airbnb / Host Partner';
      }
    }

    // Configure Step 2 sub-sections based on serviceCategory
    if (state.serviceCategory === 'moveinout') {
      if (els.step2ResidentialControls) els.step2ResidentialControls.classList.add('is-hidden');
      if (els.step2MoveinoutPropertyType) els.step2MoveinoutPropertyType.classList.remove('is-hidden');
      if (els.step2HeadingTitle) {
        els.step2HeadingTitle.textContent = 'Move-In / Move-Out Property Details';
      }
      if (els.step2HeadingDesc) {
        els.step2HeadingDesc.textContent =
          'Select your property type (House, Apartment, Condo, or Townhome) and adjust your property details gauge';
      }
    } else if (state.serviceCategory === 'airbnb') {
      if (els.step2ResidentialControls) els.step2ResidentialControls.classList.add('is-hidden');
      if (els.step2MoveinoutPropertyType) els.step2MoveinoutPropertyType.classList.add('is-hidden');
      if (els.step2HeadingTitle) {
        els.step2HeadingTitle.textContent = 'Airbnb / STR Property Details';
      }
      if (els.step2HeadingDesc) {
        els.step2HeadingDesc.textContent =
          'Configure your short-term rental bedrooms, bathrooms, and square footage below';
      }
    } else {
      if (els.step2ResidentialControls) els.step2ResidentialControls.classList.remove('is-hidden');
      if (els.step2MoveinoutPropertyType) els.step2MoveinoutPropertyType.classList.add('is-hidden');
      if (els.step2HeadingTitle) {
        els.step2HeadingTitle.textContent = 'Residential Property Details';
      }
      if (els.step2HeadingDesc) {
        els.step2HeadingDesc.textContent =
          'Choose Standard ($40/hr), Deep Clean ($50/hr), or Specific Areas ($120 2-hr min), then set your home size';
      }
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
    // Enforce Pet Add-On lock if customer chose "No pets" in Additional Information
    const choseNoPets = state.additionalInfo.hasPets === 'no';
    if (choseNoPets && state.addons.pets !== 0) {
      state.addons.pets = 0;
    }

    const calc = calculateQuote();
    const isSpecific = calc.isSpecificAreas;
    const isCommercial = calc.isCommercial;

    updateServiceOverviewUI();

    // 1. Update Residential Tier Buttons & Scope Panels
    els.residentialTierBtns.forEach((btn) => {
      const tier = btn.getAttribute('data-res-tier');
      const currentTier = state.scopeMode === 'specific' ? 'specific' : state.serviceType;
      const isActive = tier === currentTier;
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
      els.scopePanelFull.classList.toggle('is-hidden', isSpecific);
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

    // 4. Update Step 4 Frequency Cards
    els.freqCards.forEach((card) => {
      const cardFreq = card.getAttribute('data-freq');
      const isSelected = state.step4FrequencyFulfilled && cardFreq === state.frequency;
      card.classList.toggle('active', isSelected);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = isSelected;
    });

    // 5. Update Step 5 Add-on Quantities & Pet Lock State
    if (els.valFridge) els.valFridge.textContent = state.addons.fridge;
    if (els.btnFridgeMinus) els.btnFridgeMinus.disabled = state.addons.fridge <= 0;
    if (els.cardFridge) els.cardFridge.classList.toggle('has-quantity', state.addons.fridge > 0);

    if (els.valFridgeDouble) els.valFridgeDouble.textContent = state.addons.fridgeDouble;
    if (els.btnFridgeDoubleMinus) {
      els.btnFridgeDoubleMinus.disabled = state.addons.fridgeDouble <= 0;
    }
    if (els.cardFridgeDouble) {
      els.cardFridgeDouble.classList.toggle('has-quantity', state.addons.fridgeDouble > 0);
    }

    if (els.valOven) els.valOven.textContent = state.addons.oven;
    if (els.btnOvenMinus) els.btnOvenMinus.disabled = state.addons.oven <= 0;
    if (els.cardOven) els.cardOven.classList.toggle('has-quantity', state.addons.oven > 0);

    if (els.valPets) els.valPets.textContent = state.addons.pets;
    if (els.cardPets) {
      els.cardPets.classList.toggle('is-disabled-addon', choseNoPets);
      els.cardPets.classList.toggle('has-quantity', !choseNoPets && state.addons.pets > 0);
    }
    if (els.addonPetsLockNote) {
      els.addonPetsLockNote.classList.toggle('is-hidden', !choseNoPets);
    }
    if (els.btnPetsMinus) {
      els.btnPetsMinus.disabled = choseNoPets || state.addons.pets <= 0;
    }
    if (els.btnPetsPlus) {
      els.btnPetsPlus.disabled = choseNoPets || state.addons.pets >= 5;
    }

    // 6. Update Summary Card Outputs
    if (els.quoteTotalAmount) {
      els.quoteTotalAmount.textContent = calc.grandTotal.toFixed(2);
      const priceParent = els.quoteTotalAmount.closest('.quote-price-amount');
      if (priceParent) {
        priceParent.classList.remove('price-pulse');
        void priceParent.offsetWidth;
        priceParent.classList.add('price-pulse');
      }
    }

    const freqLabels = {
      weekly: 'Scheduled Weekly (Every 7 Days)',
      biweekly: 'Scheduled Bi-Weekly (Every 2 Weeks)',
      turnover: 'Per Guest Turnover / Custom Schedule',
      monthly: 'Scheduled Monthly',
      onetime: 'One-Time Cleaning Estimate'
    };
    if (els.quoteBillingFreq) {
      els.quoteBillingFreq.textContent = isCommercial
        ? `Commercial Walkthrough · ${freqLabels[state.frequency] || 'Custom Schedule'}`
        : freqLabels[state.frequency] || 'Estimated Per Cleaning';
    }

    if (els.quoteMinimumNoteText) {
      if (isCommercial) {
        els.quoteMinimumNoteText.textContent =
          'Commercial walkthrough confirms final facility pricing';
      } else if (isSpecific) {
        els.quoteMinimumNoteText.textContent =
          '$120 flat minimum (2 hrs) • +$45/hr up to 6 hrs';
      } else {
        els.quoteMinimumNoteText.textContent =
          '$40/hr Standard • $50/hr Deep Clean ($120 min)';
      }
    }

    const serviceNames = {
      standard: 'Standard · $40/hr',
      deep: 'Deep Clean · $50/hr',
      moveinout: 'Move-In/Out · $50/hr',
      airbnb: 'Airbnb Turnover · $45/hr'
    };
    if (els.summaryServiceType) {
      if (isCommercial) {
        els.summaryServiceType.textContent = 'Commercial Walkthrough';
      } else if (isSpecific) {
        els.summaryServiceType.textContent = `Specific Areas · ${state.specificHours} hrs`;
      } else {
        els.summaryServiceType.textContent =
          serviceNames[state.serviceType] || 'Standard · $40/hr';
      }
    }
    if (els.summaryServiceRate) {
      els.summaryServiceRate.textContent = `$${calc.basePrice.toFixed(2)}`;
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
        els.summaryBaseRate.textContent = 'Confirmed during owner walkthrough';
      } else if (isSpecific) {
        els.summaryScopeTitle.textContent = 'Booked Time';
        const extraHrs = Math.max(0, state.specificHours - 2);
        els.summaryBaseRate.textContent =
          extraHrs > 0
            ? `${state.specificHours} hrs ($120 + ${extraHrs} × $45/hr)`
            : '2 hrs ($120 Flat Minimum)';
      } else {
        els.summaryScopeTitle.textContent = 'Property Size';
        const bathText =
          state.halfBaths > 0
            ? `${state.fullBaths} Full, ${state.halfBaths} Half`
            : `${state.fullBaths} Full Bath`;
        els.summaryBaseRate.textContent = `${state.bedrooms} Bed, ${bathText} • ${state.sqft.toLocaleString()} sq ft`;
      }
    }

    if (els.summarySpecificAreasRow && els.summarySpecificAreasVal) {
      if (isSpecific) {
        els.summarySpecificAreasRow.classList.remove('is-hidden');
        const cleanedText = state.specificAreasText.trim();
        els.summarySpecificAreasVal.textContent =
          cleanedText.length > 0 ? cleanedText : 'Specify in Step 2';
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
        els.summaryAddinfoVal.textContent = parts.join(' • ') || 'Recorded';
      } else {
        els.summaryAddinfoRow.classList.add('is-hidden');
      }
    }

    if (els.summaryAddonsRow) {
      if (calc.addonsTotal > 0) {
        els.summaryAddonsRow.classList.remove('addons-hidden', 'is-hidden');
        els.summaryAddonsRow.style.display = 'flex';
        if (els.summaryAddonsVal) {
          els.summaryAddonsVal.textContent = `+$${calc.addonsTotal.toFixed(2)}`;
        }
      } else {
        els.summaryAddonsRow.classList.add('addons-hidden');
        els.summaryAddonsRow.style.display = '';
      }
    }

    if (els.btnBookQuoteLabel) {
      els.btnBookQuoteLabel.textContent = isCommercial
        ? 'Request Commercial Walkthrough'
        : 'Review Estimate & Next Steps';
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
    clearValidationErrors();

    if (category === 'residential') {
      if (state.serviceType === 'moveinout' || state.serviceType === 'airbnb') {
        state.serviceType = 'standard';
      }
    } else if (category === 'moveinout') {
      state.scopeMode = 'full';
      state.serviceType = 'moveinout';
    } else if (category === 'airbnb') {
      state.scopeMode = 'full';
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

    // Step 2: Residential Tier Buttons (Standard $40/hr, Deep $50/hr, Specific Areas $120 min)
    els.residentialTierBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-res-tier');
        state.step2ResidentialFulfilled = true;
        clearValidationErrors();
        if (tier === 'specific') {
          state.scopeMode = 'specific';
        } else if (tier === 'deep') {
          state.scopeMode = 'full';
          state.serviceType = 'deep';
        } else {
          state.scopeMode = 'full';
          state.serviceType = 'standard';
        }
        updateUI();
      });
    });

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
          state.step2ResidentialFulfilled = true;
          updateUI();
        }
      });
    }
    if (els.btnHoursPlus) {
      els.btnHoursPlus.addEventListener('click', () => {
        if (state.specificHours < PRICING_CONFIG.specificAreas.maxHours) {
          state.specificHours++;
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
          updateUI();
        }
      });
    }
    if (els.btnBedPlus) {
      els.btnBedPlus.addEventListener('click', () => {
        if (state.bedrooms < 8) {
          state.bedrooms++;
          state.step2ResidentialFulfilled = true;
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
          updateUI();
        }
      });
    }
    if (els.btnBathPlus) {
      els.btnBathPlus.addEventListener('click', () => {
        if (state.fullBaths < 6) {
          state.fullBaths++;
          state.step2ResidentialFulfilled = true;
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
          updateUI();
        }
      });
    }
    if (els.btnHalfBathPlus) {
      els.btnHalfBathPlus.addEventListener('click', () => {
        if (state.halfBaths < 4) {
          state.halfBaths++;
          state.step2ResidentialFulfilled = true;
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

        // Sync Pets answer with Step 5 Pet Hair & Detailing Add-On ($35)
        if (group === 'hasPets') {
          if (val === 'yes') {
            state.addons.pets = Math.max(1, state.addons.pets);
          } else if (val === 'no') {
            state.addons.pets = 0;
          }
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
        if (selectedFreq) {
          state.frequency = selectedFreq;
          state.step4FrequencyFulfilled = true;
          clearValidationErrors();
          updateUI();
        }
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

    if (els.btnPetsMinus) {
      els.btnPetsMinus.addEventListener('click', () => {
        if (state.additionalInfo.hasPets === 'no') return;
        if (state.addons.pets > 0) {
          state.addons.pets--;
          updateUI();
        }
      });
    }
    if (els.btnPetsPlus) {
      els.btnPetsPlus.addEventListener('click', () => {
        if (state.additionalInfo.hasPets === 'no') return;
        if (state.addons.pets < 5) {
          state.addons.pets++;
          updateUI();
        }
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
        state.step4FrequencyFulfilled = false;
        state.propertyType = '';
        state.scopeMode = 'full';
        state.specificAreasText = '';
        state.specificHours = 2;
        state.bedrooms = 3;
        state.fullBaths = 2;
        state.halfBaths = 1;
        state.sqft = 1800;
        state.serviceType = 'standard';
        state.additionalInfo = {
          hasPets: '',
          lastCleaned: '',
          occupancy: '',
          condition: ''
        };
        state.frequency = 'biweekly';
        state.addons = { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 };
        if (els.inputSpecificAreas) els.inputSpecificAreas.value = '';
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
      state.wizardStep = 2;
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

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initCalculatorEvents();
    updateUI();
  });
})();
