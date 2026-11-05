import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * SMARTS PRO SOLUTIONS — SERVER-SIDE INTAKE, PRICING, CALENDAR & EMAIL SERVICE
 * Implements docs/SECURITY-ROADMAP.md Section 1 controls:
 * - Strict JSON parsing, 16 KiB transport limit, unknown-field & prototype-key rejection
 * - Bounded customer fields (First Name, Last Name, Phone, Email, Optional Notes)
 * - Authoritative server-side flat-rate price recalculation (no recurring discounts, no online payments)
 * - Calendar appointment validation, double-booking prevention & anonymized upcoming bookings feed
 * - Per-IP and per-contact rate limiting (429 + Retry-After) & Idempotency-Key deduplication
 * - Fail-closed automated email + RFC 5545 .ics calendar dispatch to owner business email
 */

export const PRICING_RULES_VERSION = '2026-11-flat-rate-no-online-payment-v1';
export const MAX_BODY_BYTES = 16 * 1024; // 16 KiB limit per SECURITY-ROADMAP.md
export const BUSINESS_TIMEZONE = 'America/Chicago';
export const DEFAULT_OWNER_EMAIL = 'smartsprosolutions@gmail.com';

export const ARRIVAL_WINDOWS = Object.freeze([
  Object.freeze({
    id: '08:00-11:00',
    label: 'Morning (8:00 AM – 11:00 AM)',
    shortLabel: '8:00 AM – 11:00 AM',
    startHour: 8,
    startMinute: 0,
    endHour: 11,
    endMinute: 0
  }),
  Object.freeze({
    id: '11:30-14:30',
    label: 'Midday (11:30 AM – 2:30 PM)',
    shortLabel: '11:30 AM – 2:30 PM',
    startHour: 11,
    startMinute: 30,
    endHour: 14,
    endMinute: 30
  }),
  Object.freeze({
    id: '14:30-17:30',
    label: 'Afternoon (2:30 PM – 5:30 PM)',
    shortLabel: '2:30 PM – 5:30 PM',
    startHour: 14,
    startMinute: 30,
    endHour: 17,
    endMinute: 30
  })
]);

const SERVER_PRICING_CONFIG = Object.freeze({
  minimumJobCharge: 120,
  specificAreas: Object.freeze({
    minHours: 2,
    maxHours: 6,
    baseTwoHourFlatRate: 120,
    extraHourRate: 45
  }),
  hourlyRates: Object.freeze({
    standard: 40,
    deep: 50,
    moveinout: 50,
    airbnb: 45,
    commercial: 50
  }),
  timeFactors: Object.freeze({
    baseHours: 1.5,
    perBedroomHours: 0.5,
    perFullBathHours: 0.5,
    perHalfBathHours: 0.25,
    sqftBaseline: 1000,
    sqftStepSize: 500,
    hoursPerSqftStep: 0.5
  }),
  serviceMultipliers: Object.freeze({
    standard: 1.0,
    deep: 1.1,
    moveinout: 1.25,
    airbnb: 1.0
  }),
  addons: Object.freeze({
    fridge: 65,
    fridgeDouble: 75,
    oven: 80,
    pets: 35
  })
});

const ALLOWED_SERVICE_CATEGORIES = new Set(['residential', 'commercial', 'moveinout', 'airbnb']);
const ALLOWED_SERVICE_TYPES = new Set(['standard', 'deep', 'moveinout', 'airbnb', 'commercial']);
const ALLOWED_SCOPE_MODES = new Set(['full', 'specific']);
const ALLOWED_PROPERTY_TYPES = new Set(['', 'House', 'Apartment', 'Condo', 'Townhome']);
const ALLOWED_FREQUENCIES = new Set(['weekly', 'biweekly', 'turnover', 'monthly', 'onetime']);
const ALLOWED_PETS = new Set(['', 'yes', 'no']);
const ALLOWED_LAST_CLEANED = new Set([
  '',
  'Within the last month',
  '1-3 Months ago',
  '4-6 months ago',
  'More than 6 months ago',
  'Never professionally cleaned',
  'Unsure'
]);
const ALLOWED_OCCUPANCY = new Set([
  '',
  'Occupied, we live there',
  'Empty / Unfurnished',
  'Partially Furnished'
]);
const ALLOWED_CONDITION = new Set([
  '',
  'Well maintained',
  'Average, normal use',
  'Needs extra attention',
  'Heavy buildup'
]);

const FORBIDDEN_PRICE_OR_PRIVILEGE_KEYS = new Set([
  'grandTotal',
  'basePrice',
  'addonsTotal',
  'discount',
  'discountRate',
  'discountAmount',
  'depositAmount',
  'remainingBalance',
  'referenceCode',
  'ownerId',
  'role',
  'status',
  'isAdmin',
  'price',
  'total'
]);

const SERVICE_DISPLAY_LABELS = Object.freeze({
  standard: 'Residential Standard Clean ($40/hr)',
  deep: 'Residential Deep Clean ($50/hr)',
  moveinout: 'Move-In / Move-Out Clean ($50/hr)',
  airbnb: 'Airbnb / STR Turnover ($45/hr)',
  specific: 'Specific Areas (Hourly Booking)',
  commercial: 'Commercial & Offices (Walkthrough & Custom Bid)'
});

const FREQUENCY_DISPLAY_LABELS = Object.freeze({
  weekly: 'Weekly (Every 7 Days) • Flat Rate',
  biweekly: 'Every 2 Weeks • Flat Rate',
  turnover: 'Per Turnover / Custom Schedule • Flat Rate',
  monthly: 'Monthly • Flat Rate',
  onetime: 'One-Time Service • Flat Rate'
});

/**
 * Checks whether an object contains own prototype-pollution keys or non-plain objects.
 */
function hasDangerousKeys(value, depth = 0) {
  if (depth > 6) return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasDangerousKeys(item, depth + 1));
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return true;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    if (hasDangerousKeys(value[key], depth + 1)) return true;
  }
  return false;
}

function hasOnlyAllowedKeys(obj, allowedSet) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  return keys.every((k) => allowedSet.has(k));
}

function containsControlChars(str, allowNewlines = false) {
  if (typeof str !== 'string') return true;
  if (allowNewlines) {
    return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str);
  }
  return /[\x00-\x1F\x7F]/.test(str);
}

function looksLikePaymentCard(str) {
  if (typeof str !== 'string') return false;
  // Detect 13-19 digit sequences separated by spaces or hyphens
  return /\b(?:\d[ -]*?){13,19}\b/.test(str);
}

/**
 * Returns today's YYYY-MM-DD in America/Chicago business timezone.
 */
