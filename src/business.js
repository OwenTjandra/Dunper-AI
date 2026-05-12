const fs = require('fs');
const path = require('path');
const { recordBusinessVersion } = require('./db');

const BUSINESS_PATH = path.join(__dirname, '../business.json');

function loadBusiness() {
  try {
    return JSON.parse(fs.readFileSync(BUSINESS_PATH, 'utf8'));
  } catch (err) {
    console.error(`Failed to load ${BUSINESS_PATH}: ${err.message}`);
    process.exit(1);
  }
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hmToMin(hm) {
  if (!TIME_RE.test(String(hm))) return NaN;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function isValidLocalDate(dateStr) {
  if (!DATE_RE.test(String(dateStr))) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function formatWeeklyHours(weekly) {
  if (!weekly || typeof weekly !== 'object') return null;
  const lines = DAY_KEYS.map(k => {
    const d = weekly[k];
    if (!d || !d.open || !d.close || d.closed) return `${DAY_LABELS[k]}: Closed`;
    return `${DAY_LABELS[k]}: ${d.open}–${d.close}`;
  });
  return lines.join('\n');
}

function buildSystemPrompt(b) {
  const services = (b.services || [])
    .map(s => `- ${s.name} (${s.duration_minutes} min, ${s.price})`)
    .join('\n') || '(none listed)';
  const rules = (b.booking_rules || []).map(r => `- ${r}`).join('\n') || '(none listed)';
  // Optional free-text block for richer product/business knowledge that
  // doesn't fit cleanly into hours/services/rules — e.g. pricing plans,
  // language coverage, integrations, FAQ-style facts. Only rendered if set.
  const aboutBlock = (typeof b.about === 'string' && b.about.trim())
    ? `\n\nABOUT\n${b.about.trim()}`
    : '';

  // Prefer structured weekly_hours if present; falls back to free-text b.hours
  // for back-compat with deployments that haven't filled in the schedule yet.
  const weeklyFormatted = formatWeeklyHours(b.weekly_hours);
  const hoursBlock = weeklyFormatted ? `\nHours:\n${weeklyFormatted}` : `\nHours: ${b.hours}`;

  // Optional blocked dates (holidays, owner days off). Skipped if empty.
  const blockedDates = Array.isArray(b.blocked_dates) ? b.blocked_dates.filter(d => typeof d === 'string' && d) : [];
  const blockedBlock = blockedDates.length ? `\n\nCLOSED DATES (do NOT book on these days)\n${blockedDates.map(d => `- ${d}`).join('\n')}` : '';

  return `You are the AI frontdesk for ${b.name}, a ${b.type}.

INFO
Name: ${b.name}${hoursBlock}
Address: ${b.address}
Phone: ${b.phone}

SERVICES
${services}

RULES
${rules}${blockedBlock}${aboutBlock}

TONE: ${b.tone}

JOB: answer questions and book appointments. You CAN book directly via tools — don't redirect to phone.

BOOKING
- Call check_availability for the requested date+service, then propose 2-3 slots in one sentence.
- Collect: service, date, time, name, ONE contact (phone OR email; email preferred).
- Call book_appointment. Relay the confirmation warmly. On tool error, never claim success — explain (e.g. "we're closed Saturday, want Friday?") and propose next step. Common errors: slot taken, <24h lead time, closed that day, daily limit hit.
- Cancel/reschedule: collect details, say business will confirm.

If you don't know: ${b.fallback_contact}

Keep replies short and conversational. No markdown, no bullet lists. Never invent info not above.`;
}

function validateBusiness(b) {
  const required = ['name', 'type', 'hours', 'address', 'phone', 'tone', 'fallback_contact'];
  for (const f of required) {
    if (typeof b[f] !== 'string' || !b[f].trim()) return `Field "${f}" is required.`;
  }
  if (!Array.isArray(b.services)) return 'services must be an array.';
  for (const s of b.services) {
    if (
      !s ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      typeof s.duration_minutes !== 'number' ||
      !Number.isFinite(s.duration_minutes) ||
      s.duration_minutes <= 0 ||
      typeof s.price !== 'string' ||
      !s.price.trim()
    ) {
      return 'Each service needs name, duration_minutes (number), and price.';
    }
  }
  if (!Array.isArray(b.booking_rules)) return 'booking_rules must be an array.';
  if (!b.booking_rules.every(r => typeof r === 'string')) return 'booking_rules must contain only strings.';
  // about is optional — when present it must be a string.
  if (b.about !== undefined && typeof b.about !== 'string') return 'about must be a string if provided.';

  // weekly_hours is optional. Shape: { mon: { open: "09:00", close: "17:00", closed?: bool }, ... }
  if (b.weekly_hours !== undefined) {
    if (!b.weekly_hours || typeof b.weekly_hours !== 'object') return 'weekly_hours must be an object.';
    for (const k of DAY_KEYS) {
      const d = b.weekly_hours[k];
      if (d === undefined) continue;
      if (!d || typeof d !== 'object') return `weekly_hours.${k} must be an object.`;
      if (d.closed) continue;
      if (!d.open || !d.close) return `weekly_hours.${k}: open/close are required unless closed is true`;
      if (!TIME_RE.test(d.open) || !TIME_RE.test(d.close)) return `weekly_hours.${k}: open/close must be HH:MM`;
      if (hmToMin(d.open) >= hmToMin(d.close)) return `weekly_hours.${k}: open must be before close`;
    }
  }

  // blocked_dates is optional. Shape: array of "YYYY-MM-DD" strings.
  if (b.blocked_dates !== undefined) {
    if (!Array.isArray(b.blocked_dates)) return 'blocked_dates must be an array.';
    for (const d of b.blocked_dates) {
      if (typeof d !== 'string' || !isValidLocalDate(d)) return 'blocked_dates must contain valid YYYY-MM-DD dates.';
    }
  }

  return null;
}

let business = loadBusiness();
let systemPrompt = buildSystemPrompt(business);

function getBusiness() {
  return business;
}

function getSystemPrompt() {
  return systemPrompt;
}

function applyBusinessUpdate(updated, user, note) {
  const error = validateBusiness(updated);
  if (error) return { error, status: 400 };
  try {
    fs.writeFileSync(BUSINESS_PATH, JSON.stringify(updated, null, 2));
    business = updated;
    systemPrompt = buildSystemPrompt(business);
    recordBusinessVersion({ snapshot: updated, user, note });
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

module.exports = {
  getBusiness,
  getSystemPrompt,
  applyBusinessUpdate,
};
