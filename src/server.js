require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const { askClaude } = require('./config/claude');

const app = express();
const PORT = process.env.PORT || 3000;
const BUSINESS_PATH = path.join(__dirname, '../business.json');

let business = JSON.parse(fs.readFileSync(BUSINESS_PATH, 'utf8'));
let SYSTEM_PROMPT = buildSystemPrompt(business);

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

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', business: business.name });
});

app.get('/api/business', (req, res) => {
  res.json(business);
});

app.post('/api/business', (req, res) => {
  const updated = req.body;
  const error = validateBusiness(updated);
  if (error) return res.status(400).json({ error });

  try {
    fs.writeFileSync(BUSINESS_PATH, JSON.stringify(updated, null, 2));
    business = updated;
    SYSTEM_PROMPT = buildSystemPrompt(business);
    res.json({ ok: true, business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const reply = await askClaude(messages, SYSTEM_PROMPT);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Configured for: ${business.name}`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
});