export function getBusinessTodayIso(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

function addDaysToIsoDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the last calendar day (YYYY-MM-DD) of the next calendar month.
 * E.g., any date in Nov 2026 -> 2026-12-31; any date in Dec 2026 -> 2027-01-31;
 * any date in Jan 2028 (leap year) -> 2028-02-29.
 */
export function getEndOfNextCalendarMonthIso(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  const targetYear = m === 12 ? y + 1 : y;
  const targetMonth = m === 12 ? 1 : m + 1;
  const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 12, 0, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(maxDaysInTargetMonth).padStart(2, '0')}`;
}

function getLastDayOfMonthIso(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function formatMonthYearLabel(year, month) {
  const dt = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric'
  }).format(dt);
}

function getDayOfWeekUtc(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); // 0 = Sunday
}

function formatReadableDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(dt);
}

/**
 * Perpetual Gregorian leap-year check (handles 4-year, 100-year, and 400-year rules).
 */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function formatYmdUtc(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getNthWeekdayOfMonth(year, month, weekday, n) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return formatYmdUtc(year, month, day);
}

function getLastWeekdayOfMonth(year, month, weekday) {
  const lastDate = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const lastDay = lastDate.getUTCDate();
  const lastDow = lastDate.getUTCDay();
  const offset = (lastDow - weekday + 7) % 7;
  return formatYmdUtc(year, month, lastDay - offset);
}

function addFixedHolidayWithObserved(map, year, month, day, label) {
  const iso = formatYmdUtc(year, month, day);
  map.set(iso, label);
  const dow = getDayOfWeekUtc(iso);
  if (dow === 6) {
    // Saturday holiday observed on preceding Friday
    map.set(addDaysToIsoDate(iso, -1), `${label} (Observed)`);
  } else if (dow === 0) {
    // Sunday holiday observed on following Monday
    map.set(addDaysToIsoDate(iso, 1), `${label} (Observed)`);
  }
}

/**
 * Computes US business holidays for any calendar year (perpetual multi-decade support).
 */
export function getUsHolidaysForYear(year) {
  const holidays = new Map();
  addFixedHolidayWithObserved(holidays, year, 1, 1, "New Year's Day");
  // Also check if next year's Jan 1 falls on Saturday (observed Dec 31 of current year)
  addFixedHolidayWithObserved(holidays, year + 1, 1, 1, "New Year's Day");

  holidays.set(getNthWeekdayOfMonth(year, 1, 1, 3), 'Martin Luther King Jr. Day');
  holidays.set(getNthWeekdayOfMonth(year, 2, 1, 3), "Presidents' Day");
  holidays.set(getLastWeekdayOfMonth(year, 5, 1), 'Memorial Day');
  addFixedHolidayWithObserved(holidays, year, 6, 19, 'Juneteenth');
  addFixedHolidayWithObserved(holidays, year, 7, 4, 'Independence Day');
  holidays.set(getNthWeekdayOfMonth(year, 9, 1, 1), 'Labor Day');

  const thanksgivingIso = getNthWeekdayOfMonth(year, 11, 4, 4);
  holidays.set(thanksgivingIso, 'Thanksgiving Day');
  holidays.set(addDaysToIsoDate(thanksgivingIso, 1), 'Day After Thanksgiving');

  holidays.set(formatYmdUtc(year, 12, 24), 'Christmas Eve');
  addFixedHolidayWithObserved(holidays, year, 12, 25, 'Christmas Day');
  return holidays;
}

export function getHolidayNameForIsoDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const year = Number(isoDate.slice(0, 4));
  const map = getUsHolidaysForYear(year);
  return map.get(isoDate) || null;
}

/**
 * Recalculates the authoritative flat-rate estimate on the server.
 * Ignores any browser-computed totals.
 */
export function calculateAuthoritativeQuote(quoteInput) {
  const cfg = SERVER_PRICING_CONFIG;
  const serviceCategory = quoteInput.serviceCategory;
  const isCommercial = serviceCategory === 'commercial';

  if (isCommercial) {
    const hourlyRate = cfg.hourlyRates.commercial;
    const estimatedHours = 3.0;
    const basePrice = Math.round(estimatedHours * hourlyRate);
    return Object.freeze({
      pricingRulesVersion: PRICING_RULES_VERSION,
      pricingModel: 'FLAT_RATE_NO_ONLINE_PAYMENT',
      isCommercial: true,
      isSpecificAreas: false,
      hourlyRate,
      estimatedHours,
      basePrice,
      addonsTotal: 0,
      discountRate: 0,
      discountAmount: 0,
      grandTotal: basePrice,
      currency: 'USD'
    });
  }

  const isSpecificAreas = serviceCategory === 'residential' && quoteInput.scopeMode === 'specific';
  const effectiveServiceType =
    serviceCategory === 'moveinout'
      ? 'moveinout'
      : serviceCategory === 'airbnb'
        ? 'airbnb'
        : quoteInput.serviceType === 'deep'
          ? 'deep'
          : 'standard';

  let basePrice = 0;
  let estimatedHours = 2;
  let hourlyRate = cfg.hourlyRates[effectiveServiceType] || 40;

  if (isSpecificAreas) {
    const bookedHours = Math.min(
      cfg.specificAreas.maxHours,
      Math.max(cfg.specificAreas.minHours, quoteInput.specificHours)
    );
    estimatedHours = bookedHours;
    const extraHours = Math.max(0, bookedHours - cfg.specificAreas.minHours);
    basePrice = cfg.specificAreas.baseTwoHourFlatRate + extraHours * cfg.specificAreas.extraHourRate;
    hourlyRate = cfg.specificAreas.extraHourRate;
  } else {
    const tf = cfg.timeFactors;
    const extraSqft = Math.max(0, quoteInput.sqft - tf.sqftBaseline);
    const sqftHours = (extraSqft / tf.sqftStepSize) * tf.hoursPerSqftStep;
    const rawHours =
      tf.baseHours +
      quoteInput.bedrooms * tf.perBedroomHours +
      quoteInput.fullBaths * tf.perFullBathHours +
      quoteInput.halfBaths * tf.perHalfBathHours +
      sqftHours;
    const serviceMult = cfg.serviceMultipliers[effectiveServiceType] || 1.0;
    estimatedHours = Math.max(2.0, Math.round(rawHours * serviceMult * 2) / 2);
    const rawPrice = Math.round(estimatedHours * hourlyRate);
    basePrice = Math.max(cfg.minimumJobCharge, rawPrice);
  }

  const hasPets = quoteInput.additionalInfo?.hasPets || '';
  const petsAddonCount =
    hasPets === 'no'
      ? 0
      : hasPets === 'yes'
        ? 1
        : quoteInput.addons.pets > 0
          ? 1
          : 0;

  const addonsTotal =
    quoteInput.addons.fridge * cfg.addons.fridge +
    quoteInput.addons.fridgeDouble * cfg.addons.fridgeDouble +
    quoteInput.addons.oven * cfg.addons.oven +
    petsAddonCount * cfg.addons.pets;

  const grandTotal = basePrice + addonsTotal;

  return Object.freeze({
    pricingRulesVersion: PRICING_RULES_VERSION,
    pricingModel: 'FLAT_RATE_NO_ONLINE_PAYMENT',
    isCommercial: false,
    isSpecificAreas,
    hourlyRate,
    estimatedHours,
    basePrice,
    addonsTotal,
    discountRate: 0,
    discountAmount: 0,
    grandTotal,
    currency: 'USD'
  });
}

/**
 * Validates and normalizes the incoming estimate & appointment request payload.
 * Never echoes untrusted input in error messages.
 */
export function validateEstimateRequest(payload, { now = new Date() } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, status: 400, code: 'INVALID_PAYLOAD', error: 'Request body must be a JSON object.' };
  }

  if (hasDangerousKeys(payload)) {
    return { ok: false, status: 400, code: 'FORBIDDEN_KEYS', error: 'Request contains disallowed object keys.' };
  }

  // Reject any top-level or nested client price/privilege fields
  for (const topKey of Object.keys(payload)) {
    if (FORBIDDEN_PRICE_OR_PRIVILEGE_KEYS.has(topKey)) {
      return { ok: false, status: 400, code: 'CLIENT_PRICE_REJECTED', error: 'Client-supplied price or status fields are not accepted.' };
    }
  }

  const allowedTopKeys = new Set(['customer', 'appointment', 'quote', 'companyWebsite']);
  if (!hasOnlyAllowedKeys(payload, allowedTopKeys)) {
    return { ok: false, status: 400, code: 'UNKNOWN_FIELDS', error: 'Request contains unrecognized fields.' };
  }

  // Honeypot check
  if (payload.companyWebsite !== undefined && payload.companyWebsite !== '') {
    return { ok: false, status: 400, code: 'BOT_REJECTED', error: 'Request could not be processed.' };
  }

  // 1. Validate customer fields
  const customer = payload.customer;
  const allowedCustomerKeys = new Set(['firstName', 'lastName', 'phone', 'email', 'notes']);
  if (!hasOnlyAllowedKeys(customer, allowedCustomerKeys)) {
    return { ok: false, status: 400, code: 'INVALID_CUSTOMER_FIELDS', error: 'Customer contact section has missing or unrecognized fields.' };
  }

  const rawFirst = typeof customer.firstName === 'string' ? customer.firstName.trim() : '';
  const rawLast = typeof customer.lastName === 'string' ? customer.lastName.trim() : '';
  const rawPhone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
  const rawEmail = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
  const rawNotes = customer.notes === undefined || customer.notes === null
    ? ''
    : typeof customer.notes === 'string'
      ? customer.notes.trim()
      : null;

  if (
    !rawFirst ||
    rawFirst.length > 60 ||
    containsControlChars(rawFirst, false) ||
    /[<>]/.test(rawFirst) ||
    !/\p{L}/u.test(rawFirst)
  ) {
    return { ok: false, status: 400, code: 'INVALID_FIRST_NAME', error: 'Please enter a valid First Name (1–60 characters).' };
  }

  if (
    !rawLast ||
    rawLast.length > 60 ||
    containsControlChars(rawLast, false) ||
    /[<>]/.test(rawLast) ||
    !/\p{L}/u.test(rawLast) ||
    rawFirst.length + rawLast.length > 120
  ) {
    return { ok: false, status: 400, code: 'INVALID_LAST_NAME', error: 'Please enter a valid Last Name (1–60 characters).' };
  }

  const phoneDigits = rawPhone.replace(/\D/g, '');
  if (
    !rawPhone ||
    rawPhone.length < 7 ||
    rawPhone.length > 32 ||
    containsControlChars(rawPhone, false) ||
    !/^[0-9+\-().\s]+$/.test(rawPhone) ||
    phoneDigits.length < 10 ||
    phoneDigits.length > 15
  ) {
    return { ok: false, status: 400, code: 'INVALID_PHONE', error: 'Please enter a valid 10-digit Phone Number.' };
  }

  if (
    !rawEmail ||
    rawEmail.length < 5 ||
    rawEmail.length > 254 ||
    containsControlChars(rawEmail, false) ||
    /\s/.test(rawEmail) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(rawEmail)
  ) {
    return { ok: false, status: 400, code: 'INVALID_EMAIL', error: 'Please enter a valid Email Address.' };
  }

  if (
    rawNotes === null ||
    rawNotes.length > 1000 ||
    containsControlChars(rawNotes, true)
  ) {
    return { ok: false, status: 400, code: 'INVALID_NOTES', error: 'Additional notes must be plain text under 1,000 characters.' };
  }

  if (looksLikePaymentCard(rawNotes) || looksLikePaymentCard(rawFirst) || looksLikePaymentCard(rawLast)) {
    return { ok: false, status: 400, code: 'SENSITIVE_DATA_REJECTED', error: 'Please do not include credit card or payment card numbers in your request.' };
  }

  // 2. Validate appointment fields
  const appointment = payload.appointment;
  const allowedAppointmentKeys = new Set(['preferredDate', 'preferredWindow']);
  if (!hasOnlyAllowedKeys(appointment, allowedAppointmentKeys)) {
    return { ok: false, status: 400, code: 'INVALID_APPOINTMENT_FIELDS', error: 'Please select a valid appointment date and arrival window.' };
  }

  const preferredDate = typeof appointment.preferredDate === 'string' ? appointment.preferredDate.trim() : '';
  const preferredWindow = typeof appointment.preferredWindow === 'string' ? appointment.preferredWindow.trim() : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    return { ok: false, status: 400, code: 'INVALID_DATE', error: 'Please select a valid cleaning date (YYYY-MM-DD).' };
  }

  const [y, m, d] = preferredDate.split('-').map(Number);
  const parsedUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    Number.isNaN(parsedUtc.getTime()) ||
    parsedUtc.getUTCFullYear() !== y ||
    parsedUtc.getUTCMonth() + 1 !== m ||
    parsedUtc.getUTCDate() !== d
  ) {
    return { ok: false, status: 400, code: 'INVALID_CALENDAR_DATE', error: 'Selected date is not a valid calendar date.' };
  }

  const todayIso = getBusinessTodayIso(now);
  const minDateIso = addDaysToIsoDate(todayIso, 1);
  const maxDateIso = getEndOfNextCalendarMonthIso(todayIso);
  if (preferredDate < minDateIso || preferredDate > maxDateIso) {
    return {
      ok: false,
      status: 400,
      code: 'DATE_OUT_OF_RANGE',
      error: 'Appointments can only be scheduled within the current month and next calendar month.'
    };
  }

  const dow = getDayOfWeekUtc(preferredDate);
  if (dow === 0 || dow === 6) {
    return {
      ok: false,
      status: 400,
      code: 'WEEKEND_CLOSED',
      error: 'Cleaning appointments are available Monday through Friday, 8:00 AM to 5:30 PM.'
    };
  }

  const holidayName = getHolidayNameForIsoDate(preferredDate);
  if (holidayName) {
    return {
      ok: false,
      status: 400,
      code: 'HOLIDAY_CLOSED',
      error: `Our office is closed on ${holidayName}. Please select an open Monday through Friday date.`
    };
  }

  const windowObj = ARRIVAL_WINDOWS.find((w) => w.id === preferredWindow);
  if (!windowObj) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_ARRIVAL_WINDOW',
      error: 'Please select a valid arrival time window between 8:00 AM and 5:30 PM.'
    };
  }

  // 3. Validate quote / property inputs
  const quote = payload.quote;
  const allowedQuoteKeys = new Set([
    'serviceCategory',
    'serviceType',
    'propertyType',
    'scopeMode',
    'specificAreasText',
    'specificHours',
    'bedrooms',
    'fullBaths',
    'halfBaths',
    'sqft',
    'additionalInfo',
    'frequency',
    'addons'
  ]);
  if (!hasOnlyAllowedKeys(quote, allowedQuoteKeys)) {
    for (const k of Object.keys(quote || {})) {
      if (FORBIDDEN_PRICE_OR_PRIVILEGE_KEYS.has(k)) {
        return { ok: false, status: 400, code: 'CLIENT_PRICE_REJECTED', error: 'Client-supplied price or status fields are not accepted.' };
      }
    }
    return { ok: false, status: 400, code: 'INVALID_QUOTE_FIELDS', error: 'Estimate configuration contains invalid fields.' };
  }

  const serviceCategory = quote.serviceCategory;
  const serviceType = quote.serviceType || 'standard';
  const scopeMode = quote.scopeMode || 'full';
  const propertyType = quote.propertyType === undefined ? '' : quote.propertyType;
  const frequency = quote.frequency;

  if (!ALLOWED_SERVICE_CATEGORIES.has(serviceCategory)) {
    return { ok: false, status: 400, code: 'INVALID_SERVICE_CATEGORY', error: 'Invalid service category selected.' };
  }
  if (!ALLOWED_SERVICE_TYPES.has(serviceType)) {
    return { ok: false, status: 400, code: 'INVALID_SERVICE_TYPE', error: 'Invalid service tier selected.' };
  }
  if (!ALLOWED_SCOPE_MODES.has(scopeMode)) {
    return { ok: false, status: 400, code: 'INVALID_SCOPE_MODE', error: 'Invalid scope mode selected.' };
  }
  if (!ALLOWED_PROPERTY_TYPES.has(propertyType)) {
    return { ok: false, status: 400, code: 'INVALID_PROPERTY_TYPE', error: 'Invalid property type selected.' };
  }
  if (serviceCategory === 'moveinout' && !propertyType) {
    return { ok: false, status: 400, code: 'MISSING_PROPERTY_TYPE', error: 'Property type is required for Move-In / Move-Out estimates.' };
  }
  if (!ALLOWED_FREQUENCIES.has(frequency)) {
    return { ok: false, status: 400, code: 'INVALID_FREQUENCY', error: 'Invalid cleaning frequency selected.' };
  }

  const isIntInRange = (val, min, max) =>
     typeof val === 'number' && Number.isInteger(val) && val >= min && val <= max;

  const bedrooms = quote.bedrooms ?? 3;
  const fullBaths = quote.fullBaths ?? 2;
  const halfBaths = quote.halfBaths ?? 1;
  const sqft = quote.sqft ?? 1800;
  const specificHours = quote.specificHours ?? 2;
  const specificAreasText = typeof quote.specificAreasText === 'string' ? quote.specificAreasText.trim() : '';

  if (
    !isIntInRange(bedrooms, 0, 10) ||
    !isIntInRange(fullBaths, 1, 8) ||
    !isIntInRange(halfBaths, 0, 6) ||
    !isIntInRange(sqft, 400, 6000) ||
    !isIntInRange(specificHours, 2, 6)
  ) {
    return { ok: false, status: 400, code: 'INVALID_PROPERTY_BOUNDS', error: 'Property dimensions are outside supported bounds.' };
  }

  if (specificAreasText.length > 180 || containsControlChars(specificAreasText, false)) {
    return { ok: false, status: 400, code: 'INVALID_SPECIFIC_AREAS', error: 'Specific areas description is invalid.' };
  }

  if (serviceCategory === 'residential' && scopeMode === 'specific' && specificAreasText.length === 0) {
    return { ok: false, status: 400, code: 'MISSING_SPECIFIC_AREAS', error: 'Please specify which areas you want cleaned.' };
  }

  // Additional Info validation
  const addInfo = quote.additionalInfo || {};
  const allowedAddInfoKeys = new Set(['hasPets', 'lastCleaned', 'occupancy', 'condition']);
  if (!hasOnlyAllowedKeys(addInfo, allowedAddInfoKeys)) {
    return { ok: false, status: 400, code: 'INVALID_ADDITIONAL_INFO', error: 'Additional property information contains invalid fields.' };
  }

  const hasPets = addInfo.hasPets || '';
  const lastCleaned = addInfo.lastCleaned || '';
  const occupancy = addInfo.occupancy || '';
  const condition = addInfo.condition || '';

  if (
    !ALLOWED_PETS.has(hasPets) ||
    !ALLOWED_LAST_CLEANED.has(lastCleaned) ||
    !ALLOWED_OCCUPANCY.has(occupancy) ||
    !ALLOWED_CONDITION.has(condition)
  ) {
    return { ok: false, status: 400, code: 'INVALID_ADDITIONAL_INFO_ENUM', error: 'Additional property information has invalid selections.' };
  }

  if (serviceCategory !== 'commercial' && (!hasPets || !lastCleaned || !occupancy || !condition)) {
    return { ok: false, status: 400, code: 'INCOMPLETE_ADDITIONAL_INFO', error: 'Please complete all 4 Additional Information questions.' };
  }

  // Add-ons validation
  const addons = quote.addons || { fridge: 0, fridgeDouble: 0, oven: 0, pets: 0 };
  const allowedAddonKeys = new Set(['fridge', 'fridgeDouble', 'oven', 'pets']);
  if (!hasOnlyAllowedKeys(addons, allowedAddonKeys)) {
    return { ok: false, status: 400, code: 'INVALID_ADDONS', error: 'Custom add-ons contain unrecognized items.' };
  }
  if (
    !isIntInRange(addons.fridge, 0, 5) ||
    !isIntInRange(addons.fridgeDouble, 0, 5) ||
    !isIntInRange(addons.oven, 0, 5) ||
    !isIntInRange(addons.pets, 0, 5)
  ) {
    return { ok: false, status: 400, code: 'INVALID_ADDON_COUNTS', error: 'Add-on quantities must be integers between 0 and 5.' };
  }

  const normalizedQuote = {
    serviceCategory,
    serviceType,
    propertyType,
    scopeMode,
    specificAreasText,
    specificHours,
    bedrooms,
    fullBaths,
    halfBaths,
    sqft,
    additionalInfo: { hasPets, lastCleaned, occupancy, condition },
    frequency,
    addons: {
      fridge: addons.fridge,
      fridgeDouble: addons.fridgeDouble,
      oven: addons.oven,
      pets: hasPets === 'no' ? 0 : hasPets === 'yes' ? 1 : addons.pets > 0 ? 1 : 0
    }
  };

  const authoritativeCalculation = calculateAuthoritativeQuote(normalizedQuote);

  return {
    ok: true,
    value: {
      customer: {
        firstName: rawFirst,
        lastName: rawLast,
        fullName: `${rawFirst} ${rawLast}`,
        phone: rawPhone,
        email: rawEmail,
        notes: rawNotes
      },
      appointment: {
        preferredDate,
        preferredDateFormatted: formatReadableDate(preferredDate),
        preferredWindow: windowObj.id,
        preferredWindowLabel: windowObj.label,
        preferredWindowShort: windowObj.shortLabel,
        windowSpec: windowObj
      },
      quote: normalizedQuote,
      calculation: authoritativeCalculation
    }
  };
}

/**
 * Escapes text for RFC 5545 .ics calendar fields.
 */
function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates an RFC 5545 .ics calendar event string for the owner's calendar.
 */
export function buildCalendarIcs(validatedRecord, referenceCode, ownerEmail = DEFAULT_OWNER_EMAIL) {
  const { customer, appointment, quote, calculation } = validatedRecord;
  const dateCompact = appointment.preferredDate.replace(/-/g, '');
  const pad2 = (n) => String(n).padStart(2, '0');
  const startStr = `${dateCompact}T${pad2(appointment.windowSpec.startHour)}${pad2(appointment.windowSpec.startMinute)}00`;
  const endStr = `${dateCompact}T${pad2(appointment.windowSpec.endHour)}${pad2(appointment.windowSpec.endMinute)}00`;
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const serviceLabel =
    quote.serviceCategory === 'commercial'
      ? SERVICE_DISPLAY_LABELS.commercial
      : calculation.isSpecificAreas
        ? `Specific Areas (${quote.specificHours} Hours)`
        : SERVICE_DISPLAY_LABELS[quote.serviceType] || SERVICE_DISPLAY_LABELS.standard;

  const summary = `Smarts Pro Cleaning: ${customer.fullName} (${serviceLabel})`;
  const descriptionLines = [
    `Reference ID: ${referenceCode}`,
    `Customer: ${customer.fullName}`,
    `Phone: ${customer.phone}`,
    `Email: ${customer.email}`,
    `Service: ${serviceLabel}`,
    `Schedule: ${FREQUENCY_DISPLAY_LABELS[quote.frequency] || quote.frequency}`,
    `Estimated Total (Flat Rate): $${calculation.grandTotal.toFixed(2)}`,
    customer.notes ? `Customer Notes: ${customer.notes}` : 'Customer Notes: None provided'
  ];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarts Pro Solutions//Cleaning Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${referenceCode}@smartsprosolutions.local`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART;TZID=${BUSINESS_TIMEZONE}:${startStr}`,
    `DTEND;TZID=${BUSINESS_TIMEZONE}:${endStr}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
    `ORGANIZER;CN=Smarts Pro Solutions:mailto:${ownerEmail}`,
    `ATTENDEE;CN=${escapeIcsText(customer.fullName)};RSVP=TRUE:mailto:${customer.email}`,
    'STATUS:TENTATIVE',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n') + '\r\n';
}

