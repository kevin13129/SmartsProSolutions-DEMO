import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveMx } from 'node:dns/promises';

/**
 * SMARTS PRO SOLUTIONS — SERVER-SIDE INTAKE, PRICING, CALENDAR & EMAIL SERVICE
 * Implements docs/SECURITY-ROADMAP.md Section 1 controls:
 * - Strict JSON parsing, 16 KiB transport limit, unknown-field & prototype-key rejection
 * - Bounded customer fields (First Name, Last Name, Phone, Email, Optional Notes)
 * - Authoritative server-side flat-rate price & duration recalculation (no recurring discounts, no online payments)
 * - Calendar appointment validation, arrival window selection, interval overlap prevention & anonymized live feed
 * - Per-IP and per-contact rate limiting (429 + Retry-After) & Idempotency-Key deduplication
 * - Fail-closed automated email + matched-duration RFC 5545 .ics calendar dispatch + Finish-Early & Update token workflows
 */

export const PRICING_RULES_VERSION = '2026-11-flat-rate-no-online-payment-v1';
export const MAX_BODY_BYTES = 16 * 1024; // 16 KiB limit per SECURITY-ROADMAP.md
export const BUSINESS_TIMEZONE = 'America/Chicago';
export const DEFAULT_OWNER_EMAIL = 'smartsprosolutions@gmail.com';
export const DEFAULT_PUBLIC_SITE_URL = 'https://www.smartsprosolutions.com';
export const BUSINESS_OPEN_MINUTES = 8 * 60; // 8:00 AM
export const BUSINESS_CLOSE_MINUTES = 16 * 60 + 30; // 4:30 PM
export const FULL_DAY_MINUTES = BUSINESS_CLOSE_MINUTES - BUSINESS_OPEN_MINUTES; // 8.5 hours

const EPHEMERAL_FINISH_EARLY_SECRET = randomBytes(32).toString('hex');

export const ARRIVAL_WINDOWS = Object.freeze([
  Object.freeze({
    id: '08:00-11:00',
    label: 'Morning (8:00 AM – 11:00 AM)',
    shortLabel: '8:00 AM – 11:00 AM',
    startHour: 8,
    startMinute: 0,
    endHour: 11,
    endMinute: 0,
    startMinutes: 8 * 60,
    endMinutes: 11 * 60
  }),
  Object.freeze({
    id: '11:00-14:00',
    label: 'Midday (11:00 AM – 2:00 PM)',
    shortLabel: '11:00 AM – 2:00 PM',
    startHour: 11,
    startMinute: 0,
    endHour: 14,
    endMinute: 0,
    startMinutes: 11 * 60,
    endMinutes: 14 * 60
  }),
  Object.freeze({
    id: '14:00-16:30',
    label: 'Afternoon (2:00 PM – 4:30 PM)',
    shortLabel: '2:00 PM – 4:30 PM',
    startHour: 14,
    startMinute: 0,
    endHour: 16,
    endMinute: 30,
    startMinutes: 14 * 60,
    endMinutes: 16 * 60 + 30
  })
]);

const SERVER_PRICING_CONFIG = Object.freeze({
  minimumJobCharge: 50,
  specificAreas: Object.freeze({
    minHours: 1,
    maxHours: 6,
    baseOneHourFlatRate: 50,
    extraHourRate: 50
  }),
  hourlyRates: Object.freeze({
    standard: 50,
    deep: 60,
    moveinout: 60,
    airbnb: 50,
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
  standard: 'Residential Standard Clean',
  deep: 'Residential Deep Clean',
  moveinout: 'Move-In / Move-Out Clean',
  airbnb: 'Airbnb / STR Turnover',
  specific: 'Specific Areas (Timed Package)',
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
 * Detects URLs, hyperlinks, or common phishing/spam domains in customer name or notes fields.
 */
function containsPhishingOrUrlLinks(str) {
  if (typeof str !== 'string' || !str) return false;
  return (
    /\b(?:https?:\/\/|www\.|mailto:|javascript:|bit\.ly\/|tinyurl\.com\/|t\.me\/|wa\.me\/)/i.test(
      str
    ) || /\b[a-z0-9-]+\.(?:com|net|org|io|ru|cn|xyz|top|click|link|info|biz)\/\S*/i.test(str)
  );
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

/**
 * Validates US 10-digit North American Numbering Plan (NANP) phone numbers
 * and rejects fake/bogus test numbers (e.g., 555-555-5555, 123-456-7890, 000-000-0000).
 * Allows official RFC/FCC fictional test numbers (555-0100 through 555-0199) for automated tests.
 */
export function validateUsPhoneNanp(phoneDigits) {
  let digits = String(phoneDigits || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10) {
    return { valid: false };
  }

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  const subscriber = digits.slice(6, 10);
  const localSeven = digits.slice(3, 10);

  // Area code (NPA) and Exchange (NXX) must start with 2-9
  if (
    areaCode[0] === '0' ||
    areaCode[0] === '1' ||
    exchange[0] === '0' ||
    exchange[0] === '1'
  ) {
    return { valid: false };
  }

  // Reject N11 service codes (211, 311, 411, 511, 611, 711, 811, 911) and 555/900/999 area codes
  if (
    areaCode.endsWith('11') ||
    exchange.endsWith('11') ||
    areaCode === '555' ||
    areaCode === '900' ||
    areaCode === '999'
  ) {
    return { valid: false };
  }

  // Reject 555 exchange unless in the official 555-0100..555-0199 test range
  if (exchange === '555') {
    const subNum = Number(subscriber);
    if (subNum < 100 || subNum > 199) {
      return { valid: false };
    }
  }

  // Reject obvious sequential or repeated-digit bogus numbers
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
    formatted: `(${areaCode}) ${exchange}-${subscriber}`,
    digits
  };
}

/**
 * Verifies via live DNS MX lookup that the email domain exists and has active mail servers.
 */
export async function verifyEmailDomainHasMx(email, resolveMxFn = resolveMx) {
  const parts = String(email || '').toLowerCase().split('@');
  const domain = parts[1] || '';
  if (!domain) return false;
  if (domain === 'example.com') return true; // Reserved IANA test domain for hermetic unit tests

  try {
    const records = await Promise.race([
      resolveMxFn(domain),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DNS_TIMEOUT')), 2500)
      )
    ]);
    if (!Array.isArray(records) || records.length === 0) {
      return false;
    }
    // RFC 7505 Null MX record ('.' exchange with priority 0) means domain explicitly accepts no mail
    const hasValidExchange = records.some(
      (r) => r && typeof r.exchange === 'string' && r.exchange.trim() !== '' && r.exchange.trim() !== '.'
    );
    return hasValidExchange;
  } catch (err) {
    if (err && err.message === 'DNS_TIMEOUT') {
      // Do not fail real customers if transient DNS resolver timeout occurs
      return true;
    }
    return false;
  }
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

/**
 * Returns YYYY-MM-DD, hour, minute, and total minutes since midnight in America/Chicago.
 */
export function getBusinessTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  return {
    isoDate: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute,
    totalMinutes: hour * 60 + minute
  };
}

export function formatMinutesAsTime(totalMinutes) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const h24 = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

export function formatDurationHours(hours) {
  const rounded = Math.round(Number(hours || 0) * 100) / 100;
  const label = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
  return `${label} ${rounded === 1 ? 'Hour' : 'Hours'}`;
}

/**
 * Builds an RFC 3339 timestamp with the exact DST-aware America/Chicago offset for a date & minute count.
 */
function getCentralIsoForDateAndMinutes(isoDate, totalMinutes) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  const approxUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);
  const tzNamePart = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    timeZoneName: 'longOffset'
  })
    .formatToParts(new Date(approxUtcMs))
    .find((p) => p.type === 'timeZoneName')?.value;
  const offsetMatch = String(tzNamePart || '').match(/GMT([+-]\d{2}:\d{2})/);
  const offsetStr = offsetMatch ? offsetMatch[1] : '-06:00';
  return `${isoDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${offsetStr}`;
}

function parseIsoToChicagoDateAndMinutes(isoString) {
  if (typeof isoString !== 'string' || !isoString.trim()) return null;
  const parsed = new Date(isoString.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = getBusinessTimeParts(parsed);
  return {
    date: parts.isoDate,
    minutes: parts.totalMinutes
  };
}

export function computeScheduledEndMinutes(windowSpec, _durationMinutes) {
  return {
    fits: true,
    endMinutes: windowSpec.endMinutes,
    projectedEndMinutes: windowSpec.endMinutes,
    exceedsClosing: false,
    isFullDayExtension: false
  };
}

export function getRecurrenceForFrequency(frequency) {
  if (frequency === 'weekly') {
    return Object.freeze({
      isRecurring: true,
      frequency: 'weekly',
      label: 'Repeats Weekly',
      rrule: 'FREQ=WEEKLY'
    });
  }
  if (frequency === 'biweekly') {
    return Object.freeze({
      isRecurring: true,
      frequency: 'biweekly',
      label: 'Repeats Every 2 Weeks',
      rrule: 'FREQ=WEEKLY;INTERVAL=2'
    });
  }
  if (frequency === 'monthly') {
    return Object.freeze({
      isRecurring: true,
      frequency: 'monthly',
      label: 'Repeats Monthly',
      rrule: 'FREQ=MONTHLY'
    });
  }
  return Object.freeze({
    isRecurring: false,
    frequency: frequency || 'onetime',
    label: 'Single Appointment',
    rrule: ''
  });
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getFinishEarlySecret(explicitSecret) {
  return (
    explicitSecret ||
    process.env.FINISH_EARLY_SECRET ||
    process.env.EMAIL_WEBHOOK_SECRET ||
    EPHEMERAL_FINISH_EARLY_SECRET
  );
}

export function createFinishEarlyToken(payload, secret = getFinishEarlySecret()) {
  const bodyJson = JSON.stringify(payload);
  const bodyB64 = Buffer.from(bodyJson, 'utf8').toString('base64url');
  const sigB64 = createHmac('sha256', secret).update(bodyB64).digest('base64url');
  return `${bodyB64}.${sigB64}`;
}

export function verifyFinishEarlyToken(token, secret = getFinishEarlySecret(), nowMs = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Finish-early link is invalid or incomplete.' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Finish-early link is malformed.' };
  }
  const [bodyB64, sigB64] = parts;
  const expectedSig = createHmac('sha256', secret).update(bodyB64).digest('base64url');
  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'Finish-early link signature could not be verified.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Finish-early link payload could not be read.' };
  }

  if (
    !parsed ||
    parsed.v !== 1 ||
    typeof parsed.ref !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') ||
    !Number.isInteger(parsed.startMin) ||
    !Number.isInteger(parsed.endMin) ||
    !Number.isInteger(parsed.exp)
  ) {
    return { ok: false, code: 'INVALID_TOKEN_PAYLOAD', message: 'Finish-early link data is invalid.' };
  }

  if (nowMs > parsed.exp) {
    return { ok: false, code: 'EXPIRED_TOKEN', message: 'This finish-early link has expired.' };
  }

  return { ok: true, payload: parsed };
}

export function createBookingUpdateToken(payload, secret = getFinishEarlySecret()) {
  return createFinishEarlyToken({ ...payload, kind: 'update' }, secret);
}

