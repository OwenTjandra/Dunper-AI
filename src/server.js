require('dotenv').config();
const crypto = require('crypto');
const os = require('os');
const express = require('express');
const cookieParser = require('cookie-parser');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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
  addCustomerAttachment,
  getAttachmentsForMessage,
  getAttachmentById,
  listBookings,
  listBookingsForProfile,
  cancelBooking,
  getBookingById,
  upsertCustomerSummary,
  getCustomerSummary,
  markWhatsAppMessageProcessed,
  purgeOldWhatsAppMessages,
} = require('./db');
const { getAvailableSlots, bookSlot } = require('./bookings');
const googleIntegration = require('./integrations/google');
const whatsapp = require('./integrations/whatsapp');
const { router: authRouter, attachUser, requireAuth } = require('./auth');
const { getBusiness, getSystemPrompt, applyBusinessUpdate } = require('./business');
const { runAdminChat } = require('./admin_chat');
const documents = require('./documents');

const { db } = require('./db');
require('./migrations').runPending(db);
seedAdminFromEnv();
purgeExpiredSessions();
purgeOldWhatsAppMessages();
seedInitialBusinessVersion(getBusiness());

require('./backup').startBackupSchedule();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req, res) => req.cookies?.frontdesk_customer || ipKeyGenerator(req, res),
  message: { error: 'Too many messages — please slow down.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  message: 'Too many webhook calls.',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  message: { error: 'Too many requests.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(cookieParser());
app.use(attachUser);

app.use('/api/auth', authRouter);
app.use('/api', adminApiLimiter);

const webhookRoutes = require('./routes/webhooks').createRouter({
  webhookLimiter,
  handleWhatsAppPayload: (payload) => handleWhatsAppPayload(payload),
});
app.use('/webhooks', webhookRoutes);

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

function serializeAttachment(a) {
  return {
    id: a.id,
    filename: a.original_filename,
    contentType: a.content_type,
    size: a.size,
    url: `/api/attachments/${a.id}`,
  };
}

function serializeMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    attachments: getAttachmentsForMessage(m.id).map(serializeAttachment),
  };
}

function buildClaudeMessageContent(message, attachments) {
  if (!attachments?.length) return message.content;
  const blocks = attachments.map(a => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: a.content_type,
      data: documents.readCustomerAttachmentBase64(a.profile_id, a.storage_name),
    },
  }));
  if (message.content) blocks.push({ type: 'text', text: message.content });
  return blocks;
}

app.get('/api/customer/messages', attachCustomerProfile, (req, res) => {
  res.json({ messages: getCustomerMessages(req.customerProfile.id).map(serializeMessage) });
});