/**
 * Builds the automated email subject, plain-text body, HTML body, and Google Calendar URL.
 */
export function buildAutomatedEmailContent(validatedRecord, referenceCode, ownerEmail = DEFAULT_OWNER_EMAIL) {
  const { customer, appointment, quote, calculation } = validatedRecord;
  const isCommercial = quote.serviceCategory === 'commercial';
  const serviceLabel = isCommercial
    ? SERVICE_DISPLAY_LABELS.commercial
    : calculation.isSpecificAreas
      ? `Specific Areas (${quote.specificHours} Hours Booked)`
      : SERVICE_DISPLAY_LABELS[quote.serviceType] || SERVICE_DISPLAY_LABELS.standard;

  const freqLabel = FREQUENCY_DISPLAY_LABELS[quote.frequency] || quote.frequency;

  const specsLine = isCommercial
    ? 'On-Site Facility Walkthrough Requested'
    : calculation.isSpecificAreas
      ? `${quote.specificHours} Hours Booked • Areas: ${quote.specificAreasText}`
      : `${quote.bedrooms} Bed, ${quote.fullBaths} Full Bath, ${quote.halfBaths} Half Bath • ${quote.sqft.toLocaleString()} sq ft${quote.propertyType ? ` (${quote.propertyType})` : ''}`;

  const addonParts = [];
  if (quote.addons.fridge > 0) addonParts.push(`${quote.addons.fridge}x Single Fridge ($65)`);
  if (quote.addons.fridgeDouble > 0) addonParts.push(`${quote.addons.fridgeDouble}x Double Fridge ($75)`);
  if (quote.addons.oven > 0) addonParts.push(`${quote.addons.oven}x Inside Oven ($80)`);
  if (quote.addons.pets > 0) addonParts.push('Pet Hair & Detailing ($35 flat fee)');
  const addonsLine = addonParts.length > 0 ? addonParts.join(', ') : 'None selected';

  const addInfoLine = isCommercial
    ? 'N/A (Commercial Walkthrough)'
    : `Pets: ${quote.additionalInfo.hasPets === 'yes' ? 'Yes' : 'No'} | Last Cleaned: ${quote.additionalInfo.lastCleaned} | Occupancy: ${quote.additionalInfo.occupancy} | Condition: ${quote.additionalInfo.condition}`;

  const subject = `[Smarts Pro Estimate #${referenceCode}] ${customer.fullName} — ${appointment.preferredDateFormatted} (${appointment.preferredWindowShort})`;

  const textBody = [
    `SMARTS PRO SOLUTIONS — NEW ESTIMATE & APPOINTMENT REQUEST`,
    `Reference ID: ${referenceCode}`,
    `==========================================================`,
    ``,
    `1. CUSTOMER CONTACT INFORMATION`,
    `-------------------------------`,
    `First Name: ${customer.firstName}`,
    `Last Name:  ${customer.lastName}`,
    `Full Name:  ${customer.fullName}`,
    `Phone:      ${customer.phone}`,
    `Email:      ${customer.email}`,
    ``,
    `2. REQUESTED CALENDAR APPOINTMENT`,
    `---------------------------------`,
    `Preferred Date:   ${appointment.preferredDateFormatted} (${appointment.preferredDate})`,
    `Arrival Window:   ${appointment.preferredWindowLabel}`,
    `Business Zone:    ${BUSINESS_TIMEZONE}`,
    ``,
    `3. SERVER-VERIFIED ESTIMATE BREAKDOWN`,
    `-------------------------------------`,
    `Service Selected: ${serviceLabel}`,
    `Property Scope:   ${specsLine}`,
    `Additional Info:  ${addInfoLine}`,
    `Frequency:        ${freqLabel}`,
    `Custom Add-Ons:   ${addonsLine}`,
    `Estimated Total:  $${calculation.grandTotal.toFixed(2)} (Flat Rate • No Online Payment Collected)`,
    ``,
    `4. ADDITIONAL CUSTOMER NOTES`,
    `----------------------------`,
    customer.notes ? customer.notes : 'No additional notes provided by customer.',
    ``,
    `==========================================================`,
    `An iCalendar (.ics) appointment file is attached to add this booking directly to your calendar.`
  ].join('\n');

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #0B1E3A; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
      <div style="background: #0B1E3A; color: #FFFFFF; padding: 20px 24px;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #7CC544; font-weight: 700;">Smarts Pro Solutions • Automated Estimate Dispatch</div>
        <h2 style="margin: 6px 0 0; font-size: 20px;">New Cleaning Estimate &amp; Appointment Request</h2>
        <div style="margin-top: 4px; font-size: 13px; color: #CBD5E1;">Reference: <strong>${escapeHtml(referenceCode)}</strong></div>
      </div>
      <div style="padding: 24px;">
        <h3 style="margin: 0 0 12px; font-size: 15px; color: #0066CC; text-transform: uppercase;">1. Customer Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748B; width: 140px;">First &amp; Last Name:</td><td style="padding: 6px 0; font-weight: 700;">${escapeHtml(customer.fullName)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Phone Number:</td><td style="padding: 6px 0; font-weight: 700;"><a href="tel:${escapeHtml(customer.phone)}">${escapeHtml(customer.phone)}</a></td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Email Address:</td><td style="padding: 6px 0; font-weight: 700;"><a href="mailto:${escapeHtml(customer.email)}">${escapeHtml(customer.email)}</a></td></tr>
        </table>

        <h3 style="margin: 0 0 12px; font-size: 15px; color: #0066CC; text-transform: uppercase;">2. Requested Cleaning Appointment</h3>
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px;">
          <div><strong>Date:</strong> ${escapeHtml(appointment.preferredDateFormatted)}</div>
          <div style="margin-top: 4px;"><strong>Arrival Window:</strong> ${escapeHtml(appointment.preferredWindowLabel)}</div>
        </div>

        <h3 style="margin: 0 0 12px; font-size: 15px; color: #0066CC; text-transform: uppercase;">3. Estimate Summary (Server-Verified Flat Rate)</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748B; width: 140px;">Service Tier:</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(serviceLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Property Scope:</td><td style="padding: 6px 0;">${escapeHtml(specsLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Additional Info:</td><td style="padding: 6px 0;">${escapeHtml(addInfoLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Frequency:</td><td style="padding: 6px 0;">${escapeHtml(freqLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Custom Add-Ons:</td><td style="padding: 6px 0;">${escapeHtml(addonsLine)}</td></tr>
          <tr style="border-top: 2px solid #E2E8F0;"><td style="padding: 10px 0; font-weight: 700;">Estimated Total:</td><td style="padding: 10px 0; font-weight: 800; font-size: 18px; color: #0066CC;">$${calculation.grandTotal.toFixed(2)} <span style="font-size: 12px; color: #64748B; font-weight: 500;">(Flat Rate • No Online Payment)</span></td></tr>
        </table>

        <h3 style="margin: 0 0 8px; font-size: 15px; color: #0066CC; text-transform: uppercase;">4. Additional Customer Notes</h3>
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; font-size: 14px; white-space: pre-wrap;">${escapeHtml(customer.notes || 'No additional notes provided by customer.')}</div>
      </div>
    </div>
  `.trim();

  const icsContent = buildCalendarIcs(validatedRecord, referenceCode, ownerEmail);

  const mailtoUrl =
    `mailto:${encodeURIComponent(ownerEmail)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(textBody)}`;

  return {
    to: ownerEmail,
    replyTo: customer.email,
    subject,
    textBody,
    htmlBody,
    icsFilename: `smartspro-booking-${referenceCode}.ics`,
    icsContent,
    mailtoUrl
  };
}

/**
 * Default server-side email transport using Resend HTTPS API or a signed Google Apps Script / Webhook URL.
 */
async function defaultMailTransport(emailPackage, validatedRecord, referenceCode) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL || 'Smarts Pro Website <onboarding@resend.dev>';
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET || '';

  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [emailPackage.to],
        reply_to: emailPackage.replyTo,
        subject: emailPackage.subject,
        text: emailPackage.textBody,
        html: emailPackage.htmlBody,
        attachments: [
          {
            filename: emailPackage.icsFilename,
            content: Buffer.from(emailPackage.icsContent, 'utf8').toString('base64')
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Mail provider returned HTTP ${response.status}`);
    }
    return { delivered: true, provider: 'resend' };
  }

  if (webhookUrl) {
    const bodyString = JSON.stringify({
      referenceCode,
      to: emailPackage.to,
      replyTo: emailPackage.replyTo,
      subject: emailPackage.subject,
      textBody: emailPackage.textBody,
      htmlBody: emailPackage.htmlBody,
      icsFilename: emailPackage.icsFilename,
      icsContent: emailPackage.icsContent,
      customer: validatedRecord.customer,
      appointment: {
        preferredDate: validatedRecord.appointment.preferredDate,
        preferredDateFormatted: validatedRecord.appointment.preferredDateFormatted,
        preferredWindow: validatedRecord.appointment.preferredWindow,
        preferredWindowLabel: validatedRecord.appointment.preferredWindowLabel
      },
      quote: validatedRecord.quote,
      calculation: validatedRecord.calculation
    });

    const headers = { 'Content-Type': 'application/json' };
    if (webhookSecret) {
      headers['X-SmartsPro-Signature'] = createHmac('sha256', webhookSecret).update(bodyString).digest('hex');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: bodyString
    });
    if (!response.ok) {
      throw new Error(`Email webhook returned HTTP ${response.status}`);
    }
    return { delivered: true, provider: 'webhook' };
  }

  return { delivered: false, reason: 'NO_MAIL_PROVIDER_CONFIGURED' };
}

