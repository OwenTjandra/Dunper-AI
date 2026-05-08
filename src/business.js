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
- Help with booking, rescheduling, and cancellations. Booking tools are coming soon — for now, collect the customer's preferred date/time, full name, phone number, and which service they want, then tell them the business will confirm shortly.
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
    if (!s.name || typeof s.duration_minutes !== 'number' || !s.price) {
      return 'Each service needs name, duration_minutes (number), and price.';
    }
  }
  if (!Array.isArray(b.booking_rules)) return 'booking_rules must be an array.';
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