app.post('/chat', chatLimiter, attachCustomerProfile, (req, res) => {
  documents.customerUpload.array('files', 10)(req, res, async (uploadErr) => {
    try {
      if (uploadErr) return res.status(400).json({ error: uploadErr.message });

      const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      const files = Array.isArray(req.files) ? req.files : [];
      if (!text && files.length === 0) return res.status(400).json({ error: 'message or file required' });

      const messageId = recordCustomerMessage(req.customerProfile.id, 'user', text);
      for (const file of files) {
        addCustomerAttachment({
          messageId,
          profileId: req.customerProfile.id,
          originalFilename: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          storageName: file.filename,
        });
      }

      const stored = getCustomerMessages(req.customerProfile.id);
      const messages = stored.map(m => {
        const atts = getAttachmentsForMessage(m.id);
        return { role: m.role, content: buildClaudeMessageContent(m, atts) };
      });

      const docBlocks = documents.buildDocumentBlocks();
      if (docBlocks.length > 0 && messages.length > 0 && messages[0].role === 'user') {
        const firstContent = Array.isArray(messages[0].content)
          ? messages[0].content
          : [{ type: 'text', text: messages[0].content }];
        messages[0] = { role: 'user', content: [...docBlocks, ...firstContent] };
      }

      const reply = await askClaude(messages, getSystemPrompt());
      recordCustomerMessage(req.customerProfile.id, 'assistant', reply);

      res.json({ reply });
    } catch (err) {
      console.error('Chat error:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

app.get('/api/attachments/:id', attachCustomerProfile, (req, res) => {
  const att = getAttachmentById(Number(req.params.id));
  if (!att) return res.status(404).json({ error: 'Attachment not found.' });

  const isOwnerByProfile = req.customerProfile?.id === att.profile_id;
  const isAdmin = !!req.user;
  if (!isOwnerByProfile && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  res.setHeader('Content-Type', att.content_type);
  res.setHeader('Content-Disposition', `inline; filename="${att.original_filename}"`);
  res.sendFile(documents.customerAttachmentPath(att.profile_id, att.storage_name));
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

app.get('/api/business/documents', requireAuth, (req, res) => {
  res.json({ documents: documents.listDocuments() });
});

app.post('/api/business/documents', requireAuth, (req, res) => {
  documents.upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const doc = documents.recordUpload(req.file, req.user);
    res.json({ ok: true, document: { id: doc.id, filename: doc.filename, contentType: doc.content_type, size: doc.size, createdAt: doc.created_at } });
  });
});

app.delete('/api/business/documents/:id', requireAuth, (req, res) => {
  const ok = documents.removeDocument(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Document not found.' });
  res.json({ ok: true });
});

app.post('/api/business/logo', requireAuth, (req, res) => {
  documents.logoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    res.json({ ok: true, logoUrl: documents.logoPublicUrl(req.file.filename) });
  });
});

app.patch('/api/profiles/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!getCustomerProfile(id)) return res.status(404).json({ error: 'Profile not found' });
  const fields = {};
  for (const key of ['name', 'phone', 'email', 'notes']) {
    if (key in req.body) fields[key] = req.body[key] === '' ? null : req.body[key];
  }
  updateCustomerProfile(id, fields);
  res.json({ profile: getCustomerProfile(id) });
});

app.get('/api/customer/business', attachCustomerProfile, (req, res) => {
  const b = getBusiness();
  res.json({
    name: b.name,
    type: b.type,
    logo_url: b.logo_url || null,
    whatsapp_number: b.whatsapp_number || null,
    whatsapp_prefill_message: b.whatsapp_prefill_message || null,
    services: (b.services || []).map(s => ({
      name: s.name,
      duration_minutes: s.duration_minutes,
      price: s.price,
    })),
  });
});

app.get('/api/customer/availability', attachCustomerProfile, (req, res) => {
  const { date, service } = req.query;
  if (!date || !service) return res.status(400).json({ error: 'date and service required' });
  const result = getAvailableSlots(String(date), String(service));
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.post('/api/customer/bookings', attachCustomerProfile, (req, res) => {
  const { service, date, time, name, phone, email, notes } = req.body || {};
  if (!service || !date || !time || !name || !phone || !email) {
    return res.status(400).json({ error: 'service, date, time, name, phone, email are required' });
  }
  const trimmedEmail = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const result = bookSlot({
    profileId: req.customerProfile.id,
    customerName: String(name),
    customerPhone: String(phone),
    customerEmail: trimmedEmail,
    serviceName: String(service),
    dateStr: String(date),
    time: String(time),
    notes: notes ? String(notes) : null,
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });

  if (!req.customerProfile.name || !req.customerProfile.phone || !req.customerProfile.email) {
    updateCustomerProfile(req.customerProfile.id, {
      name: req.customerProfile.name || String(name),
      phone: req.customerProfile.phone || String(phone),
      email: req.customerProfile.email || trimmedEmail,
    });
  }

  syncBookingToGoogle(result.booking, req.customerProfile.id);

  res.json({ ok: true, booking: result.booking });
});

function syncBookingToGoogle(booking, profileId) {
  (async () => {
    try {
      const calRes = await googleIntegration.createCalendarEvent(booking, getBusiness());
      const calLink = calRes?.htmlLink || null;
      await googleIntegration.appendBookingRow(booking, calLink);
      if (profileId) {
        const refreshed = getCustomerProfile(profileId);
        if (refreshed) {
          await googleIntegration.upsertCustomerRow(
            { ...refreshed, message_count: getCustomerMessages(refreshed.id).length },
            null
          );
        }
      }
    } catch (err) {
      console.error('Google integration error (booking):', err.message);
    }
  })();
}

app.get('/api/customer/bookings', attachCustomerProfile, (req, res) => {
  res.json({ bookings: listBookingsForProfile(req.customerProfile.id) });
});

app.get('/api/bookings', requireAuth, (req, res) => {
  res.json({ bookings: listBookings() });
});

app.post('/api/bookings', requireAuth, (req, res) => {
  const { service, date, time, name, phone, email, notes } = req.body || {};
  if (!service || !date || !time || !name || !phone || !email) {
    return res.status(400).json({ error: 'service, date, time, name, phone, email are required' });
  }
  const trimmedEmail = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const result = bookSlot({
    profileId: null,
    customerName: String(name),
    customerPhone: String(phone),
    customerEmail: trimmedEmail,
    serviceName: String(service),
    dateStr: String(date),
    time: String(time),
    notes: notes ? String(notes) : null,
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });

  syncBookingToGoogle(result.booking, null);

  res.json({ ok: true, booking: result.booking });
});

app.post('/api/bookings/:id/cancel', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const booking = getBookingById(id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  cancelBooking(id);
  googleIntegration.updateBookingStatus(booking, 'cancelled').catch(err =>
    console.error('Sheet cancel sync failed:', err.message));
  res.json({ ok: true });
});

app.post('/api/profiles/:id/summarize', requireAuth, async (req, res) => {
  try {
    const profileId = Number(req.params.id);
    const profile = getCustomerProfile(profileId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const messages = getCustomerMessages(profileId);
    if (messages.length === 0) {
      return res.status(400).json({ error: 'No messages to summarize.' });
    }

    const transcript = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const lastMessageId = messages[messages.length - 1].id;

    const summaryPrompt = `You are summarizing a customer's conversation with a business frontdesk chatbot. Read the transcript and respond with a JSON object only — no prose, no markdown — with keys:
- "summary": 1-2 sentence neutral summary of what the customer wanted and what happened.
- "intent": short label (e.g. "booking inquiry", "pricing question", "complaint", "general info").
- "sentiment": one of "positive", "neutral", "negative", "frustrated".

TRANSCRIPT:
${transcript}`;

    const reply = await askClaude(
      [{ role: 'user', content: summaryPrompt }],
      'You output only valid JSON. No prose. No markdown fences.'
    );

    let parsed;
    try {
      const cleaned = reply.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: reply.slice(0, 500), intent: null, sentiment: null };
    }

    const stored = upsertCustomerSummary({
      profileId,
      summary: parsed.summary || '',
      sentiment: parsed.sentiment || null,
      intent: parsed.intent || null,
      lastMessageId,
    });

    (async () => {
      try {
        const refreshed = getCustomerProfile(profileId);
        await googleIntegration.upsertCustomerRow(
          { ...refreshed, message_count: messages.length },
          stored
        );
      } catch (err) {
        console.error('Google integration error (summary):', err.message);
      }
    })();

    res.json({ summary: stored });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profiles/:id/summary', requireAuth, (req, res) => {
  const summary = getCustomerSummary(Number(req.params.id));
  if (!summary) return res.status(404).json({ error: 'No summary yet.' });
  res.json({ summary });
});

app.get('/api/integrations/google', requireAuth, (req, res) => {
  res.json(googleIntegration.status());
});

app.get('/api/integrations/google/connect', requireAuth, (req, res) => {
  const cfg = googleIntegration.configError();
  if (cfg) return res.status(400).json({ error: cfg });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('google_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(googleIntegration.getAuthUrl(state));
});

app.get('/api/integrations/google/callback', async (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`/admin.html?google=error&reason=${encodeURIComponent(String(error))}`);
  }
  const expected = req.cookies?.google_oauth_state;
  if (!state || state !== expected) {
    return res.redirect('/admin.html?google=error&reason=state_mismatch');
  }
  res.clearCookie('google_oauth_state');
  try {
    await googleIntegration.exchangeCode(String(code), req.user);
    res.redirect('/admin.html?google=connected');
  } catch (err) {
    console.error('Google OAuth callback failed:', err);
    res.redirect(`/admin.html?google=error&reason=${encodeURIComponent(err.message)}`);
  }
});

app.post('/api/integrations/google/disconnect', requireAuth, async (req, res) => {
  await googleIntegration.disconnect();
  res.json({ ok: true });
});

app.get('/api/integrations/google/calendars', requireAuth, async (req, res) => {
  try {
    res.json({ calendars: await googleIntegration.listCalendars() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/integrations/google/sheets', requireAuth, async (req, res) => {
  try {
    res.json({ sheets: await googleIntegration.listSheets() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/integrations/google/sheets/create', requireAuth, async (req, res) => {
  try {
    const title = req.body?.title || `Frontdesk — ${getBusiness().name}`;
    const sheet = await googleIntegration.createSheet(title);
    googleIntegration.selectSheet(sheet.id);
    res.json({ sheet });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/integrations/google/reformat', requireAuth, async (req, res) => {
  try {
    const result = await googleIntegration.reformatExistingTabs();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/integrations/google/select', requireAuth, (req, res) => {
  const { calendarId, sheetId } = req.body || {};
  if (calendarId !== undefined) googleIntegration.selectCalendar(calendarId);
  if (sheetId !== undefined) googleIntegration.selectSheet(sheetId);
  res.json({ status: googleIntegration.status() });
});

app.get('/api/integrations/whatsapp', requireAuth, (req, res) => {
  res.json(whatsapp.status());
});

async function handleWhatsAppPayload(payload) {
  const messages = whatsapp.parseInbound(payload);
  for (const msg of messages) {
    if (msg.kind !== 'text') {
      console.log('[WhatsApp] ignoring non-text message:', msg.messageType, 'from', msg.from);
      continue;
    }

    if (msg.messageId && !markWhatsAppMessageProcessed(msg.messageId)) {
      console.log('[WhatsApp] duplicate message, skipping:', msg.messageId);
      continue;
    }

    const sessionId = whatsapp.sessionIdForPhone(msg.from);
    const profile = getOrCreateProfileBySession(sessionId);

    if (!profile.phone) {
      updateCustomerProfile(profile.id, { phone: msg.from });
    }

    recordCustomerMessage(profile.id, 'user', msg.text);

    const stored = getCustomerMessages(profile.id);
    const claudeMessages = stored.map(m => ({ role: m.role, content: m.content }));

    const docBlocks = documents.buildDocumentBlocks();
    if (docBlocks.length > 0 && claudeMessages.length > 0 && claudeMessages[0].role === 'user') {
      const firstContent = [{ type: 'text', text: claudeMessages[0].content }];
      claudeMessages[0] = { role: 'user', content: [...docBlocks, ...firstContent] };
    }

    let reply;
    try {
      reply = await askClaude(claudeMessages, getSystemPrompt());
    } catch (err) {
      console.error('[WhatsApp] Claude error:', err.message);
      reply = "Sorry, I'm having trouble right now. Please try again in a moment.";
    }

    recordCustomerMessage(profile.id, 'assistant', reply);

    const sendResult = await whatsapp.sendText(msg.from, reply);
    if (!sendResult.ok && !sendResult.skipped) {
      console.error('[WhatsApp] sendText failed:', sendResult.error, sendResult.raw);
    }
  }
}

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