/**
 * Creates an isolated instance of the Smarts Pro Intake & Calendar Service.
 */
export function createIntakeService({
  mailTransport = null,
  ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || DEFAULT_OWNER_EMAIL,
  rateLimitMax = 5,
  rateLimitWindowMs = 10 * 60 * 1000,
  nowFn = () => new Date()
} = {}) {
  const bookedSlots = new Map(); // key: `${date}|${slotId}` -> { date, slotId, serviceLabel, referenceCode }
  const rateLimits = new Map(); // key -> { count, resetAt }
  const idempotencyStore = new Map(); // key -> { payloadHash, status, body }

  function isSlotBooked(isoDate, slotId) {
    const key = `${isoDate}|${slotId}`;
    if (bookedSlots.has(key)) {
      return bookedSlots.get(key);
    }
    return null;
  }

  function getCalendarAvailability() {
    const now = nowFn();
    const todayIso = getBusinessTodayIso(now);
    const minAdvanceDate = addDaysToIsoDate(todayIso, 1);

    const [curYear, curMonth] = todayIso.split('-').map(Number);
    const nextYear = curMonth === 12 ? curYear + 1 : curYear;
    const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
    const endOfNextMonthIso = getLastDayOfMonthIso(nextYear, nextMonth);
    const maxAdvanceDate = endOfNextMonthIso;

    const availableDates = [];
    const upcomingBookings = [];
    const monthsMap = new Map();

    const curMonthKey = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    monthsMap.set(curMonthKey, {
      monthKey: curMonthKey,
      monthLabel: formatMonthYearLabel(curYear, curMonth),
      isCurrentMonth: true,
      days: []
    });
    monthsMap.set(nextMonthKey, {
      monthKey: nextMonthKey,
      monthLabel: formatMonthYearLabel(nextYear, nextMonth),
      isCurrentMonth: false,
      days: []
    });

    let offset = 1;
    while (offset <= 65) {
      const isoDate = addDaysToIsoDate(todayIso, offset);
      if (isoDate > endOfNextMonthIso) break;

      const dow = getDayOfWeekUtc(isoDate);
      const holidayName = getHolidayNameForIsoDate(isoDate);
      const monthKey = isoDate.slice(0, 7);

      if (dow >= 1 && dow <= 5) {
        const readableDate = formatReadableDate(isoDate);
        const slots = ARRIVAL_WINDOWS.map((win) => {
          if (holidayName) {
            return {
              slotId: win.id,
              label: win.label,
              shortLabel: win.shortLabel,
              status: 'CLOSED_HOLIDAY',
              serviceLabel: `Closed (${holidayName})`
            };
          }
          const booked = isSlotBooked(isoDate, win.id, offset);
          if (booked) {
            upcomingBookings.push({
              date: isoDate,
              dateFormatted: readableDate,
              slotId: win.id,
              slotLabel: win.shortLabel,
              serviceLabel: booked.serviceLabel,
              status: 'BOOKED'
            });
          }
          return {
            slotId: win.id,
            label: win.label,
            shortLabel: win.shortLabel,
            status: booked ? 'BOOKED' : 'AVAILABLE',
            serviceLabel: booked ? booked.serviceLabel : 'Available'
          };
        });

        const openSlotCount = slots.filter((s) => s.status === 'AVAILABLE').length;
        const dayEntry = {
          date: isoDate,
          monthKey,
          dateFormatted: readableDate,
          slots,
          openSlotCount,
          holidayName: holidayName || null,
          withinAdvanceWindow: !holidayName
        };

        if (monthsMap.has(monthKey)) {
          monthsMap.get(monthKey).days.push(dayEntry);
        }

        if (!holidayName) {
          availableDates.push(dayEntry);
        }
      }
      offset++;
    }

    const transportConfigured = Boolean(
      mailTransport || process.env.RESEND_API_KEY || process.env.EMAIL_WEBHOOK_URL
    );

    return {
      timezone: BUSINESS_TIMEZONE,
      businessHours: 'Mon – Fri · 8:00 AM – 5:30 PM',
      todayDate: todayIso,
      minAdvanceDate,
      maxAdvanceDate,
      maxAdvanceDateFormatted: formatReadableDate(maxAdvanceDate),
      paymentPolicy: 'No Online Payment Required • Flat-Rate Estimate Sent to Owner Email',
      intakeConfigured: transportConfigured,
      arrivalWindows: ARRIVAL_WINDOWS,
      availableDates,
      calendarMonths: Array.from(monthsMap.values()),
      upcomingBookings: upcomingBookings.slice(0, 12)
    };
  }

  function checkRateLimit(bucketKey, nowMs) {
    const existing = rateLimits.get(bucketKey);
    if (!existing || nowMs >= existing.resetAt) {
      rateLimits.set(bucketKey, { count: 1, resetAt: nowMs + rateLimitWindowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (existing.count >= rateLimitMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async function processEstimateRequest({ rawBody, headers = {}, clientIp = '127.0.0.1' }) {
    const now = nowFn();
    const nowMs = now.getTime();

    // 1. Browser Origin / Fetch Metadata boundary check
    const secFetchSite = String(headers['sec-fetch-site'] || '').toLowerCase();
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
      return {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'CROSS_SITE_FORBIDDEN', message: 'Cross-site requests are not permitted.' }
      };
    }

    const origin = headers.origin;
    const host = headers.host;
    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host.toLowerCase() !== String(host).toLowerCase()) {
          return {
            status: 403,
            headers: { 'Cache-Control': 'no-store' },
            body: { success: false, code: 'ORIGIN_MISMATCH', message: 'Request origin is not authorized.' }
          };
        }
      } catch {
        return {
          status: 403,
          headers: { 'Cache-Control': 'no-store' },
          body: { success: false, code: 'INVALID_ORIGIN', message: 'Invalid Origin header.' }
        };
      }
    }

    // 2. Content-Type check
    const contentType = String(headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      return {
        status: 415,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json.' }
      };
    }

    // 3. Body size check (16 KiB max)
    const byteLength = Buffer.byteLength(rawBody || '', 'utf8');
    if (byteLength === 0) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'EMPTY_BODY', message: 'Request body cannot be empty.' }
      };
    }
    if (byteLength > MAX_BODY_BYTES) {
      return {
        status: 413,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request exceeds the 16 KiB limit.' }
      };
    }

    // 4. Rate limit by client IP before expensive work
    const ipLimit = checkRateLimit(`ip:${clientIp}`, nowMs);
    if (!ipLimit.allowed) {
      return {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(ipLimit.retryAfterSeconds)
        },
        body: {
          success: false,
          code: 'RATE_LIMITED',
          message: 'Too many estimate requests. Please wait a few minutes or call (318) 564-4360.'
        }
      };
    }

    // 5. Idempotency key validation
    const idempotencyKey = headers['idempotency-key'] ? String(headers['idempotency-key']).trim() : '';
    if (idempotencyKey && !/^[A-Za-z0-9._-]{8,128}$/.test(idempotencyKey)) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Invalid Idempotency-Key header.' }
      };
    }

    const payloadHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
      const existing = idempotencyStore.get(idempotencyKey);
      if (existing.payloadHash !== payloadHash) {
        return {
          status: 409,
          headers: { 'Cache-Control': 'no-store' },
          body: {
            success: false,
            code: 'IDEMPOTENCY_KEY_REUSE',
            message: 'Idempotency key was already used with a different request payload.'
          }
        };
      }
      return {
        status: existing.status,
        headers: { 'Cache-Control': 'no-store', 'X-Idempotent-Replay': 'true' },
        body: existing.body
      };
    }

    // 6. Strict JSON parse
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' }
      };
    }

    // 7. Schema, bounds & authoritative calculation
    const validation = validateEstimateRequest(parsed, { now });
    if (!validation.ok) {
      return {
        status: validation.status,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: validation.code,
          message: validation.error
        }
      };
    }

    const record = validation.value;

    // 8. Per-contact rate limit
    const contactLimit = checkRateLimit(`contact:${record.customer.email}`, nowMs);
    if (!contactLimit.allowed) {
      return {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(contactLimit.retryAfterSeconds)
        },
        body: {
          success: false,
          code: 'RATE_LIMITED',
          message: 'Too many requests for this contact address. Please wait before submitting again.'
        }
      };
    }

    // 9. Calendar slot conflict check (prevent double-booking)
    const todayIso = getBusinessTodayIso(now);
    const dayDiff = Math.round(
      (Date.parse(`${record.appointment.preferredDate}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) /
        (24 * 60 * 60 * 1000)
    );
    const existingBooking = isSlotBooked(
      record.appointment.preferredDate,
      record.appointment.preferredWindow,
      dayDiff
    );
    if (existingBooking) {
      return {
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: 'SLOT_ALREADY_BOOKED',
          message: 'That cleaning arrival window is already booked. Please choose another available date or time window.'
        }
      };
    }

    // 10. Generate opaque server reference ID & email/calendar package
    const referenceCode = `SPS-${randomBytes(5).toString('hex').toUpperCase()}`;
    const emailPackage = buildAutomatedEmailContent(record, referenceCode, ownerEmail);

    // 11. Dispatch via configured server mail transport (fail-closed if not configured)
    const activeTransport = mailTransport || defaultMailTransport;
    let deliveryResult;
    try {
      deliveryResult = await activeTransport(emailPackage, record, referenceCode);
    } catch {
      return {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: 'EMAIL_DISPATCH_FAILED',
          message: 'Automated email delivery encountered a provider error. Please call (318) 564-4360 or use the direct email option below.',
          fallbackMailtoUrl: emailPackage.mailtoUrl,
          icsContent: emailPackage.icsContent,
          icsFilename: emailPackage.icsFilename,
          verifiedEstimate: {
            grandTotal: record.calculation.grandTotal,
            basePrice: record.calculation.basePrice,
            addonsTotal: record.calculation.addonsTotal,
            estimatedHours: record.calculation.estimatedHours,
            pricingModel: record.calculation.pricingModel
          },
          appointment: {
            preferredDate: record.appointment.preferredDate,
            preferredDateFormatted: record.appointment.preferredDateFormatted,
            preferredWindow: record.appointment.preferredWindow,
            preferredWindowLabel: record.appointment.preferredWindowLabel
          }
        }
      };
    }

    if (!deliveryResult || !deliveryResult.delivered) {
      return {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: 'EMAIL_PROVIDER_UNCONFIGURED',
          message: 'Estimate & appointment validated on server. Automated email dispatch is awaiting mail credentials on the host — click below to send your pre-filled estimate email or download the calendar invite.',
          fallbackMailtoUrl: emailPackage.mailtoUrl,
          icsContent: emailPackage.icsContent,
          icsFilename: emailPackage.icsFilename,
          verifiedEstimate: {
            grandTotal: record.calculation.grandTotal,
            basePrice: record.calculation.basePrice,
            addonsTotal: record.calculation.addonsTotal,
            estimatedHours: record.calculation.estimatedHours,
            pricingModel: record.calculation.pricingModel
          },
          appointment: {
            preferredDate: record.appointment.preferredDate,
            preferredDateFormatted: record.appointment.preferredDateFormatted,
            preferredWindow: record.appointment.preferredWindow,
            preferredWindowLabel: record.appointment.preferredWindowLabel
          }
        }
      };
    }

    // 12. Mark slot booked only after verified delivery (atomic in-process reservation)
    const serviceBadge =
      record.quote.serviceCategory === 'commercial'
        ? 'Booked · Commercial Walkthrough'
        : record.quote.serviceCategory === 'moveinout'
          ? 'Booked · Move-In / Move-Out Clean'
          : record.quote.serviceCategory === 'airbnb'
            ? 'Booked · Airbnb Turnover Clean'
            : record.quote.serviceType === 'deep'
              ? 'Booked · Residential Deep Clean'
              : 'Booked · Residential Standard Clean';

    const slotKey = `${record.appointment.preferredDate}|${record.appointment.preferredWindow}`;
    bookedSlots.set(slotKey, {
      date: record.appointment.preferredDate,
      slotId: record.appointment.preferredWindow,
      serviceLabel: serviceBadge,
      status: 'BOOKED',
      referenceCode
    });

    const responseBody = {
      success: true,
      code: 'ESTIMATE_DISPATCHED',
      referenceCode,
      message: `Your estimate and ${record.appointment.preferredDateFormatted} (${record.appointment.preferredWindowShort}) appointment request have been emailed to Smarts Pro Solutions.`,
      verifiedEstimate: {
        grandTotal: record.calculation.grandTotal,
        basePrice: record.calculation.basePrice,
        addonsTotal: record.calculation.addonsTotal,
        estimatedHours: record.calculation.estimatedHours,
        pricingModel: record.calculation.pricingModel
      },
      appointment: {
        preferredDate: record.appointment.preferredDate,
        preferredDateFormatted: record.appointment.preferredDateFormatted,
        preferredWindow: record.appointment.preferredWindow,
        preferredWindowLabel: record.appointment.preferredWindowLabel
      },
      icsContent: emailPackage.icsContent,
      icsFilename: emailPackage.icsFilename
    };

    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, {
        payloadHash,
        status: 200,
        body: responseBody
      });
    }

    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: responseBody
    };
  }

  return Object.freeze({
    getCalendarAvailability,
    processEstimateRequest
  });
}

export const defaultIntakeService = createIntakeService();