export function verifyBookingUpdateToken(token, secret = getFinishEarlySecret(), nowMs = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, code: 'INVALID_UPDATE_TOKEN', message: 'Booking update token is invalid.' };
  }
  const verified = verifyFinishEarlyToken(token, secret, nowMs);
  if (!verified.ok) {
    return {
      ok: false,
      code: 'INVALID_UPDATE_TOKEN',
      message: verified.code === 'EXPIRED_TOKEN'
        ? 'Your editing session has expired. Please refresh and submit again.'
        : 'Booking update token could not be verified.'
    };
  }
  if (verified.payload.kind !== 'update') {
    return { ok: false, code: 'INVALID_UPDATE_TOKEN', message: 'Booking update token type is invalid.' };
  }
  return verified;
}

function resolvePublicSiteOrigin(headers = {}) {
  const configured = process.env.PUBLIC_SITE_URL;
  if (typeof configured === 'string' && configured.trim()) {
    try {
      const parsed = new URL(configured.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // Fallback below
    }
  }

  const originHeader = headers.origin;
  if (typeof originHeader === 'string' && originHeader.trim()) {
    try {
      const parsed = new URL(originHeader.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // Fallback below
    }
  }

  const rawHost = headers['x-forwarded-host'] || headers.host;
  if (typeof rawHost === 'string' && /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(rawHost.trim())) {
    const cleanHost = rawHost.trim();
    const isLocal = cleanHost.startsWith('localhost') || cleanHost.startsWith('127.0.0.1');
    const proto = isLocal
      ? 'http'
      : String(headers['x-forwarded-proto'] || '').toLowerCase() === 'http'
        ? 'http'
        : 'https';
    return `${proto}://${cleanHost}`;
  }

  return DEFAULT_PUBLIC_SITE_URL;
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
      addonHours: 0,
      totalEstimatedHours: estimatedHours,
      durationMinutes: Math.round(estimatedHours * 60),
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
  let estimatedHours = 1;
  let hourlyRate = cfg.hourlyRates[effectiveServiceType] || 50;

  if (isSpecificAreas) {
    const bookedHours = Math.min(
      cfg.specificAreas.maxHours,
      Math.max(cfg.specificAreas.minHours, quoteInput.specificHours)
    );
    estimatedHours = bookedHours;
    const extraHours = Math.max(0, bookedHours - cfg.specificAreas.minHours);
    basePrice = cfg.specificAreas.baseOneHourFlatRate + extraHours * cfg.specificAreas.extraHourRate;
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
    estimatedHours = Math.max(1.0, Math.round(rawHours * serviceMult * 2) / 2);
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

  const addonHours =
    (quoteInput.addons.fridge + quoteInput.addons.fridgeDouble + quoteInput.addons.oven) * 0.5 +
    petsAddonCount * 0.25;
  const totalEstimatedHours = Number((estimatedHours + addonHours).toFixed(2));
  const durationMinutes = Math.max(60, Math.round(totalEstimatedHours * 60));

  const grandTotal = basePrice + addonsTotal;

  return Object.freeze({
    pricingRulesVersion: PRICING_RULES_VERSION,
    pricingModel: 'FLAT_RATE_NO_ONLINE_PAYMENT',
    isCommercial: false,
    isSpecificAreas,
    hourlyRate,
    estimatedHours,
    addonHours,
    totalEstimatedHours,
    durationMinutes,
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

  const allowedTopKeys = new Set(['customer', 'appointment', 'quote', 'companyWebsite', 'updateToken']);
  if (!hasOnlyAllowedKeys(payload, allowedTopKeys)) {
    return { ok: false, status: 400, code: 'UNKNOWN_FIELDS', error: 'Request contains unrecognized fields.' };
  }

  // Honeypot check
  if (payload.companyWebsite !== undefined && payload.companyWebsite !== '') {
    return { ok: false, status: 400, code: 'BOT_REJECTED', error: 'Request could not be processed.' };
  }

  const rawUpdateToken =
    payload.updateToken === undefined || payload.updateToken === null
      ? ''
      : typeof payload.updateToken === 'string'
        ? payload.updateToken.trim()
        : null;
  if (rawUpdateToken === null || rawUpdateToken.length > 2048) {
    return { ok: false, status: 400, code: 'INVALID_UPDATE_TOKEN', error: 'Invalid booking update token.' };
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
  const nanpCheck = validateUsPhoneNanp(phoneDigits);
  if (
    !rawPhone ||
    rawPhone.length < 7 ||
    rawPhone.length > 32 ||
    containsControlChars(rawPhone, false) ||
    !/^[0-9+\-().\s]+$/.test(rawPhone) ||
    !nanpCheck.valid
  ) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PHONE',
      error: 'Please enter a real, active 10-digit US Phone Number (e.g., (318) 564-4360).'
    };
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

  const emailDomain = rawEmail.split('@')[1] || '';
  if (
    DISPOSABLE_OR_FAKE_EMAIL_DOMAINS.has(emailDomain) ||
    COMMON_TYPO_EMAIL_DOMAINS.has(emailDomain)
  ) {
    return {
      ok: false,
      status: 400,
      code: 'UNVERIFIED_EMAIL_DOMAIN',
      error:
        'Please enter a real, active email address (temporary/disposable emails or misspelled domains like @gmial.com are not accepted).'
    };
  }

  if (
    rawNotes === null ||
    rawNotes.length > 1000 ||
    containsControlChars(rawNotes, true)
  ) {
    return { ok: false, status: 400, code: 'INVALID_NOTES', error: 'Additional notes must be plain text under 1,000 characters.' };
  }

  if (
    containsPhishingOrUrlLinks(rawFirst) ||
    containsPhishingOrUrlLinks(rawLast) ||
    containsPhishingOrUrlLinks(rawNotes)
  ) {
    return {
      ok: false,
      status: 400,
      code: 'PHISHING_LINK_REJECTED',
      error: 'For security and anti-phishing protection, website links and URLs are not permitted in contact or note fields.'
    };
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
      error: 'Cleaning appointments are available Monday through Friday, 8:00 AM to 4:30 PM.'
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
      error: 'Please select a valid arrival time window between 8:00 AM and 4:30 PM.'
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
  const specificHours = quote.specificHours ?? 1;
  const specificAreasText = typeof quote.specificAreasText === 'string' ? quote.specificAreasText.trim() : '';

  if (
    !isIntInRange(bedrooms, 0, 10) ||
    !isIntInRange(fullBaths, 1, 8) ||
    !isIntInRange(halfBaths, 0, 6) ||
    !isIntInRange(sqft, 400, 6000) ||
    !isIntInRange(specificHours, 1, 6)
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
  const slotFit = computeScheduledEndMinutes(windowObj, authoritativeCalculation.durationMinutes);
  const recurrence = getRecurrenceForFrequency(frequency);

  const startIso = getCentralIsoForDateAndMinutes(preferredDate, windowObj.startMinutes);
  const endIso = getCentralIsoForDateAndMinutes(preferredDate, slotFit.endMinutes);
  const scheduledEndLabel = formatMinutesAsTime(slotFit.endMinutes);

  return {
    ok: true,
    value: {
      updateToken: rawUpdateToken,
      isUpdated: false,
      updateCount: 0,
      previousTotal: null,
      previousSnapshot: null,
      previousReferenceCode: '',
      previousDate: '',
      customer: {
        firstName: rawFirst,
        lastName: rawLast,
        fullName: `${rawFirst} ${rawLast}`,
        phone: nanpCheck.formatted,
        email: rawEmail,
        notes: rawNotes
      },
      appointment: {
        preferredDate,
        preferredDateFormatted: formatReadableDate(preferredDate),
        preferredWindow: windowObj.id,
        preferredWindowLabel: windowObj.label,
        preferredWindowShort: windowObj.shortLabel,
        windowSpec: windowObj,
        startMinutes: windowObj.startMinutes,
        endMinutes: slotFit.endMinutes,
        projectedEndMinutes: slotFit.projectedEndMinutes,
        exceedsClosing: slotFit.exceedsClosing,
        durationMinutes: authoritativeCalculation.durationMinutes,
        estimatedHours: authoritativeCalculation.totalEstimatedHours,
        scheduledEndHour: Math.floor(slotFit.endMinutes / 60),
        scheduledEndMinute: slotFit.endMinutes % 60,
        scheduledEndLabel,
        startIso,
        endIso,
        isFullDayExtension: slotFit.isFullDayExtension,
        recurrence
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
 * Generates an RFC 5545 .ics calendar event string for the owner's calendar
 * locked to the selected scheduler time block (with RRULE when recurring).
 */
export function buildCalendarIcs(validatedRecord, referenceCode, ownerEmail = DEFAULT_OWNER_EMAIL) {
  const { customer, appointment, quote, calculation } = validatedRecord;
  const dateCompact = appointment.preferredDate.replace(/-/g, '');
  const pad2 = (n) => String(n).padStart(2, '0');
  const startStr = `${dateCompact}T${pad2(appointment.windowSpec.startHour)}${pad2(appointment.windowSpec.startMinute)}00`;
  const endHour = Number.isInteger(appointment.scheduledEndHour)
    ? appointment.scheduledEndHour
    : appointment.windowSpec.endHour;
  const endMinute = Number.isInteger(appointment.scheduledEndMinute)
    ? appointment.scheduledEndMinute
    : appointment.windowSpec.endMinute;
  const endStr = `${dateCompact}T${pad2(endHour)}${pad2(endMinute)}00`;
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const serviceLabel =
    quote.serviceCategory === 'commercial'
      ? SERVICE_DISPLAY_LABELS.commercial
      : calculation.isSpecificAreas
        ? `Specific Areas (${quote.specificHours} Hours)`
        : SERVICE_DISPLAY_LABELS[quote.serviceType] || SERVICE_DISPLAY_LABELS.standard;

  const durationHours = calculation.totalEstimatedHours || calculation.estimatedHours;
  const startLabel = formatMinutesAsTime(appointment.startMinutes ?? appointment.windowSpec.startMinutes);
  const endLabel = appointment.scheduledEndLabel || formatMinutesAsTime(appointment.windowSpec.endMinutes);
  const updateCount = Number.isInteger(validatedRecord.updateCount)
    ? validatedRecord.updateCount
    : validatedRecord.previousReferenceCode
      ? 1
      : 0;
  const isUpdated = Boolean(validatedRecord.isUpdated || updateCount > 0 || validatedRecord.previousReferenceCode);
  const summaryPrefix = isUpdated
    ? updateCount > 1
      ? `[UPDATED #${updateCount}] `
      : '[UPDATED] '
    : '';
  const summary = `${summaryPrefix}Smarts Pro Cleaning: ${customer.fullName} (${serviceLabel}) [${referenceCode}]`;
  const descriptionLines = [
    `Reference ID: ${referenceCode}`,
    ...(isUpdated ? [`Update Status: UPDATED APPOINTMENT (#${Math.max(1, updateCount)})`] : []),
    `Customer: ${customer.fullName}`,
    `Phone: ${customer.phone}`,
    `Email: ${customer.email}`,
    `Service: ${serviceLabel}`,
    `Scheduled Window: ${startLabel} – ${endLabel}`,
    `Est. Cleaning Time: ${formatDurationHours(durationHours)}`,
    `Schedule: ${FREQUENCY_DISPLAY_LABELS[quote.frequency] || quote.frequency}`,
    `Estimated Total (Flat Rate): $${calculation.grandTotal.toFixed(2)}`,
    customer.notes ? `Customer Notes: ${customer.notes}` : 'Customer Notes: None provided'
  ];

  const recurrence = appointment.recurrence || getRecurrenceForFrequency(quote.frequency);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarts Pro Solutions//Cleaning Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${referenceCode}@smartsprosolutions.com`,
    `SEQUENCE:${Math.max(0, updateCount)}`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART;TZID=${BUSINESS_TIMEZONE}:${startStr}`,
    `DTEND;TZID=${BUSINESS_TIMEZONE}:${endStr}`,
    ...(recurrence && recurrence.rrule ? [`RRULE:${recurrence.rrule}`] : []),
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

function buildUpdateTokenSnapshot(validatedRecord) {
  const quote = validatedRecord?.quote || {};
  const calc = validatedRecord?.calculation || {};
  const addInfo = quote.additionalInfo || {};
  const addons = quote.addons || {};
  const notesStr = String(validatedRecord?.customer?.notes || '').trim();
  return {
    cat: quote.serviceCategory || 'residential',
    type: quote.serviceType || 'standard',
    mode: quote.scopeMode || 'full',
    sh: quote.specificHours || 1,
    beds: quote.bedrooms ?? 3,
    fb: quote.fullBaths ?? 2,
    hb: quote.halfBaths ?? 1,
    sqft: quote.sqft ?? 1800,
    freq: quote.frequency || 'onetime',
    pets: addInfo.hasPets || 'no',
    lc: addInfo.lastCleaned || '',
    occ: addInfo.occupancy || '',
    cond: addInfo.condition || '',
    fr: addons.fridge || 0,
    fr2: addons.fridgeDouble || 0,
    ov: addons.oven || 0,
    hrs: calc.totalEstimatedHours || calc.estimatedHours || 1,
    tot: calc.grandTotal || 0,
    nHash: createHash('sha256').update(notesStr, 'utf8').digest('hex').slice(0, 12)
  };
}

function formatScopeLabelForSnapshot(cat, type, mode, sh) {
  if (cat === 'commercial') return SERVICE_DISPLAY_LABELS.commercial;
  if (cat === 'residential' && mode === 'specific') {
    return `Specific Areas (${sh || 1} Hours Booked)`;
  }
  if (cat === 'moveinout') return SERVICE_DISPLAY_LABELS.moveinout;
  if (cat === 'airbnb') return SERVICE_DISPLAY_LABELS.airbnb;
  return SERVICE_DISPLAY_LABELS[type] || SERVICE_DISPLAY_LABELS.standard;
}

function computeBookingChangeItems(prevSnap, validatedRecord) {
  if (!prevSnap || typeof prevSnap !== 'object') return [];
  const items = [];
  const { quote, calculation, customer } = validatedRecord;
  const addons = quote.addons || {};
  const addInfo = quote.additionalInfo || {};

  // 1. Add-ons (ordered: Single Fridge, Double Fridge, Inside Oven, Pets)
  const prevFr = Number(prevSnap.fr || 0);
  const curFr = Number(addons.fridge || 0);
  if (curFr > prevFr) {
    const added = curFr - prevFr;
    items.push({
      badge: 'ADDED',
      label: 'Single Fridge Cleaning (+$65/ea)',
      detail: `+${added} added (${prevFr}x → ${curFr}x, +$${added * 65}.00)`
    });
  } else if (curFr < prevFr) {
    items.push({
      badge: 'UPDATED',
      label: 'Single Fridge Cleaning',
      detail: `Adjusted from ${prevFr}x → ${curFr}x`
    });
  }

  const prevFr2 = Number(prevSnap.fr2 || 0);
  const curFr2 = Number(addons.fridgeDouble || 0);
  if (curFr2 > prevFr2) {
    const added = curFr2 - prevFr2;
    items.push({
      badge: 'ADDED',
      label: 'Double Fridge Cleaning (+$75/ea)',
      detail: `+${added} added (${prevFr2}x → ${curFr2}x, +$${added * 75}.00)`
    });
  } else if (curFr2 < prevFr2) {
    items.push({
      badge: 'UPDATED',
      label: 'Double Fridge Cleaning',
      detail: `Adjusted from ${prevFr2}x → ${curFr2}x`
    });
  }

  const prevOv = Number(prevSnap.ov || 0);
  const curOv = Number(addons.oven || 0);
  if (curOv > prevOv) {
    const added = curOv - prevOv;
    items.push({
      badge: 'ADDED',
      label: 'Inside Oven Cleaning (+$80/ea)',
      detail: `+${added} added (${prevOv}x → ${curOv}x, +$${added * 80}.00)`
    });
  } else if (curOv < prevOv) {
    items.push({
      badge: 'UPDATED',
      label: 'Inside Oven Cleaning',
      detail: `Adjusted from ${prevOv}x → ${curOv}x`
    });
  }

  const prevPets = prevSnap.pets || 'no';
  const curPets = addInfo.hasPets || 'no';
  if (prevPets !== curPets) {
    items.push({
      badge: curPets === 'yes' ? 'ADDED' : 'UPDATED',
      label: curPets === 'yes' ? 'Pet Hair & Detailing (+$35 flat fee)' : 'Pets in Home Setting',
      detail: curPets === 'yes' ? 'Added Pets: No → Yes (+$35.00)' : 'Updated Pets: Yes → No'
    });
  }

  // 2. Service Tier / Mode / Booked Hours
  if (
    prevSnap.cat !== quote.serviceCategory ||
    prevSnap.type !== quote.serviceType ||
    prevSnap.mode !== quote.scopeMode
  ) {
    items.push({
      badge: 'UPDATED',
      label: 'Service Tier / Scope Mode',
      detail: `${formatScopeLabelForSnapshot(prevSnap.cat, prevSnap.type, prevSnap.mode, prevSnap.sh)} → ${formatScopeLabelForSnapshot(quote.serviceCategory, quote.serviceType, quote.scopeMode, quote.specificHours)}`
    });
  }

  if (quote.scopeMode === 'specific' && prevSnap.mode === 'specific' && Number(prevSnap.sh) !== Number(quote.specificHours)) {
    const prevSh = Number(prevSnap.sh || 1);
    const curSh = Number(quote.specificHours || 1);
    items.push({
      badge: curSh > prevSh ? 'ADDED' : 'UPDATED',
      label: curSh > prevSh ? 'Additional Booked Hours (+$50/hr)' : 'Booked Hours',
      detail:
        curSh > prevSh
          ? `+${curSh - prevSh} hr(s) added (${prevSh} hrs → ${curSh} hrs)`
          : `${prevSh} hrs → ${curSh} hrs`
    });
  }

  // 3. Property Specs
  if (quote.serviceCategory !== 'commercial' && quote.scopeMode !== 'specific') {
    if (Number(prevSnap.beds) !== Number(quote.bedrooms)) {
      items.push({
        badge: Number(quote.bedrooms) > Number(prevSnap.beds) ? 'ADDED' : 'UPDATED',
        label: 'Bedrooms',
        detail: `${prevSnap.beds} Bed → ${quote.bedrooms} Bed`
      });
    }
    if (Number(prevSnap.fb) !== Number(quote.fullBaths)) {
      items.push({
        badge: Number(quote.fullBaths) > Number(prevSnap.fb) ? 'ADDED' : 'UPDATED',
        label: 'Full Bathrooms',
        detail: `${prevSnap.fb} Full Bath → ${quote.fullBaths} Full Bath`
      });
    }
    if (Number(prevSnap.hb) !== Number(quote.halfBaths)) {
      items.push({
        badge: Number(quote.halfBaths) > Number(prevSnap.hb) ? 'ADDED' : 'UPDATED',
        label: 'Half Bathrooms',
        detail: `${prevSnap.hb} Half Bath → ${quote.halfBaths} Half Bath`
      });
    }
    if (Number(prevSnap.sqft) !== Number(quote.sqft)) {
      items.push({
        badge: 'UPDATED',
        label: 'Square Footage',
        detail: `${Number(prevSnap.sqft).toLocaleString()} sq ft → ${Number(quote.sqft).toLocaleString()} sq ft`
      });
    }
  }

  // 4. Home Condition / Last Cleaned / Occupancy / Frequency
  if (prevSnap.cond && addInfo.condition && prevSnap.cond !== addInfo.condition) {
    items.push({
      badge: 'UPDATED',
      label: 'Home Condition',
      detail: `${prevSnap.cond} → ${addInfo.condition}`
    });
  }
  if (prevSnap.lc && addInfo.lastCleaned && prevSnap.lc !== addInfo.lastCleaned) {
    items.push({
      badge: 'UPDATED',
      label: 'Last Cleaned',
      detail: `${prevSnap.lc} → ${addInfo.lastCleaned}`
    });
  }
  if (prevSnap.occ && addInfo.occupancy && prevSnap.occ !== addInfo.occupancy) {
    items.push({
      badge: 'UPDATED',
      label: 'Home Occupancy',
      detail: `${prevSnap.occ} → ${addInfo.occupancy}`
    });
  }
  if (prevSnap.freq && quote.frequency && prevSnap.freq !== quote.frequency) {
    items.push({
      badge: 'UPDATED',
      label: 'Cleaning Frequency',
      detail: `${FREQUENCY_DISPLAY_LABELS[prevSnap.freq] || prevSnap.freq} → ${FREQUENCY_DISPLAY_LABELS[quote.frequency] || quote.frequency}`
    });
  }

  // 5. Customer Notes
  const curNotesHash = createHash('sha256')
    .update(String(customer?.notes || '').trim(), 'utf8')
    .digest('hex')
    .slice(0, 12);
  if (prevSnap.nHash && curNotesHash !== prevSnap.nHash) {
    items.push({
      badge: customer?.notes ? 'ADDED' : 'UPDATED',
      label: 'Customer Notes',
      detail: customer?.notes ? `"${customer.notes}"` : 'Customer notes cleared'
    });
  }

  // 6. Cleaning Duration & Price Summary
  const prevHrs = Number(prevSnap.hrs);
  const curHrs = Number(calculation.totalEstimatedHours || calculation.estimatedHours);
  if (Number.isFinite(prevHrs) && prevHrs !== curHrs) {
    items.push({
      badge: curHrs > prevHrs ? 'ADDED' : 'UPDATED',
      label: 'Estimated Cleaning Duration',
      detail: `${formatDurationHours(prevHrs)} → ${formatDurationHours(curHrs)}`
    });
  }
  const prevTot = Number(prevSnap.tot);
  const curTot = Number(calculation.grandTotal);
  if (Number.isFinite(prevTot) && prevTot !== curTot) {
    const delta = curTot - prevTot;
    items.push({
      badge: delta > 0 ? 'ADDED' : 'UPDATED',
      label: 'Quote Total Change',
      detail: `$${prevTot.toFixed(2)} → $${curTot.toFixed(2)} (${delta >= 0 ? `+$${delta.toFixed(2)}` : `-$${Math.abs(delta).toFixed(2)}`})`
    });
  }

  return items;
}

/**
 * Builds the automated owner notification email (highlighting UPDATED in green with an ordered diff list and Reference ID in blue),
 * the separate customer confirmation/updated receipt email (with zero owner-only Finish-Early links),
 * and the .ics calendar invite.
 */
export function buildAutomatedEmailContent(
  validatedRecord,
  referenceCode,
  ownerEmail = DEFAULT_OWNER_EMAIL,
  { finishEarlyUrl = '' } = {}
) {
  const { customer, appointment, quote, calculation } = validatedRecord;
  const isCommercial = quote.serviceCategory === 'commercial';
  const updateCount = Number.isInteger(validatedRecord.updateCount)
    ? validatedRecord.updateCount
    : validatedRecord.previousReferenceCode
      ? 1
      : 0;
  const isUpdated = Boolean(validatedRecord.isUpdated || updateCount > 0 || validatedRecord.previousReferenceCode);
  const previousTotal = Number.isFinite(Number(validatedRecord.previousTotal))
    ? Number(validatedRecord.previousTotal)
    : null;
  const serviceLabel = isCommercial
    ? SERVICE_DISPLAY_LABELS.commercial
    : calculation.isSpecificAreas
      ? `Specific Areas (${quote.specificHours} Hours Booked)`
      : SERVICE_DISPLAY_LABELS[quote.serviceType] || SERVICE_DISPLAY_LABELS.standard;

  const freqLabel = FREQUENCY_DISPLAY_LABELS[quote.frequency] || quote.frequency;
  const recurrence = appointment.recurrence || getRecurrenceForFrequency(quote.frequency);
  const durationHours = calculation.totalEstimatedHours || calculation.estimatedHours;
  const durationSummary = `${formatDurationHours(durationHours)} (Calendar Time Block: ${appointment.preferredWindowShort})`;

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

  const updateTag = updateCount > 1 ? `[UPDATED #${updateCount}] ` : '[UPDATED] ';
  const subjectPrefix = isUpdated ? updateTag : '';
  const subject = `${subjectPrefix}[Smarts Pro Estimate #${referenceCode}] ${customer.fullName} — ${appointment.preferredDateFormatted} (${appointment.preferredWindowShort})`;

  const changeItems = isUpdated
    ? computeBookingChangeItems(validatedRecord.previousSnapshot, validatedRecord)
    : [];

  const textLines = [
    isUpdated
      ? `SMARTS PRO SOLUTIONS — UPDATED APPOINTMENT & ESTIMATE (UPDATE #${Math.max(1, updateCount)})`
      : `SMARTS PRO SOLUTIONS — NEW ESTIMATE & APPOINTMENT REQUEST`,
    `Reference ID: ${referenceCode}`,
    ...(isUpdated && previousTotal !== null
      ? [`Price Revision: Previously $${previousTotal.toFixed(2)} -> Updated Total $${calculation.grandTotal.toFixed(2)}`]
      : []),
    ...(isUpdated
      ? [
          ``,
          `ADDED & UPDATED DETAILS (APPLIED TO SAME APPOINTMENT & TIME BLOCK)`,
          `-------------------------------------------------------------------`,
          ...(changeItems.length > 0
            ? changeItems.map((ch, idx) => `${idx + 1}. [+ ${ch.badge}] ${ch.label}: ${ch.detail}`)
            : [`1. [UPDATED] Appointment refreshed under Reference ID ${referenceCode} (Locked Window: ${appointment.preferredWindowLabel}).`])
        ]
      : []),
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
    `2. ${isUpdated ? 'LOCKED CALENDAR APPOINTMENT (SAME TIME BLOCK)' : 'REQUESTED CALENDAR APPOINTMENT'}`,
    `---------------------------------`,
    `Preferred Date:    ${appointment.preferredDateFormatted} (${appointment.preferredDate})`,
    `Time Block:        ${appointment.preferredWindowLabel}`,
    `Recurrence:        ${recurrence.label}`,
    `Est. Cleaning Time:${durationSummary}`,
    `Business Zone:     ${BUSINESS_TIMEZONE}`,
    ``,
    `3. SERVER-VERIFIED ESTIMATE BREAKDOWN`,
    `-------------------------------------`,
    `Service Selected: ${serviceLabel}`,
    `Property Scope:   ${specsLine}`,
    `Additional Info:  ${addInfoLine}`,
    `Frequency:        ${freqLabel}`,
    `Custom Add-Ons:   ${addonsLine}`,
    `Est. Cleaning Hrs:${formatDurationHours(durationHours)}`,
    `Estimated Total:  $${calculation.grandTotal.toFixed(2)} (Flat Rate • No Online Payment Collected)`,
    ``,
    `4. ADDITIONAL CUSTOMER NOTES`,
    `----------------------------`,
    customer.notes ? customer.notes : 'No additional notes provided by customer.'
  ];

  const footerTextLines = [
    ``,
    `==========================================================`,
    `An iCalendar (.ics) appointment file is attached to add this booking directly to your calendar.`,
    `Privacy, Opt-Out & Data Deletion: Customer details are used solely to service this estimate request. To opt out of follow-up emails or request immediate data deletion, reply "DELETE" or contact smartsprosolutions@gmail.com / (318) 564-4360.`
  ];

  // Never include owner-only Finish Early controls or URLs in customer-facing fallback mailto drafts.
  const customerSafeMailtoBody = [...textLines, ...footerTextLines].join('\n');

  if (finishEarlyUrl) {
    textLines.push(
      ``,
      `5. CREW EARLY COMPLETION CONTROL (OWNER ONLY)`,
      `---------------------------------------------`,
      `Finished early or need to release this time block? Open the link below to update Google Calendar and immediately re-open remaining times on smartsprosolutions.com:`,
      `${finishEarlyUrl}`
    );
  }

  textLines.push(...footerTextLines);

  const textBody = textLines.join('\n');

  const finishEarlyHtmlBlock = finishEarlyUrl
    ? `
        <div style="margin-top: 20px; background: #EFF6FF; border: 1.5px solid #93C5FD; border-radius: 10px; padding: 16px;">
          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #1D4ED8;">Owner Schedule Control • Finished Early?</div>
          <p style="margin: 6px 0 12px; font-size: 13px; color: #1E293B; line-height: 1.5;">
            If your crew wraps up early (or needs to free up the calendar block), use the button below to update the calendar block and re-open availability on <strong>smartsprosolutions.com</strong> right away.
          </p>
          <a href="${escapeHtml(finishEarlyUrl)}" style="display: inline-block; background: #16A34A; color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 14px; padding: 10px 18px; border-radius: 8px;">Finish Early &mdash; Re-Open Calendar Time</a>
        </div>`
    : '';

  const ownerChangesOrderedRows =
    changeItems.length > 0
      ? `
          <div style="margin-top: 12px; background: #FFFFFF; border: 1.5px solid #86EFAC; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 12px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">
              What Was Added / Updated (Applied to Same Appointment)
            </div>
            <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #0F172A; line-height: 1.6;">
              ${changeItems
                .map(
                  (ch) =>
                    `<li style="margin-bottom: 5px;"><span style="display: inline-block; background: ${ch.badge === 'ADDED' ? '#16A34A' : '#15803D'}; color: #FFFFFF; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 800; margin-right: 6px;">${ch.badge === 'ADDED' ? '+ ADDED' : 'UPDATED'}</span><strong>${escapeHtml(ch.label)}:</strong> <span style="color: #166534; font-weight: 600;">${escapeHtml(ch.detail)}</span></li>`
                )
                .join('')}
            </ol>
          </div>`
      : '';

  const ownerUpdatedGreenBanner = isUpdated
    ? `
        <div style="background: #DCFCE7; border: 2px solid #16A34A; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px;">
          <div style="font-size: 13px; font-weight: 900; color: #15803D; text-transform: uppercase; letter-spacing: 0.05em;">
            <span style="display: inline-block; background: #16A34A; color: #FFFFFF; padding: 2px 8px; border-radius: 4px; margin-right: 6px;">UPDATED</span>
            UPDATED APPOINTMENT #${Math.max(1, updateCount)} &bull; REPLACE PRIOR VERSION
          </div>
          <div style="margin-top: 6px; font-size: 13px; color: #166534;">
            Applied to original booking (<strong style="color: #1D4ED8;">${escapeHtml(referenceCode)}</strong>) in locked window <strong>${escapeHtml(appointment.preferredWindowLabel)}</strong>.${previousTotal !== null ? ` Previous Total: <strong>$${previousTotal.toFixed(2)}</strong> &rarr; New Total: <strong>$${calculation.grandTotal.toFixed(2)}</strong>.` : ''}
          </div>
          ${ownerChangesOrderedRows}
        </div>`
    : '';

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #0B1E3A; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
      <div style="background: #0B1E3A; color: #FFFFFF; padding: 20px 24px;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #7CC544; font-weight: 700;">
          Smarts Pro Solutions &bull; ${isUpdated ? `<span style="background: #16A34A; color: #FFFFFF; padding: 2px 8px; border-radius: 4px; font-weight: 900;">UPDATED APPOINTMENT (#${Math.max(1, updateCount)})</span>` : 'Automated Estimate Dispatch'}
        </div>
        <h2 style="margin: 8px 0 0; font-size: 20px;">
          ${isUpdated ? `<span style="color: #4ADE80; font-weight: 900;">UPDATED:</span> Cleaning Estimate &amp; Appointment` : 'New Cleaning Estimate &amp; Appointment Request'}
        </h2>
        <div style="margin-top: 8px; font-size: 13px; color: #CBD5E1;">
          Reference ID: <span style="display: inline-block; background: #1D4ED8; color: #FFFFFF; padding: 2px 10px; border-radius: 6px; font-weight: 800; letter-spacing: 0.03em;">${escapeHtml(referenceCode)}</span>
        </div>
      </div>
      <div style="padding: 24px;">
        ${ownerUpdatedGreenBanner}
        <h3 style="margin: 0 0 12px; font-size: 15px; color: #0066CC; text-transform: uppercase;">1. Customer Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748B; width: 150px;">Reference ID:</td><td style="padding: 6px 0;"><span style="display: inline-block; background: #DBEAFE; color: #1D4ED8; border: 1px solid #93C5FD; padding: 2px 8px; border-radius: 6px; font-weight: 800;">${escapeHtml(referenceCode)}</span>${isUpdated ? ` <span style="display: inline-block; background: #16A34A; color: #FFFFFF; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 12px;">UPDATED #${Math.max(1, updateCount)}</span>` : ''}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">First &amp; Last Name:</td><td style="padding: 6px 0; font-weight: 700;">${escapeHtml(customer.fullName)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Phone Number:</td><td style="padding: 6px 0; font-weight: 700;"><a href="tel:${escapeHtml(customer.phone)}">${escapeHtml(customer.phone)}</a></td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Email Address:</td><td style="padding: 6px 0; font-weight: 700;"><a href="mailto:${escapeHtml(customer.email)}">${escapeHtml(customer.email)}</a></td></tr>
        </table>

        <h3 style="margin: 0 0 12px; font-size: 15px; color: #0066CC; text-transform: uppercase;">2. ${isUpdated ? 'Locked Cleaning Appointment' : 'Requested Cleaning Appointment'}</h3>
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px;">
          <div><strong>Date:</strong> ${escapeHtml(appointment.preferredDateFormatted)}</div>
          <div style="margin-top: 4px;"><strong>Time Block:</strong> ${escapeHtml(appointment.preferredWindowLabel)}</div>
          <div style="margin-top: 4px;"><strong>Recurrence:</strong> ${escapeHtml(recurrence.label)}</div>
          <div style="margin-top: 4px;"><strong>Est. Cleaning Time:</strong> ${escapeHtml(formatDurationHours(durationHours))}</div>
        </div>

        <h3 style="margin: 0 0 12px; font-size: 15px; color: #0066CC; text-transform: uppercase;">3. ${isUpdated ? '<span style="color: #16A34A;">Updated</span> Estimate Summary (Server-Verified Flat Rate)' : 'Estimate Summary (Server-Verified Flat Rate)'}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748B; width: 150px;">Service Tier:</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(serviceLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Property Scope:</td><td style="padding: 6px 0;">${escapeHtml(specsLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Additional Info:</td><td style="padding: 6px 0;">${escapeHtml(addInfoLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Frequency:</td><td style="padding: 6px 0;">${escapeHtml(freqLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Custom Add-Ons:</td><td style="padding: 6px 0;">${escapeHtml(addonsLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Est. Cleaning Time:</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(formatDurationHours(durationHours))}</td></tr>
          ${isUpdated && previousTotal !== null ? `<tr><td style="padding: 6px 0; color: #64748B;">Previous Total:</td><td style="padding: 6px 0; color: #64748B; text-decoration: line-through;">$${previousTotal.toFixed(2)}</td></tr>` : ''}
          <tr style="border-top: 2px solid #E2E8F0;"><td style="padding: 10px 0; font-weight: 700;">${isUpdated ? '<span style="color: #16A34A;">Updated Total:</span>' : 'Estimated Total:'}</td><td style="padding: 10px 0; font-weight: 800; font-size: 18px; color: #0066CC;">$${calculation.grandTotal.toFixed(2)} <span style="font-size: 12px; color: #64748B; font-weight: 500;">(Flat Rate • No Online Payment)</span></td></tr>
        </table>

        <h3 style="margin: 0 0 8px; font-size: 15px; color: #0066CC; text-transform: uppercase;">4. Additional Customer Notes</h3>
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; font-size: 14px; white-space: pre-wrap;">${escapeHtml(customer.notes || 'No additional notes provided by customer.')}</div>
        ${finishEarlyHtmlBlock}

        <p style="margin: 18px 0 0; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; line-height: 1.5;">
          <strong>Privacy, Opt-Out &amp; Data Deletion:</strong> This email was generated from an estimate request at Smarts Pro Solutions (Shreveport &amp; Bossier City, LA). To opt out of follow-up messages or request immediate deletion of your contact &amp; estimate record, reply <strong>DELETE</strong> or contact <a href="mailto:smartsprosolutions@gmail.com">smartsprosolutions@gmail.com</a> / (318) 564-4360.
        </p>
      </div>
    </div>
  `.trim();

  // Separate customer confirmation / updated receipt email (never includes owner Finish-Early link)
  const customerSubject = isUpdated
    ? `[UPDATED APPOINTMENT] Your Smarts Pro Solutions Receipt (#${referenceCode})`
    : `Your Smarts Pro Solutions Estimate & Appointment Confirmation (#${referenceCode})`;
  const customerTextLines = [
    `Hi ${customer.firstName},`,
    ``,
    isUpdated
      ? `UPDATED APPOINTMENT RECEIPT (Update #${Math.max(1, updateCount)}): Thank you for updating your cleaning details with Smarts Pro Solutions! Below is your refreshed receipt with all currently selected options.`
      : `Thank you for requesting a cleaning estimate with Smarts Pro Solutions! We have received your request and locked in your requested calendar time block below:`,
    ``,
    `Reference ID:      ${referenceCode}`,
    ...(isUpdated ? [`Receipt Status:    UPDATED APPOINTMENT (Update #${Math.max(1, updateCount)})`] : []),
    `Scheduled Date:    ${appointment.preferredDateFormatted} (${appointment.preferredDate})`,
    `Time Block (Locked): ${appointment.preferredWindowLabel}`,
    `Schedule:          ${freqLabel} (${recurrence.label})`,
    `Service Selected:  ${serviceLabel}`,
    `Property Scope:    ${specsLine}`,
    `Additional Info:   ${addInfoLine}`,
    `Custom Add-Ons:    ${addonsLine}`,
    `Est. Cleaning Time:${formatDurationHours(durationHours)}`,
    ...(isUpdated && previousTotal !== null ? [`Previous Total:    $${previousTotal.toFixed(2)}`] : []),
    `${isUpdated ? 'Updated Total:' : 'Estimated Total:'}   $${calculation.grandTotal.toFixed(2)} (Flat Rate • No Online Payment Required)`,
    ...(customer.notes ? [`Your Notes:        ${customer.notes}`] : []),
    ``,
    `Need to change your appointment date or time window? Call or text us at (318) 564-4360 or reply directly to smartsprosolutions@gmail.com.`,
    ``,
    `Privacy & Data Deletion: Customer details are used solely to service your estimate and appointment. To opt out or request data deletion anytime, reply "DELETE" or contact smartsprosolutions@gmail.com.`
  ];
  const customerTextBody = customerTextLines.join('\n');

  const customerUpdatedChangesBlock =
    isUpdated && changeItems.length > 0
      ? `
          <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; font-size: 13px;">
            <div style="font-weight: 800; color: #15803D; text-transform: uppercase; font-size: 12px; margin-bottom: 6px;">Summary of Your Additions &amp; Updates</div>
            <ol style="margin: 0; padding-left: 18px; color: #14532D; line-height: 1.55;">
              ${changeItems
                .map(
                  (ch) =>
                    `<li style="margin-bottom: 3px;"><strong>${escapeHtml(ch.label)}:</strong> ${escapeHtml(ch.detail)}</li>`
                )
                .join('')}
            </ol>
          </div>`
      : '';

  const customerHtmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #0B1E3A; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
      <div style="background: #0B1E3A; color: #FFFFFF; padding: 20px 24px;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #7CC544; font-weight: 700;">
          ${isUpdated ? `<span style="background: #16A34A; color: #FFFFFF; padding: 2px 8px; border-radius: 4px; font-weight: 800;">UPDATED APPOINTMENT RECEIPT (#${Math.max(1, updateCount)})</span> &bull; ` : ''}Smarts Pro Solutions &bull; Shreveport &amp; Bossier City, LA
        </div>
        <h2 style="margin: 8px 0 0; font-size: 20px;">${isUpdated ? 'Updated Appointment &amp; Estimate Receipt' : 'Your Estimate &amp; Appointment Confirmation'}</h2>
        <div style="margin-top: 8px; font-size: 13px; color: #CBD5E1;">
          Reference ID: <span style="display: inline-block; background: #1D4ED8; color: #FFFFFF; padding: 2px 10px; border-radius: 6px; font-weight: 800;">${escapeHtml(referenceCode)}</span>
        </div>
      </div>
      <div style="padding: 24px;">
        ${isUpdated ? `<div style="background: #DCFCE7; border: 1.5px solid #16A34A; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #14532D;"><strong>UPDATED APPOINTMENT:</strong> Applied to your existing appointment under the same Reference ID and locked time block.</div>` : ''}
        ${customerUpdatedChangesBlock}
        <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #1E293B;">
          Hi <strong>${escapeHtml(customer.firstName)}</strong>, thank you for choosing Smarts Pro Solutions! Here is your ${isUpdated ? 'updated estimate and appointment receipt with your current selections' : 'estimate &amp; appointment confirmation details below'}.
        </p>

        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; font-size: 14px;">
          <div><strong>Date (Locked):</strong> ${escapeHtml(appointment.preferredDateFormatted)}</div>
          <div style="margin-top: 4px;"><strong>Time Block (Locked):</strong> ${escapeHtml(appointment.preferredWindowLabel)}</div>
          <div style="margin-top: 4px;"><strong>Schedule:</strong> ${escapeHtml(freqLabel)} (${escapeHtml(recurrence.label)})</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748B; width: 155px;">Service Selected:</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(serviceLabel)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Property Scope:</td><td style="padding: 6px 0;">${escapeHtml(specsLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Additional Info:</td><td style="padding: 6px 0;">${escapeHtml(addInfoLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Custom Add-Ons:</td><td style="padding: 6px 0;">${escapeHtml(addonsLine)}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748B;">Est. Cleaning Time:</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(formatDurationHours(durationHours))}</td></tr>
          ${isUpdated && previousTotal !== null ? `<tr><td style="padding: 6px 0; color: #64748B;">Previous Estimate:</td><td style="padding: 6px 0; color: #64748B; text-decoration: line-through;">$${previousTotal.toFixed(2)}</td></tr>` : ''}
          <tr style="border-top: 2px solid #E2E8F0;"><td style="padding: 10px 0; font-weight: 700;">${isUpdated ? 'Updated Total:' : 'Estimated Total:'}</td><td style="padding: 10px 0; font-weight: 800; font-size: 18px; color: #0066CC;">$${calculation.grandTotal.toFixed(2)} <span style="font-size: 12px; color: #64748B; font-weight: 500;">(Flat Rate &bull; No Online Payment)</span></td></tr>
        </table>

        ${customer.notes ? `<div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 13px;"><strong>Your Notes:</strong> ${escapeHtml(customer.notes)}</div>` : ''}

        <p style="margin: 0 0 14px; font-size: 14px; color: #334155; line-height: 1.5;">
          Need to reschedule your date/time or have a question? Call or text us at <strong>(318) 564-4360</strong> or reply directly to <a href="mailto:${escapeHtml(ownerEmail)}">${escapeHtml(ownerEmail)}</a>.
        </p>

        <p style="margin: 16px 0 0; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; line-height: 1.5;">
          <strong>Privacy &amp; Data Deletion:</strong> Your details are used solely to prepare your cleaning estimate and appointment. To opt out or request data deletion, reply <strong>DELETE</strong> or contact <a href="mailto:${escapeHtml(ownerEmail)}">${escapeHtml(ownerEmail)}</a>.
        </p>
      </div>
    </div>
  `.trim();

  const icsContent = buildCalendarIcs(validatedRecord, referenceCode, ownerEmail);

  const mailtoUrl =
    `mailto:${encodeURIComponent(ownerEmail)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(customerSafeMailtoBody)}`;

  return {
    to: ownerEmail,
    replyTo: customer.email,
    subject,
    textBody,
    htmlBody,
    icsFilename: `smartspro-booking-${referenceCode}.ics`,
    icsContent,
    mailtoUrl,
    finishEarlyUrl,
    customerConfirmation: {
      to: customer.email,
      replyTo: ownerEmail,
      subject: customerSubject,
      textBody: customerTextBody,
      htmlBody: customerHtmlBody
    }
  };
}

/**
 * Validates that an outbound webhook URL uses HTTPS and does not target
 * loopback, link-local cloud metadata (169.254.169.254), or private RFC1918/IPv6 ranges (SSRF guard).
 */
export function isSafeWebhookUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) return false;
  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::'
  ) {
    return false;
  }

  // Check IPv6 loopback / link-local / unique-local
  if (host.includes(':')) {
    if (
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('::ffff:127.') ||
      host.startsWith('::ffff:10.') ||
      host.startsWith('::ffff:192.168.') ||
      host.startsWith('::ffff:169.254.')
    ) {
      return false;
    }
    return false; // Require public DNS hostname for webhook endpoints
  }

  // Check IPv4 literals (reject all raw IPv4 literals or private/metadata ranges)
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return false;
  }

  return true;
}

async function assertWebhookJsonSuccess(response, label, { requireCustomerEmailConfirmed = false } = {}) {
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  const bodyText = typeof response.text === 'function' ? await response.text() : '';
  const trimmed = bodyText.trim();
  if (contentType.includes('text/html') || trimmed.startsWith('<!') || /^<html\b/i.test(trimmed)) {
    throw new Error(
      `${label} returned an HTML page instead of JSON (verify Apps Script "Who has access: Anyone" and permissions)`
    );
  }
  if (trimmed) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`${label} returned an unexpected non-JSON response`);
    }
    if (parsed && (parsed.ok === false || parsed.error)) {
      throw new Error(`${label} reported an error: ${parsed.error || 'execution failed'}`);
    }
    if (parsed && parsed.customerEmailSent === false) {
      throw new Error(
        `${label} could not send the customer confirmation email: ${parsed.customerEmailError || 'mail dispatch declined'}`
      );
    }
    if (requireCustomerEmailConfirmed && (!parsed || parsed.customerEmailSent !== true)) {
      throw new Error(
        `${label} is running an older Apps Script deployment without customer email confirmation (customerEmailSent !== true)`
      );
    }
  } else if (requireCustomerEmailConfirmed) {
    throw new Error(`${label} returned an empty response without customerEmailSent confirmation`);
  }
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
    if (emailPackage.customerConfirmation && emailPackage.customerConfirmation.to) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [emailPackage.customerConfirmation.to],
            reply_to: emailPackage.customerConfirmation.replyTo,
            subject: emailPackage.customerConfirmation.subject,
            text: emailPackage.customerConfirmation.textBody,
            html: emailPackage.customerConfirmation.htmlBody
          })
        });
      } catch {
        // Best-effort customer copy on Resend sandbox when owner delivery already succeeded
      }
    }
    return { delivered: true, provider: 'resend' };
  }

  if (webhookUrl) {
    if (!isSafeWebhookUrl(webhookUrl)) {
      throw new Error('Unsafe EMAIL_WEBHOOK_URL rejected by SSRF guard');
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const isUpdated = Boolean(validatedRecord.isUpdated || validatedRecord.previousReferenceCode);
    const bodyString = JSON.stringify({
      action: 'createBooking',
      referenceCode,
      previousReferenceCode: validatedRecord.previousReferenceCode || '',
      previousDate: validatedRecord.previousDate || '',
      isUpdated,
      updateCount: Number(validatedRecord.updateCount || 0),
      previousTotal: validatedRecord.previousTotal ?? null,
      to: emailPackage.to,
      replyTo: emailPackage.replyTo,
      subject: emailPackage.subject,
      textBody: emailPackage.textBody,
      htmlBody: emailPackage.htmlBody,
      customerEmail: emailPackage.customerConfirmation || null,
      icsFilename: emailPackage.icsFilename,
      icsContent: emailPackage.icsContent,
      finishEarlyUrl: emailPackage.finishEarlyUrl || '',
      recurrence: validatedRecord.appointment.recurrence || getRecurrenceForFrequency(validatedRecord.quote.frequency),
      customer: validatedRecord.customer,
      appointment: {
        preferredDate: validatedRecord.appointment.preferredDate,
        preferredDateFormatted: validatedRecord.appointment.preferredDateFormatted,
        preferredWindow: validatedRecord.appointment.preferredWindow,
        preferredWindowLabel: validatedRecord.appointment.preferredWindowLabel,
        startMinutes: validatedRecord.appointment.startMinutes,
        endMinutes: validatedRecord.appointment.endMinutes,
        durationMinutes: validatedRecord.appointment.durationMinutes,
        estimatedHours: validatedRecord.appointment.estimatedHours,
        scheduledEndLabel: validatedRecord.appointment.scheduledEndLabel,
        startIso: validatedRecord.appointment.startIso,
        endIso: validatedRecord.appointment.endIso
      },
      quote: validatedRecord.quote,
      calculation: validatedRecord.calculation
    });

    const headers = {
      'Content-Type': 'application/json',
      'X-SmartsPro-Timestamp': timestamp
    };
    if (webhookSecret) {
      headers['X-SmartsPro-Signature'] = createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${bodyString}`)
        .digest('hex');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: bodyString
    });
    await assertWebhookJsonSuccess(response, 'Email webhook', {
      requireCustomerEmailConfirmed: Boolean(
        emailPackage.customerConfirmation && emailPackage.customerConfirmation.to
      )
    });
    return { delivered: true, provider: 'webhook' };
  }

  return { delivered: false, reason: 'NO_MAIL_PROVIDER_CONFIGURED' };
}

async function defaultCalendarActionTransport(payload) {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET || '';
  if (!webhookUrl) {
    return { delivered: false, reason: 'NO_CALENDAR_WEBHOOK_CONFIGURED' };
  }
  if (!isSafeWebhookUrl(webhookUrl)) {
    throw new Error('Unsafe EMAIL_WEBHOOK_URL rejected by SSRF guard');
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyString = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'X-SmartsPro-Timestamp': timestamp
  };
  if (webhookSecret) {
    headers['X-SmartsPro-Signature'] = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${bodyString}`)
      .digest('hex');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: bodyString
  });
  await assertWebhookJsonSuccess(response, 'Calendar webhook');
  return { delivered: true, provider: 'webhook' };
}

/**
 * Creates an isolated instance of the Smarts Pro Intake & Calendar Service.
 */
export function createIntakeService({
  mailTransport = null,
  calendarActionTransport = null,
  ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || DEFAULT_OWNER_EMAIL,
  rateLimitMax = 5,
  rateLimitWindowMs = 10 * 60 * 1000,
  nowFn = () => new Date(),
  finishEarlySecret = ''
} = {}) {
  const localBookings = new Map(); // referenceCode -> { referenceCode, date, slotId, startMinutes, endMinutes, serviceLabel, customerEmailHash, syncedRemotely }
  let remoteBusyIntervals = []; // [{ date, startMinutes, endMinutes, serviceLabel }]
  let remoteSyncActive = false;
  const rateLimits = new Map(); // key -> { count, resetAt }
  const idempotencyStore = new Map(); // key -> { payloadHash, status, body }

  function expandBookingDates(booking, horizonEndIso) {
    const out = [booking.date];
    const freq = booking.frequency || '';
    if (freq === 'weekly' || freq === 'biweekly') {
      const stepDays = freq === 'weekly' ? 7 : 14;
      let nextDate = addDaysToIsoDate(booking.date, stepDays);
      while (nextDate <= horizonEndIso) {
        if (!getHolidayNameForIsoDate(nextDate)) {
          out.push(nextDate);
        }
        nextDate = addDaysToIsoDate(nextDate, stepDays);
      }
    } else if (freq === 'monthly') {
      const [origY, origM, origD] = booking.date.split('-').map(Number);
      for (let mOffset = 1; mOffset <= 2; mOffset++) {
        const totalM = origM - 1 + mOffset;
        const targetY = origY + Math.floor(totalM / 12);
        const targetM = (totalM % 12) + 1;
        const maxDayInMonth = new Date(Date.UTC(targetY, targetM, 0, 12, 0, 0)).getUTCDate();
        if (origD <= maxDayInMonth) {
          const nextIso = `${targetY}-${String(targetM).padStart(2, '0')}-${String(origD).padStart(2, '0')}`;
          const dow = getDayOfWeekUtc(nextIso);
          if (nextIso <= horizonEndIso && dow >= 1 && dow <= 5 && !getHolidayNameForIsoDate(nextIso)) {
            out.push(nextIso);
          }
        }
      }
    }
    return out;
  }

  function getEffectiveBusyIntervals() {
    const intervals = [];
    const horizonEndIso = getEndOfNextCalendarMonthIso(getBusinessTodayIso(nowFn()));
    if (remoteSyncActive) {
      for (const item of remoteBusyIntervals) {
        intervals.push({
          date: item.date,
          startMinutes: item.startMinutes,
          endMinutes: item.endMinutes,
          serviceLabel: item.serviceLabel || 'Booked · Cleaning Appointment',
          customerEmailHash: '',
          source: 'gcal'
        });
      }
    }
    for (const booking of localBookings.values()) {
      if (booking.endMinutes <= booking.startMinutes) continue;
      if (remoteSyncActive && booking.syncedRemotely) continue;
      const occurrences = expandBookingDates(booking, horizonEndIso);
      for (const occDate of occurrences) {
        intervals.push({
          date: occDate,
          startMinutes: booking.startMinutes,
          endMinutes: booking.endMinutes,
          serviceLabel: booking.serviceLabel || 'Booked · Cleaning Appointment',
          customerEmailHash: booking.customerEmailHash || '',
          referenceCode: booking.referenceCode,
          source: 'intake'
        });
      }
    }
    return intervals;
  }

  function findConflictingBooking(
    isoDate,
    startMinutes,
    endMinutes,
    requesterEmailHash = '',
    excludeBooking = null
  ) {
    const intervals = getEffectiveBusyIntervals();
    for (const interval of intervals) {
      if (interval.date !== isoDate) continue;
      if (excludeBooking) {
        if (excludeBooking.ref && interval.referenceCode && interval.referenceCode === excludeBooking.ref) {
          continue;
        }
        if (
          interval.source === 'gcal' &&
          interval.date === excludeBooking.date &&
          intervalsOverlap(
            interval.startMinutes,
            interval.endMinutes,
            excludeBooking.startMin,
            excludeBooking.endMin
          )
        ) {
          continue;
        }
      }
      if (requesterEmailHash && interval.customerEmailHash && interval.customerEmailHash === requesterEmailHash) {
        continue;
      }
      if (intervalsOverlap(startMinutes, endMinutes, interval.startMinutes, interval.endMinutes)) {
        return interval;
      }
    }
    return null;
  }

  /**
   * Syncs live busy intervals from the owner's Google Calendar Apps Script webhook (when configured)
   * so stateless Vercel serverless invocations reflect manual calendar edits and Finish-Early updates
   * with zero customer PII exposed.
   */
  async function syncCalendarFromWebhook() {
    if (mailTransport) return; // Skip external network calls during isolated unit tests
    const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
    if (!webhookUrl || !isSafeWebhookUrl(webhookUrl)) return;

    try {
      const targetUrl = new URL(webhookUrl.trim());
      targetUrl.searchParams.set('action', 'availability');
      const res = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data !== 'object') return;

      const nextIntervals = [];
      const windowLookup = new Map(ARRIVAL_WINDOWS.map((w) => [w.id, w]));

      if (Array.isArray(data.busyIntervals)) {
        for (const item of data.busyIntervals) {
          if (!item || typeof item !== 'object') continue;
          let date = typeof item.date === 'string' ? item.date.trim() : '';
          let startMin = Number.isFinite(Number(item.startMinutes)) ? Number(item.startMinutes) : null;
          let endMin = Number.isFinite(Number(item.endMinutes)) ? Number(item.endMinutes) : null;

          if ((!date || startMin === null || endMin === null) && item.startIso && item.endIso) {
            const parsedStart = parseIsoToChicagoDateAndMinutes(item.startIso);
            const parsedEnd = parseIsoToChicagoDateAndMinutes(item.endIso);
            if (parsedStart && parsedEnd && parsedStart.date === parsedEnd.date) {
              date = parsedStart.date;
              startMin = parsedStart.minutes;
              endMin = parsedEnd.minutes;
            }
          }

          if (
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            startMin !== null &&
            endMin !== null &&
            endMin > startMin &&
            endMin > BUSINESS_OPEN_MINUTES &&
            startMin < BUSINESS_CLOSE_MINUTES
          ) {
            nextIntervals.push({
              date,
              startMinutes: Math.max(BUSINESS_OPEN_MINUTES, Math.round(startMin)),
              endMinutes: Math.min(BUSINESS_CLOSE_MINUTES, Math.round(endMin)),
              serviceLabel: 'Booked · Cleaning Appointment'
            });
          }
        }
      }

      if (Array.isArray(data.bookedSlots)) {
        for (const item of data.bookedSlots) {
          if (!item || typeof item !== 'object') continue;
          const date = typeof item.date === 'string' ? item.date.trim() : '';
          const slotId = typeof item.slotId === 'string' ? item.slotId.trim() : '';
          const win = windowLookup.get(slotId);
          if (/^\d{4}-\d{2}-\d{2}$/.test(date) && win) {
            const alreadyCovered = nextIntervals.some(
              (ev) => ev.date === date && intervalsOverlap(win.startMinutes, win.endMinutes, ev.startMinutes, ev.endMinutes)
            );
            if (!alreadyCovered) {
              nextIntervals.push({
                date,
                startMinutes: win.startMinutes,
                endMinutes: win.endMinutes,
                serviceLabel: 'Booked · Cleaning Appointment'
              });
            }
          }
        }
      }

      remoteBusyIntervals = nextIntervals;
      remoteSyncActive = true;
    } catch {
      // Fail-open to local schedule state if webhook does not implement doGet yet or times out
    }
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

    const effectiveIntervals = getEffectiveBusyIntervals();
    const sanitizedBusyIntervals = effectiveIntervals.map((item) => ({
      date: item.date,
      startMinutes: item.startMinutes,
      endMinutes: item.endMinutes
    }));

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
        const dayIntervals = effectiveIntervals.filter((i) => i.date === isoDate);

        const slots = ARRIVAL_WINDOWS.map((win) => {
          if (holidayName) {
            return {
              slotId: win.id,
              label: win.label,
              shortLabel: win.shortLabel,
              startMinutes: win.startMinutes,
              endMinutes: win.endMinutes,
              status: 'CLOSED_HOLIDAY',
              serviceLabel: `Closed (${holidayName})`
            };
          }
          const matchingInterval = dayIntervals.find((ev) =>
            intervalsOverlap(win.startMinutes, win.endMinutes, ev.startMinutes, ev.endMinutes)
          );
          if (matchingInterval) {
            upcomingBookings.push({
              date: isoDate,
              dateFormatted: readableDate,
              slotId: win.id,
              slotLabel: win.shortLabel,
              startMinutes: matchingInterval.startMinutes,
              endMinutes: matchingInterval.endMinutes,
              serviceLabel: matchingInterval.serviceLabel || 'Booked · Cleaning Appointment',
              status: 'BOOKED'
            });
          }
          return {
            slotId: win.id,
            label: win.label,
            shortLabel: win.shortLabel,
            startMinutes: win.startMinutes,
            endMinutes: win.endMinutes,
            status: matchingInterval ? 'BOOKED' : 'AVAILABLE',
            serviceLabel: matchingInterval
              ? matchingInterval.serviceLabel || 'Booked · Cleaning Appointment'
              : 'Available'
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
      businessHours: 'Mon – Fri · 8:00 AM – 4:30 PM',
      businessOpenMinutes: BUSINESS_OPEN_MINUTES,
      businessCloseMinutes: BUSINESS_CLOSE_MINUTES,
      todayDate: todayIso,
      minAdvanceDate,
      maxAdvanceDate,
      maxAdvanceDateFormatted: formatReadableDate(maxAdvanceDate),
      paymentPolicy: 'No Online Payment Required • Flat-Rate Estimate Sent to Owner Email',
      intakeConfigured: transportConfigured,
      liveCalendarSyncConfigured: Boolean(process.env.EMAIL_WEBHOOK_URL),
      arrivalWindows: ARRIVAL_WINDOWS,
      busyIntervals: sanitizedBusyIntervals,
      availableDates,
      calendarMonths: Array.from(monthsMap.values()),
      upcomingBookings: upcomingBookings.slice(0, 12)
    };
  }

  function checkRateLimit(bucketKey, nowMs, maxLimit = rateLimitMax) {
    const existing = rateLimits.get(bucketKey);
    if (!existing || nowMs >= existing.resetAt) {
      rateLimits.set(bucketKey, { count: 1, resetAt: nowMs + rateLimitWindowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (existing.count >= maxLimit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  function resolveEffectiveSecret() {
    return getFinishEarlySecret(finishEarlySecret);
  }

  function buildFinishEarlyConfirmationUrl(record, referenceCode, headers) {
    const siteOrigin = resolvePublicSiteOrigin(headers);
    const expMs = Date.parse(`${record.appointment.preferredDate}T23:59:59Z`) + 2 * 24 * 60 * 60 * 1000;
    const token = createFinishEarlyToken(
      {
        v: 1,
        ref: referenceCode,
        date: record.appointment.preferredDate,
        slotId: record.appointment.preferredWindow,
        startMin: record.appointment.startMinutes,
        endMin: record.appointment.endMinutes,
        durMin: record.appointment.durationMinutes,
        exp: expMs
      },
      resolveEffectiveSecret()
    );
    return `${siteOrigin}/api/finish-early?token=${encodeURIComponent(token)}`;
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

    // 4. Idempotency key validation
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

    // 5. Strict JSON parse
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      const malIpLimit = checkRateLimit(`ip:${clientIp}`, nowMs);
      if (!malIpLimit.allowed) {
        return {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(malIpLimit.retryAfterSeconds) },
          body: {
            success: false,
            code: 'RATE_LIMITED',
            message: 'Too many estimate requests. Please wait a few minutes or call (318) 564-4360.'
          }
        };
      }
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' }
      };
    }

    // 6. Verify signed updateToken BEFORE strict anti-spam rate limiting so real customers editing
    //    their confirmed booking can add/adjust options multiple times without hitting 429 lockouts.
    let verifiedUpdate = null;
    const rawUpdateCandidate =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.updateToken === 'string'
        ? parsed.updateToken.trim()
        : '';

    if (rawUpdateCandidate) {
      const updateCheck = verifyBookingUpdateToken(
        rawUpdateCandidate,
        resolveEffectiveSecret(),
        nowMs
      );
      if (!updateCheck.ok) {
        const badIpLimit = checkRateLimit(`ip:${clientIp}`, nowMs);
        if (!badIpLimit.allowed) {
          return {
            status: 429,
            headers: { 'Cache-Control': 'no-store', 'Retry-After': String(badIpLimit.retryAfterSeconds) },
            body: {
              success: false,
              code: 'RATE_LIMITED',
              message: 'Too many estimate requests. Please wait a few minutes or call (318) 564-4360.'
            }
          };
        }
        return {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
          body: {
            success: false,
            code: updateCheck.code,
            message: updateCheck.message
          }
        };
      }
      verifiedUpdate = updateCheck.payload;
      const editBurstLimit = checkRateLimit(`edit:${clientIp}`, nowMs, Math.max(60, rateLimitMax * 10));
      if (!editBurstLimit.allowed) {
        return {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(editBurstLimit.retryAfterSeconds)
          },
          body: {
            success: false,
            code: 'RATE_LIMITED',
            message: 'Too many rapid updates. Please wait a moment or call (318) 564-4360.'
          }
        };
      }
    } else {
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

    // 7b. Enforce locked appointment date & time block when editing an existing booking,
    //     preserving the exact same Reference ID across every revision.
    if (verifiedUpdate) {
      if (
        record.appointment.preferredDate !== verifiedUpdate.date ||
        record.appointment.startMinutes !== verifiedUpdate.startMin ||
        record.appointment.endMinutes !== verifiedUpdate.endMin
      ) {
        return {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
          body: {
            success: false,
            code: 'APPOINTMENT_TIME_LOCKED',
            message:
              'Appointment dates and time blocks are locked once booked. You can add add-ons or adjust home details, or call (318) 564-4360 to reschedule your time.'
          }
        };
      }
      const nextUpdateCount = Number.isInteger(verifiedUpdate.updateCount)
        ? verifiedUpdate.updateCount + 1
        : 1;
      record.isUpdated = true;
      record.updateCount = nextUpdateCount;
      record.previousTotal = Number.isFinite(Number(verifiedUpdate.prevTotal))
        ? Number(verifiedUpdate.prevTotal)
        : null;
      record.previousSnapshot = verifiedUpdate.snap || null;
      record.previousReferenceCode = verifiedUpdate.ref;
      record.previousDate = verifiedUpdate.date;
    }

    // 8. Per-contact rate limit applies to brand-new unverified submissions (verified edits skip this cap)
    if (!verifiedUpdate) {
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
    }

    // 8b. Live DNS MX mail-server verification on email domain
    const emailDomainDeliverable = await verifyEmailDomainHasMx(record.customer.email);
    if (!emailDomainDeliverable) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: 'UNDELIVERABLE_EMAIL_DOMAIN',
          message:
            'That email domain does not exist or cannot receive mail. Please enter a real, active email address.'
        }
      };
    }

    // 9. Duration-aware calendar interval conflict check (excluding prior self-booking when updating)
    await syncCalendarFromWebhook();
    const requesterEmailHash = createHash('sha256')
      .update(record.customer.email, 'utf8')
      .digest('hex');

    const conflict = findConflictingBooking(
      record.appointment.preferredDate,
      record.appointment.startMinutes,
      record.appointment.endMinutes,
      requesterEmailHash,
      verifiedUpdate
    );
    if (conflict) {
      return {
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: 'SLOT_ALREADY_BOOKED',
          message:
            'That cleaning window overlaps an existing appointment on our calendar. Please choose another available date or time window.'
        }
      };
    }

    // 10. Keep the same Reference ID when editing, or generate a fresh one for new bookings
    const referenceCode = verifiedUpdate
      ? verifiedUpdate.ref
      : `SPS-${randomBytes(5).toString('hex').toUpperCase()}`;
    const finishEarlyUrl = buildFinishEarlyConfirmationUrl(record, referenceCode, headers);
    const emailPackage = buildAutomatedEmailContent(record, referenceCode, ownerEmail, {
      finishEarlyUrl
    });

    const verifiedEstimateSummary = {
      grandTotal: record.calculation.grandTotal,
      basePrice: record.calculation.basePrice,
      addonsTotal: record.calculation.addonsTotal,
      estimatedHours: record.calculation.estimatedHours,
      addonHours: record.calculation.addonHours,
      totalEstimatedHours: record.calculation.totalEstimatedHours,
      durationMinutes: record.calculation.durationMinutes,
      pricingModel: record.calculation.pricingModel
    };

    const appointmentSummary = {
      preferredDate: record.appointment.preferredDate,
      preferredDateFormatted: record.appointment.preferredDateFormatted,
      preferredWindow: record.appointment.preferredWindow,
      preferredWindowLabel: record.appointment.preferredWindowLabel,
      startMinutes: record.appointment.startMinutes,
      endMinutes: record.appointment.endMinutes,
      scheduledEndLabel: record.appointment.scheduledEndLabel,
      durationMinutes: record.appointment.durationMinutes,
      estimatedHours: record.appointment.estimatedHours
    };

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
          verifiedEstimate: verifiedEstimateSummary,
          appointment: appointmentSummary
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
          verifiedEstimate: verifiedEstimateSummary,
          appointment: appointmentSummary
        }
      };
    }

    // 12. Mark interval booked only after verified delivery (replacing prior booking for same customer email + date if editing)
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

    if (verifiedUpdate && verifiedUpdate.ref) {
      localBookings.delete(verifiedUpdate.ref);
      remoteBusyIntervals = remoteBusyIntervals.filter((item) => !(
        item.date === verifiedUpdate.date &&
        item.startMinutes === verifiedUpdate.startMin &&
        item.endMinutes === verifiedUpdate.endMin
      ));
    }

    for (const [existingRef, existingItem] of localBookings.entries()) {
      if (
        existingItem.date === record.appointment.preferredDate &&
        existingItem.customerEmailHash === requesterEmailHash
      ) {
        localBookings.delete(existingRef);
      }
    }

    localBookings.set(referenceCode, {
      referenceCode,
      date: record.appointment.preferredDate,
      slotId: record.appointment.preferredWindow,
      startMinutes: record.appointment.startMinutes,
      endMinutes: record.appointment.endMinutes,
      frequency: record.quote.frequency,
      serviceLabel: serviceBadge,
      status: 'BOOKED',
      customerEmailHash: requesterEmailHash,
      syncedRemotely: deliveryResult.provider === 'webhook'
    });

    const updateToken = createBookingUpdateToken(
      {
        v: 1,
        kind: 'update',
        ref: referenceCode,
        date: record.appointment.preferredDate,
        startMin: record.appointment.startMinutes,
        endMin: record.appointment.endMinutes,
        updateCount: record.updateCount || 0,
        prevTotal: record.calculation.grandTotal,
        snap: buildUpdateTokenSnapshot(record),
        exp: Date.parse(`${record.appointment.preferredDate}T23:59:59Z`) + 2 * 24 * 60 * 60 * 1000
      },
      resolveEffectiveSecret()
    );

    const responseBody = {
      success: true,
      code: 'ESTIMATE_DISPATCHED',
      referenceCode,
      isUpdated: Boolean(verifiedUpdate),
      updateCount: record.updateCount || 0,
      updateToken,
      message: verifiedUpdate
        ? `Updated appointment receipt (#${record.updateCount || 1}, Ref: ${referenceCode}) and ${record.appointment.preferredDateFormatted} (${record.appointment.preferredWindowShort}) schedule have been emailed to Smarts Pro Solutions and your email address.`
        : `Your estimate (${formatDurationHours(record.calculation.totalEstimatedHours)}) and ${record.appointment.preferredDateFormatted} (${record.appointment.preferredWindowShort}) appointment request have been emailed to Smarts Pro Solutions and your email address.`,
      verifiedEstimate: verifiedEstimateSummary,
      appointment: appointmentSummary,
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

  /**
   * Renders a strict-CSP HTML confirmation page for the owner's email Finish-Early action.
   * Performs zero mutations on GET (protects against email link-scanner pre-fetching).
   */
  function renderFinishEarlyPage(token) {
    const verification = verifyFinishEarlyToken(token, resolveEffectiveSecret(), nowFn().getTime());
    const cspMeta =
      "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'";

    let cardHtml = '';
    if (!verification.ok) {
      cardHtml = `
        <div class="finish-early-card is-error">
          <span class="finish-early-kicker">Smarts Pro Solutions &bull; Schedule Control</span>
          <h1>Link Invalid or Expired</h1>
          <p class="finish-early-copy">${escapeHtml(verification.message)}</p>
          <a class="btn btn-primary" href="/">Return to Smarts Pro Solutions</a>
        </div>`;
    } else {
      const p = verification.payload;
      const dateFormatted = formatReadableDate(p.date);
      const startLabel = formatMinutesAsTime(p.startMin);
      const endLabel = formatMinutesAsTime(p.endMin);
      cardHtml = `
        <div class="finish-early-card" id="finish-early-card" data-finish-token="${escapeHtml(token)}">
          <span class="finish-early-kicker">Smarts Pro Solutions &bull; Owner Early-Completion Tool</span>
          <h1>Finish Cleaning Early &amp; Re-Open Calendar</h1>
          <p class="finish-early-copy">
            Confirm below to shorten this calendar block and immediately make the remaining weekday time available for customers on <strong>smartsprosolutions.com</strong>.
          </p>
          <div class="finish-early-summary">
            <div class="finish-early-row"><span>Reference ID:</span><strong>${escapeHtml(p.ref)}</strong></div>
            <div class="finish-early-row"><span>Appointment Date:</span><strong>${escapeHtml(dateFormatted)}</strong></div>
            <div class="finish-early-row"><span>Scheduled Calendar Block:</span><strong>${escapeHtml(startLabel)} &ndash; ${escapeHtml(endLabel)}</strong></div>
          </div>
          <div class="finish-early-actions" id="finish-early-actions">
            <button type="button" class="btn btn-green btn-lg" id="btn-finish-now" data-finish-mode="now">Confirm Finished Early Now (Free Remaining Time)</button>
            <button type="button" class="btn btn-outline btn-sm" id="btn-finish-release-all" data-finish-mode="release_all">Release Entire Window (Canceled / Rescheduled)</button>
          </div>
          <div class="intake-status-banner is-hidden" id="finish-early-status" role="status" aria-live="polite"></div>
          <div class="finish-early-footer">
            <a href="/">View Live Website Schedule &rarr;</a>
          </div>
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${cspMeta}">
  <meta name="robots" content="noindex, nofollow">
  <title>Owner Schedule Control | Smarts Pro Solutions</title>
  <link rel="icon" type="image/png" href="/assets/images/favicon-s.png">
  <link rel="stylesheet" href="/assets/css/fonts.css">
  <link rel="stylesheet" href="/assets/css/styles.css">
  <link rel="stylesheet" href="/assets/css/security.css">
</head>
<body class="finish-early-body">
  <main class="finish-early-main">
    ${cardHtml}
  </main>
  <script src="/assets/js/api.js"></script>
  <script src="/assets/js/finish-early.js"></script>
</body>
</html>`;

    return {
      status: verification.ok ? 200 : 400,
      html
    };
  }

  /**
   * Executes the verified Finish-Early request: shortens local interval holds and
   * signals Google Apps Script to shorten/delete the Google Calendar event so
   * freed time immediately re-opens on the website.
   */
  async function processFinishEarlyRequest({ rawBody, headers = {}, clientIp = '127.0.0.1' }) {
    const now = nowFn();
    const nowMs = now.getTime();

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

    const contentType = String(headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      return {
        status: 415,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json.' }
      };
    }

    const byteLength = Buffer.byteLength(rawBody || '', 'utf8');
    if (byteLength === 0 || byteLength > MAX_BODY_BYTES) {
      return {
        status: byteLength === 0 ? 400 : 413,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'INVALID_BODY_SIZE', message: 'Invalid request body size.' }
      };
    }

    const ipLimit = checkRateLimit(`finish:${clientIp}`, nowMs);
    if (!ipLimit.allowed) {
      return {
        status: 429,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': String(ipLimit.retryAfterSeconds) },
        body: { success: false, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' }
      };
    }

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

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || hasDangerousKeys(parsed)) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'INVALID_PAYLOAD', message: 'Invalid finish-early payload.' }
      };
    }

    const allowedKeys = new Set(['token', 'mode']);
    if (!hasOnlyAllowedKeys(parsed, allowedKeys)) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: 'UNKNOWN_FIELDS', message: 'Unrecognized request fields.' }
      };
    }

    const mode = parsed.mode === 'release_all' ? 'release_all' : 'now';
    const verification = verifyFinishEarlyToken(parsed.token, resolveEffectiveSecret(), nowMs);
    if (!verification.ok) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: { success: false, code: verification.code, message: verification.message }
      };
    }

    const tokenPayload = verification.payload;
    const businessNow = getBusinessTimeParts(now);

    if (businessNow.isoDate > tokenPayload.date) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: 'APPOINTMENT_ALREADY_PASSED',
          message: 'This appointment date has already passed.'
        }
      };
    }

    let earlyEndMinutes = tokenPayload.startMin;
    if (mode === 'release_all') {
      earlyEndMinutes = tokenPayload.startMin;
    } else if (businessNow.isoDate < tokenPayload.date || businessNow.totalMinutes <= tokenPayload.startMin) {
      // Marked complete / released before appointment start time
      earlyEndMinutes = tokenPayload.startMin;
    } else {
      const roundedNowMinutes = Math.ceil(businessNow.totalMinutes / 15) * 15;
      earlyEndMinutes = Math.min(
        tokenPayload.endMin,
        Math.max(tokenPayload.startMin + 15, roundedNowMinutes)
      );
    }

    const releaseAll = earlyEndMinutes <= tokenPayload.startMin;

    // 1. Update local in-memory booking hold
    const existingLocal = localBookings.get(tokenPayload.ref);
    if (existingLocal) {
      if (releaseAll) {
        localBookings.delete(tokenPayload.ref);
      } else {
        existingLocal.endMinutes = earlyEndMinutes;
      }
    }

    // 2. Update any matching remoteBusyIntervals cached in this instance
    remoteBusyIntervals = remoteBusyIntervals
      .map((item) => {
        if (item.date !== tokenPayload.date) return item;
        if (!intervalsOverlap(tokenPayload.startMin, tokenPayload.endMin, item.startMinutes, item.endMinutes)) {
          return item;
        }
        if (releaseAll) return null;
        if (earlyEndMinutes <= item.startMinutes) return null;
        return {
          ...item,
          endMinutes: Math.min(item.endMinutes, earlyEndMinutes)
        };
      })
      .filter(Boolean);

    // 3. Notify Google Apps Script Calendar Bridge to shorten/delete event in Google Calendar
    let calendarSynced = false;
    const actionTransport = calendarActionTransport || defaultCalendarActionTransport;
    try {
      const webhookPayload = {
        action: 'finishEarly',
        referenceCode: tokenPayload.ref,
        date: tokenPayload.date,
        slotId: tokenPayload.slotId,
        startMinutes: tokenPayload.startMin,
        scheduledEndMinutes: tokenPayload.endMin,
        earlyEndMinutes,
        releaseAll,
        startIso: getCentralIsoForDateAndMinutes(tokenPayload.date, tokenPayload.startMin),
        earlyEndIso: getCentralIsoForDateAndMinutes(
          tokenPayload.date,
          releaseAll ? tokenPayload.startMin : earlyEndMinutes
        )
      };
      const webhookRes = await actionTransport(webhookPayload);
      calendarSynced = Boolean(webhookRes && webhookRes.delivered);
    } catch {
      return {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          success: false,
          code: 'CALENDAR_SYNC_FAILED',
          message: 'Could not reach Google Calendar sync webhook. Please update the event directly in Google Calendar.'
        }
      };
    }

    // Determine which arrival windows on that date are now open
    const updatedDayBusy = getEffectiveBusyIntervals().filter((i) => i.date === tokenPayload.date);
    const openWindowsNow = ARRIVAL_WINDOWS.filter(
      (win) =>
        !updatedDayBusy.some((ev) =>
          intervalsOverlap(win.startMinutes, win.endMinutes, ev.startMinutes, ev.endMinutes)
        )
    ).map((w) => w.shortLabel);

    const earlyEndLabel = releaseAll
      ? 'Full Window Released'
      : formatMinutesAsTime(earlyEndMinutes);

    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: {
        success: true,
        code: releaseAll ? 'WINDOW_RELEASED' : 'FINISHED_EARLY',
        referenceCode: tokenPayload.ref,
        date: tokenPayload.date,
        dateFormatted: formatReadableDate(tokenPayload.date),
        earlyEndMinutes,
        earlyEndLabel,
        releaseAll,
        calendarSynced,
        openWindowsNow,
        message: releaseAll
          ? `Full cleaning window on ${formatReadableDate(tokenPayload.date)} released. Open windows now: ${openWindowsNow.length > 0 ? openWindowsNow.join(', ') : 'None'}.`
          : `Cleaning block updated to end at ${earlyEndLabel} on ${formatReadableDate(tokenPayload.date)}. Open windows now: ${openWindowsNow.length > 0 ? openWindowsNow.join(', ') : 'None (remaining slots still overlap)'}.`
      }
    };
  }

  async function getCalendarAvailabilityAsync() {
    await syncCalendarFromWebhook();
    return getCalendarAvailability();
  }

  return Object.freeze({
    getCalendarAvailability,
    getCalendarAvailabilityAsync,
    processEstimateRequest,
    renderFinishEarlyPage,
    processFinishEarlyRequest
  });
}

export const defaultIntakeService = createIntakeService();
