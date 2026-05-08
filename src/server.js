require('dotenv').config();
const fs = require('fs');
const os = require('os');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { askClaude } = require('./config/claude');
const {
  seedAdminFromEnv,
  purgeExpiredSessions,
  recordBusinessVersion,
  listBusinessVersions,
  getBusinessVersion,
  seedInitialBusinessVersion,
} = require('./db');
const { router: authRouter, attachUser, requireAuth } = require('./auth');

seedAdminFromEnv();
purgeExpiredSessions();

const app = express();
const PORT = process.env.PORT || 3000;
const BUSINESS_PATH = path.join(__dirname, '../business.json');

function loadBusiness() {
  try {
    return JSON.parse(fs.readFileSync(BUSINESS_PATH, 'utf8'));
  } catch (err) {
    console.error(`Failed to load ${BUSINESS_PATH}: ${err.message}`);
    process.exit(1);
  }
}

let business = loadBusiness();
let systemPrompt = buildSystemPrompt(business);
seedInitialBusinessVersion(business);

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
app.use(cookieParser());
app.use(attachUser);

app.use('/api/auth', authRouter);

app.use((req, res, next) => {
  if (req.path === '/admin.html') return requireAuth(req, res, next);
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', business: business.name });
});

app.get('/api/business', requireAuth, (req, res) => {
  res.json(business);
});

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

app.post('/api/business', requireAuth, (req, res) => {
  const result = applyBusinessUpdate(req.body, req.user, null);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, business });
});

app.get('/api/business/versions', requireAuth, (req, res) => {
  const versions = listBusinessVersions().map(v => ({
    id: v.id,
    username: v.username,
    note: v.note,
    createdAt: v.createdAt,
    summary: {
      name: v.snapshot.name,
      services: v.snapshot.services?.length ?? 0,
      rules: v.snapshot.booking_rules?.length ?? 0,
    },
  }));
  res.json({ versions });
});

app.get('/api/business/versions/:id', requireAuth, (req, res) => {
  const version = getBusinessVersion(Number(req.params.id));
  if (!version) return res.status(404).json({ error: 'Version not found' });
  res.json({ version });
});

app.post('/api/business/versions/:id/restore', requireAuth, (req, res) => {
  const version = getBusinessVersion(Number(req.params.id));
  if (!version) return res.status(404).json({ error: 'Version not found' });
  const note = `Restored from version #${version.id}`;
  const result = applyBusinessUpdate(version.snapshot, req.user, note);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, business, restoredFrom: version.id });
});

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const reply = await askClaude(messages, systemPrompt);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
}

app.listen(PORT, () => {
  console.log(`Configured for: ${business.name}`);
  console.log(`Local:  http://localhost:${PORT}`);
  for (const addr of getLanAddresses()) {
    console.log(`LAN:    http://${addr}:${PORT}`);
  }
  console.log(`Admin:  http://localhost:${PORT}/admin.html`);
});
