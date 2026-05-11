const { listBookingsBetween, createBooking } = require('./db');
const { getBusiness } = require('./business');

const SLOT_INTERVAL_MIN = 30;
const DEFAULT_OPEN_MIN = 9 * 60;
const DEFAULT_CLOSE_MIN = 17 * 60;
const MIN_LEAD_HOURS = 24;
const MAX_DAYS_AHEAD = 30;

function dayHours(business, dayOfWeek) {
  const structured = business.hours_structured;
  if (structured) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const cfg = structured[days[dayOfWeek]];
    if (!cfg || !cfg.open || !cfg.close) return null;
    return { openMin: hmToMin(cfg.open), closeMin: hmToMin(cfg.close) };
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) return null;
  return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN };
}

function hmToMin(hm) {
  // Accept both "9:00" and "09:00" — strict 2-digit hour was rejecting
  // single-digit times that customers commonly type.
  if (!/^\d{1,2}:\d{2}$/.test(String(hm))) return NaN;
  const [h, m] = hm.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

function minToHm(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function dayBoundsIso(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function findService(business, serviceName) {
  return (business.services || []).find(s => s.name === serviceName);
}

function parseLocalDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function isoForDateAndMinute(dateStr, minutes) {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function getAvailableSlots(dateStr, serviceName) {
  const business = getBusiness();
  const service = findService(business, serviceName);
  if (!service) return { error: 'Unknown service.' };

  const target = parseLocalDate(dateStr);
  if (!target) return { error: 'Invalid date.' };
  if (!Number.isFinite(service.duration_minutes) || service.duration_minutes <= 0) {
    return { error: 'Invalid service duration.' };
  }

  const now = new Date();
  const earliest = new Date(now.getTime() + MIN_LEAD_HOURS * 60 * 60 * 1000);
  const latest = new Date();
  latest.setDate(latest.getDate() + MAX_DAYS_AHEAD);

  const hours = dayHours(business, target.getDay());
  if (!hours) return { slots: [], reason: 'Closed on this day.' };

  const { startIso, endIso } = dayBoundsIso(dateStr);
  const existing = listBookingsBetween(startIso, endIso);

  const slots = [];
  const duration = service.duration_minutes;
  for (let m = hours.openMin; m + duration <= hours.closeMin; m += SLOT_INTERVAL_MIN) {
    const slotStart = new Date(`${dateStr}T00:00:00`);
    slotStart.setMinutes(slotStart.getMinutes() + m);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    if (slotStart < earliest) continue;
    if (slotStart > latest) continue;

    const overlaps = existing.some(b => {
      const bStart = new Date(b.starts_at);
      const bEnd = new Date(b.ends_at);
      return bStart < slotEnd && bEnd > slotStart;
    });
    if (!overlaps) slots.push(minToHm(m));
  }

  return { slots };
}

function bookSlot({ profileId, customerName, customerPhone, customerEmail, serviceName, dateStr, time, notes, source }) {
  const business = getBusiness();
  const service = findService(business, serviceName);
  if (!service) return { error: 'Unknown service.', status: 400 };
  if (!Number.isFinite(service.duration_minutes) || service.duration_minutes <= 0) {
    return { error: 'Invalid service duration.', status: 400 };
  }

  if (!parseLocalDate(dateStr)) return { error: 'Invalid date format.', status: 400 };

  const startMin = hmToMin(time);
  if (!Number.isFinite(startMin)) return { error: 'Invalid time format.', status: 400 };
  const startsAt = isoForDateAndMinute(dateStr, startMin);
  const endsAt = isoForDateAndMinute(dateStr, startMin + service.duration_minutes);

  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) return { error: 'Invalid date/time.', status: 400 };

  const earliest = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000);
  if (startDate < earliest) return { error: 'Bookings need at least 24 hours notice.', status: 400 };

  const hours = dayHours(business, startDate.getDay());
  if (!hours) return { error: 'We are closed on this day.', status: 400 };
  const endMin = startMin + service.duration_minutes;
  if (startMin < hours.openMin || endMin > hours.closeMin) {
    return { error: 'Selected time is outside business hours.', status: 400 };
  }

  const conflicts = listBookingsBetween(startsAt, endsAt);
  if (conflicts.length > 0) {
    return { error: 'That slot just got taken — pick another.', status: 409 };
  }

  const booking = createBooking({
    profileId: profileId ?? null,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerEmail: customerEmail ? customerEmail.trim() : null,
    serviceName: service.name,
    durationMinutes: service.duration_minutes,
    startsAt,
    endsAt,
    notes: notes ?? null,
    source: source || 'web',
  });

  return { booking };
}

module.exports = { getAvailableSlots, bookSlot };
