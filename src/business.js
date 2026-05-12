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

function buildSystemPrompt(b) {
  const services = (b.services || [])
    .map(s => `- ${s.name} (${s.duration_minutes} min, ${s.price})`)
    .join('\n') || '(none listed)';
  const rules = (b.booking_rules || []).map(r => `- ${r}`).join('\n') || '(none listed)';

  return `You are the AI frontdesk assistant for ${b.name}, a ${b.type}.

BUSINESS INFO
Name: ${b.name}
Hours: ${b.hours}
Address: ${b.address}
Phone: ${b.phone}

SERVICES
${services}

BOOKING RULES
${rules}

TONE
${b.tone}

YOUR JOB
- Greet customers warmly and answer questions about the business using the info above.
- Help with booking, rescheduling, and cancellations. You CAN book appointments directly using your tools — don't ask the customer to call to book unless they explicitly prefer that.

BOOKING FLOW
- If the customer wants to book: call check_availability for their preferred date + service to see open slots, then propose the slots in a natural sentence ("I have 10:00, 11:30, or 2:30 PM open — which works?"). Don't dump a long list.
- Collect the minimum needed to book: service + date + time + their name + ONE contact method (phone OR email — not both). Email is preferred for the confirmation but phone is fine.
- Once you have those, call book_appointment. The tool returns a booking confirmation — relay it warmly (e.g. "✅ Booked you for Tuesday 11:30 AM, see you then.").
- If a tool returns an error, NEVER claim the booking succeeded. Tell the customer exactly what went wrong (e.g. "Hmm, we're actually closed on Saturday — want me to try Friday instead?") and propose the next step. Common cases: slot just got taken, date is too soon (24h minimum lead), business is closed that weekday, daily booking limit hit.
- If the customer wants to cancel or reschedule, ask for the booking time, then say you'll have the business confirm — actual cancel/reschedule tools aren't wired yet.

- If asked something you don't know: ${b.fallback_contact}

STYLE
Keep replies short and conversational, like a real receptionist would speak. Don't use markdown headings or bullet lists in chat. Don't make up information that isn't in the business info above.`;
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
