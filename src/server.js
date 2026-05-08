require('dotenv').config();
const crypto = require('crypto');
const os = require('os');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { askClaude } = require('./config/claude');
const {
  seedAdminFromEnv,
  purgeExpiredSessions,
  listBusinessVersions,
  getBusinessVersion,
  seedInitialBusinessVersion,
  getOrCreateProfileBySession,
  recordCustomerMessage,
  getCustomerMessages,
  listCustomerProfiles,
  getCustomerProfile,
  updateCustomerProfile,
} = require('./db');
const { router: authRouter, attachUser, requireAuth } = require('./auth');
const { getBusiness, getSystemPrompt, applyBusinessUpdate } = require('./business');
const { runAdminChat } = require('./admin_chat');

seedAdminFromEnv();
purgeExpiredSessions();
seedInitialBusinessVersion(getBusiness());

const app = express();
const PORT = process.env.PORT || 3000;

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
  res.json({ status: 'Server is running', business: getBusiness().name });
});

app.get('/api/business', requireAuth, (req, res) => {
  res.json(getBusiness());
});

app.post('/api/business', requireAuth, (req, res) => {
  const result = applyBusinessUpdate(req.body, req.user, null);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, business: getBusiness() });
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
  res.json({ ok: true, business: getBusiness(), restoredFrom: version.id });
});

app.post('/api/admin/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const result = await runAdminChat(messages, req.user);
    res.json(result);
  } catch (err) {
    console.error('Admin chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

const CUSTOMER_COOKIE = 'frontdesk_customer';
const CUSTOMER_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function attachCustomerProfile(req, res, next) {
  let sid = req.cookies?.[CUSTOMER_COOKIE];
  if (!sid) {
    sid = crypto.randomBytes(32).toString('hex');
    res.cookie(CUSTOMER_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: CUSTOMER_COOKIE_TTL_MS,
    });
  }
  req.customerProfile = getOrCreateProfileBySession(sid);
  next();
}

function serializeMessage(m) {
  return { role: m.role, content: m.content, createdAt: m.created_at };
}

app.get('/api/customer/messages', attachCustomerProfile, (req, res) => {
  res.json({ messages: getCustomerMessages(req.customerProfile.id).map(serializeMessage) });
});

app.post('/chat', attachCustomerProfile, async (req, res) => {
  try {
    const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!text) return res.status(400).json({ error: 'message required' });

    recordCustomerMessage(req.customerProfile.id, 'user', text);

    const stored = getCustomerMessages(req.customerProfile.id);
    const messages = stored.map(m => ({ role: m.role, content: m.content }));

    const reply = await askClaude(messages, getSystemPrompt());

    recordCustomerMessage(req.customerProfile.id, 'assistant', reply);

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profiles', requireAuth, (req, res) => {
  res.json({ profiles: listCustomerProfiles() });
});

app.get('/api/profiles/:id', requireAuth, (req, res) => {
  const profile = getCustomerProfile(Number(req.params.id));
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  const messages = getCustomerMessages(profile.id).map(serializeMessage);
  res.json({ profile, messages });
});

app.patch('/api/profiles/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!getCustomerProfile(id)) return res.status(404).json({ error: 'Profile not found' });
  const fields = {};
  for (const key of ['name', 'phone', 'notes']) {
    if (key in req.body) fields[key] = req.body[key] === '' ? null : req.body[key];
  }
  updateCustomerProfile(id, fields);
  res.json({ profile: getCustomerProfile(id) });
});

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
}

app.listen(PORT, () => {
  console.log(`Configured for: ${getBusiness().name}`);
  console.log(`Local:  http://localhost:${PORT}`);
  for (const addr of getLanAddresses()) {
    console.log(`LAN:    http://${addr}:${PORT}`);
  }
  console.log(`Admin:  http://localhost:${PORT}/admin.html`);
});
