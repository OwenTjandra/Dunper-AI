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
  seedFoundersFromEnv,
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
  createEscalation,
  listOpenEscalations,
  listAllEscalations,
  resolveEscalation,
  logUnansweredQuestion,
  listUnansweredQuestions,
  reviewUnansweredQuestion,
  recordOutboxEmail,
  listOutboxEmails,
  getMetricsSnapshot,
  recordAnthropicUsage,
  getUsageSnapshot,
  listSalesClients,
  getSalesClient,
  createSalesClient,
  updateSalesClient,
  deleteSalesClient,
  getSalesPipelineStats,
} = require('./db');
const { getAvailableSlots, bookSlot } = require('./bookings');
const googleIntegration = require('./integrations/google');
const whatsapp = require('./integrations/whatsapp');
const conversation = require('./conversation');
const emailService = require('./email');
const { router: authRouter, attachUser, requireFounder, requireBusinessOwner } = require('./auth');
const { getBusiness, getSystemPrompt, applyBusinessUpdate } = require('./business');
const aiSettings = require('./ai_settings');
const { runAdminChat } = require('./admin_chat');
const { runCustomerChat } = require('./customer_chat');
const documents = require('./documents');

const { db } = require('./db');
require('./migrations').runPending(db);
seedAdminFromEnv();
seedFoundersFromEnv();
purgeExpiredSessions();
purgeOldWhatsAppMessages();
seedInitialBusinessVersion(getBusiness());

require('./backup').startBackupSchedule();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  // Compose cookie + IP so a client can't bypass the limit by rotating
  // its frontdesk_customer cookie. New cookie still costs an IP-bound slot.
  keyGenerator: (req, res) => `${req.cookies?.frontdesk_customer || 'anon'}:${ipKeyGenerator(req, res)}`,
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

const SALES_STATUSES = new Set(['lead', 'demo_scheduled', 'demo_done', 'proposal_sent', 'active', 'churned', 'lost']);

// Public marketing contact form — strict per-IP cap to deter spam bots.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { error: 'Too many submissions — try again in a few minutes.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Cloudflare Tunnel (production) the real client IP arrives via
// X-Forwarded-For / CF-Connecting-IP, so we need to trust one hop. In dev
// (no proxy) we still only trust loopback.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : 'loopback');

app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(cookieParser());
app.use(attachUser);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

function isUnsafeMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function sameOrigin(req, origin) {
  try {
    const expected = `${req.protocol}://${req.get('host')}`;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  if (!isUnsafeMethod(req.method) || !req.user) return next();
  const secFetchSite = req.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  const origin = req.get('origin');
  if (origin && !sameOrigin(req, origin)) {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  next();
});

app.use('/api/auth', authRouter);
app.use('/api', adminApiLimiter);

const webhookRoutes = require('./routes/webhooks').createRouter({
  webhookLimiter,
  handleWhatsAppPayload: (payload) => handleWhatsAppPayload(payload),
});
app.use('/webhooks', webhookRoutes);

app.use((req, res, next) => {
  if (req.path === '/admin.html') return requireBusinessOwner(req, res, next);
  if (req.path === '/operator.html') return requireFounder(req, res, next);
  next();
});

// dunper.com root → marketing home page (not the customer chat).
// Explicit route runs BEFORE the static middlewares so it wins at '/'.
// The early-stage customer chat UI (public/index.html) has been retired
// from the marketing flow — the file remains in the repo for future
// widget embedding, but no public URL exposes it anymore.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../website/dunper_home.html'));
});

// Marketing site (website/) — served alongside the app at the same
// origin so login cookies work across both. {index:false} keeps
// website/index.html (the redirect-to-home page) from shadowing
// the customer chat at /index.html for legacy widget embeds.
app.use(express.static(path.join(__dirname, '../website'), { index: false }));

app.use(express.static(path.join(__dirname, '../public'), { index: false }));

app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', business: getBusiness().name });
});

// Public — dunper.com marketing contact form. Each submission is dropped
// into sales_clients as a lead so it surfaces in the Founder Dashboard.
app.post('/api/contact', contactLimiter, (req, res) => {
  const b = req.body || {};
  const first = String(b.firstName || '').trim();
  const last  = String(b.lastName  || '').trim();
  const email = String(b.email     || '').trim().toLowerCase();
  const subject = String(b.subject || '').trim();
  const message = String(b.message || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (!message) {
    return res.status(400).json({ error: 'A message is required.' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'Message is too long (max 4000 characters).' });
  }

  const fullName = [first, last].filter(Boolean).join(' ').trim();
  const today    = new Date().toISOString().slice(0, 10);
  const notes    = [
    subject ? `Subject: ${subject}` : null,
    '',
    message,
    '',
    `— Inbound from dunper.com contact form on ${today}`,
  ].filter(v => v !== null).join('\n');

  try {
    const client = createSalesClient({
      businessName: fullName || email,
      contactName:  fullName || null,
      contactEmail: email,
      status: 'lead',
      notes,
    });
    return res.json({ ok: true, id: client.id });
  } catch (err) {
    console.error('[contact] could not save submission:', err);
    return res.status(500).json({ error: 'Could not save your message — please try again or email dunperai@gmail.com.' });
  }
});

app.get('/api/business', requireBusinessOwner,(req, res) => {
  res.json(getBusiness());
});

app.post('/api/business', requireBusinessOwner,(req, res) => {
  const result = applyBusinessUpdate(req.body, req.user, null);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, business: getBusiness() });
});

app.get('/api/ai-settings', requireBusinessOwner, (req, res) => {
  res.json({ settings: aiSettings.getSettings() });
});

app.post('/api/ai-settings', requireBusinessOwner, (req, res) => {
  const result = aiSettings.saveSettings(req.body || {}, req.user?.id || null);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

app.get('/api/business/versions', requireBusinessOwner,(req, res) => {
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

app.get('/api/business/versions/:id', requireBusinessOwner,(req, res) => {
  const version = getBusinessVersion(Number(req.params.id));
  if (!version) return res.status(404).json({ error: 'Version not found' });
  res.json({ version });
});

app.post('/api/business/versions/:id/restore', requireBusinessOwner,(req, res) => {
  const version = getBusinessVersion(Number(req.params.id));
  if (!version) return res.status(404).json({ error: 'Version not found' });
  const note = `Restored from version #${version.id}`;
  const result = applyBusinessUpdate(version.snapshot, req.user, note);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, business: getBusiness(), restoredFrom: version.id });
});

app.post('/api/admin/chat', requireBusinessOwner,async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const normalized = messages.map(m => ({
      role: m?.role,
      content: typeof m?.content === 'string' ? m.content.slice(0, 8000) : '',
    }));
    if (normalized.some(m => !['user', 'assistant'].includes(m.role) || !m.content.trim())) {
      return res.status(400).json({ error: 'messages must contain non-empty user/assistant text' });
    }
    const result = await runAdminChat(normalized, req.user);
    res.json(result);
  } catch (err) {
    console.error('Admin chat error:', err);
    res.status(502).json({ error: 'Admin chat is unavailable right now.' });
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
      secure: process.env.NODE_ENV === 'production',
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

function contentDispositionFilename(filename) {
  const fallback = String(filename || 'attachment')
    .replace(/[\r\n"]/g, '_')
    .replace(/[\\\/]/g, '_')
    .slice(0, 120) || 'attachment';
  return `inline; filename="${fallback}"`;
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

      const { messages: baseMessages } = conversation.buildBaseMessagesForClaude(req.customerProfile.id);
      const messages = baseMessages.map(m => {
        if (typeof m.id === 'string' && m.id.startsWith('synth-')) {
          return { role: m.role, content: m.content };
        }
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

      const resolved = aiSettings.resolveModel();
      if (resolved.blocked) {
        const s = aiSettings.getSettings();
        recordCustomerMessage(req.customerProfile.id, 'assistant', s.fallback_message);
        return res.json({ reply: s.fallback_message, downgraded: false, blocked: true });
      }
      // Use the tool-use loop so the AI can actually book appointments.
      // runCustomerChat handles list_services / check_availability / book_appointment.
      const { text: reply, usage, bookingsCreated } = await runCustomerChat(messages, getSystemPrompt(), {
        model: resolved.model,
        max_tokens: resolved.max_tokens,
        temperature: resolved.temperature,
        profileId: req.customerProfile.id,
      });
      logUsage('chat', req.customerProfile.id, usage);
      recordCustomerMessage(req.customerProfile.id, 'assistant', reply);
      conversation.maybeCompactInBackground(req.customerProfile.id);
      maybeFlagUnanswered({ profileId: req.customerProfile.id, messageId, questionText: text, replyText: reply });

      // If a booking was created during the loop, fire Google + email side-effects
      // (matches the modal path's syncBookingToGoogle + sendBookingConfirmation).
      for (const b of bookingsCreated) {
        const fullBooking = getBookingById(b.id);
        if (fullBooking) {
          syncBookingToGoogle(fullBooking, req.customerProfile.id);
          setImmediate(() => emailService.sendBookingConfirmation(fullBooking).catch(err =>
            console.error('[Email] booking confirmation failed:', err.message)
          ));
        }
      }

      res.json({
        reply,
        downgraded: resolved.downgraded || false,
        bookings: bookingsCreated,
      });
    } catch (err) {
      console.error('Chat error:', err);
      res.status(502).json({ error: 'The assistant is unavailable right now. Please try again in a moment.' });
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
  res.setHeader('Content-Disposition', contentDispositionFilename(att.original_filename));
  res.sendFile(documents.customerAttachmentPath(att.profile_id, att.storage_name));
});

app.get('/api/profiles', requireBusinessOwner,(req, res) => {
  res.json({ profiles: listCustomerProfiles() });
});

app.get('/api/profiles/:id', requireBusinessOwner,(req, res) => {
  const profile = getCustomerProfile(Number(req.params.id));
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  const messages = getCustomerMessages(profile.id).map(serializeMessage);
  res.json({ profile, messages });
});

app.get('/api/business/documents', requireBusinessOwner,(req, res) => {
  res.json({ documents: documents.listDocuments() });
});

app.post('/api/business/documents', requireBusinessOwner,(req, res) => {
  documents.upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const doc = documents.recordUpload(req.file, req.user);
    res.json({ ok: true, document: { id: doc.id, filename: doc.filename, contentType: doc.content_type, size: doc.size, createdAt: doc.created_at } });
  });
});

app.delete('/api/business/documents/:id', requireBusinessOwner,(req, res) => {
  const ok = documents.removeDocument(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Document not found.' });
  res.json({ ok: true });
});

app.post('/api/business/logo', requireBusinessOwner,(req, res) => {
  documents.logoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    res.json({ ok: true, logoUrl: documents.logoPublicUrl(req.file.filename) });
  });
});

app.patch('/api/profiles/:id', requireBusinessOwner,(req, res) => {
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

// Hard cap on bookings per customer cookie per 24h — applied to both this
// modal-driven endpoint and the AI tool-use path. Stops a hostile visitor
// from spamming dozens of fake bookings.
const MAX_CUSTOMER_BOOKINGS_PER_DAY = 3;
function customerBookingsInLast24h(profileId) {
  if (!profileId) return 0;
  return db.prepare(
    `SELECT COUNT(*) AS n FROM bookings WHERE profile_id = ? AND created_at > datetime('now', '-1 day')`
  ).get(profileId).n;
}

app.post('/api/customer/bookings', attachCustomerProfile, (req, res) => {
  const { service, date, time, name, phone, email, notes } = req.body || {};
  // Email is optional now — require name + at least one contact method.
  if (!service || !date || !time || !name || (!phone && !email)) {
    return res.status(400).json({
      error: 'Need service, date, time, name, and at least one of phone or email.',
    });
  }
  const trimmedEmail = email ? String(email).trim() : null;
  const trimmedPhone = phone ? String(phone).trim() : null;
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (customerBookingsInLast24h(req.customerProfile.id) >= MAX_CUSTOMER_BOOKINGS_PER_DAY) {
    return res.status(429).json({
      error: `You've already made ${MAX_CUSTOMER_BOOKINGS_PER_DAY} bookings recently. Please contact us directly if you need more.`,
    });
  }
  const result = bookSlot({
    profileId: req.customerProfile.id,
    customerName: String(name),
    customerPhone: trimmedPhone || '',
    customerEmail: trimmedEmail,
    serviceName: String(service),
    dateStr: String(date),
    time: String(time),
    notes: notes ? String(notes) : null,
    source: 'web',
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });

  // Backfill the profile from whatever the customer typed (only fill blanks).
  if (!req.customerProfile.name || !req.customerProfile.phone || !req.customerProfile.email) {
    updateCustomerProfile(req.customerProfile.id, {
      name: req.customerProfile.name || String(name),
      phone: req.customerProfile.phone || trimmedPhone || req.customerProfile.phone,
      email: req.customerProfile.email || trimmedEmail || req.customerProfile.email,
    });
  }

  syncBookingToGoogle(result.booking, req.customerProfile.id);
  setImmediate(() => emailService.sendBookingConfirmation(result.booking).catch(err =>
    console.error('[Email] booking confirmation failed:', err.message)
  ));

  res.status(201).json({ ok: true, booking: result.booking });
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

app.get('/api/bookings', requireBusinessOwner,(req, res) => {
  res.json({ bookings: listBookings() });
});

app.post('/api/bookings', requireBusinessOwner,(req, res) => {
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
    source: 'admin',
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });

  syncBookingToGoogle(result.booking, null);
  setImmediate(() => emailService.sendBookingConfirmation(result.booking).catch(err =>
    console.error('[Email] booking confirmation failed:', err.message)
  ));

  res.status(201).json({ ok: true, booking: result.booking });
});

app.post('/api/bookings/:id/cancel', requireBusinessOwner,(req, res) => {
  const id = Number(req.params.id);
  const booking = getBookingById(id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  cancelBooking(id);
  googleIntegration.updateBookingStatus(booking, 'cancelled').catch(err =>
    console.error('Sheet cancel sync failed:', err.message));
  res.json({ ok: true });
});

app.post('/api/profiles/:id/summarize', requireBusinessOwner,async (req, res) => {
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

    const { text: reply, usage } = await askClaude(
      [{ role: 'user', content: summaryPrompt }],
      'You output only valid JSON. No prose. No markdown fences.'
    );
    logUsage('summarize', profileId, usage);

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
    res.status(502).json({ error: 'Summary generation is unavailable right now.' });
  }
});

app.get('/api/profiles/:id/summary', requireBusinessOwner,(req, res) => {
  const summary = getCustomerSummary(Number(req.params.id));
  if (!summary) return res.status(404).json({ error: 'No summary yet.' });
  res.json({ summary });
});

app.post('/api/customer/escalate', attachCustomerProfile, (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;
  const id = createEscalation({ profileId: req.customerProfile.id, reason });
  recordCustomerMessage(req.customerProfile.id, 'user', '[Customer requested a human agent]');
  res.json({ ok: true, id });
});

app.get('/api/escalations', requireBusinessOwner,(req, res) => {
  const status = (req.query.status || 'open').toString();
  const list = status === 'all' ? listAllEscalations() : listOpenEscalations();
  res.json({ escalations: list });
});

app.post('/api/escalations/:id/resolve', requireBusinessOwner,(req, res) => {
  const id = Number(req.params.id);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
  const ok = resolveEscalation(id, { username: req.user?.username, note });
  if (!ok) return res.status(404).json({ error: 'Escalation not found or already resolved.' });
  res.json({ ok: true });
});

app.get('/api/unanswered', requireBusinessOwner,(req, res) => {
  res.json({ unanswered: listUnansweredQuestions() });
});

app.post('/api/unanswered/:id/review', requireBusinessOwner,(req, res) => {
  const id = Number(req.params.id);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
  const status = req.body?.status === 'answered' ? 'answered' : 'reviewed';
  const ok = reviewUnansweredQuestion(id, { username: req.user?.username, note, status });
  if (!ok) return res.status(404).json({ error: 'Item not found.' });
  res.json({ ok: true });
});

app.get('/api/metrics', requireBusinessOwner,(req, res) => {
  res.json(getMetricsSnapshot());
});

app.get('/api/usage', requireBusinessOwner,(req, res) => {
  res.json(getUsageSnapshot());
});

app.get('/api/usage/summary', requireBusinessOwner, (req, res) => {
  const range = String(req.query.range || 'month');
  let since;
  if (range === 'month') since = "datetime('now', 'start of month')";
  else if (range === 'day') since = "datetime('now', 'start of day')";
  else if (range === 'week') since = "datetime('now', '-7 days')";
  else since = "datetime('now', 'start of month')";
  try {
    const row = db
      .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
                       COALESCE(SUM(input_tokens), 0) AS input_tokens,
                       COALESCE(SUM(output_tokens), 0) AS output_tokens,
                       COUNT(*) AS calls
                FROM anthropic_usage_log WHERE created_at >= ${since}`)
      .get();
    res.json(row);
  } catch (err) {
    console.error('[usage/summary] failed:', err.message);
    res.status(500).json({ error: 'Usage summary unavailable' });
  }
});

app.get('/api/operator/overview', requireFounder, (req, res) => {
  const business = getBusiness();
  const metrics = getMetricsSnapshot();
  const usage = getUsageSnapshot();
  const pipeline = getSalesPipelineStats();
  res.json({
    businesses: [{
      id: 1,
      name: business.name,
      type: business.type,
      hours: business.hours,
      services: business.services?.length ?? 0,
      conversations: metrics.conversations,
      messages: metrics.customerMessages,
      bookings: metrics.totalBookings,
      bookingsThisMonth: metrics.monthBookings,
      cancelledBookings: metrics.cancelledBookings,
      conversionRate: metrics.conversionRate,
      openEscalations: metrics.openEscalations,
      openUnanswered: metrics.openUnanswered,
      anthropicSpendMonth: usage.month.cost,
      anthropicSpendAllTime: usage.totals.cost_usd,
      adminUrl: '/admin.html',
    }],
    aggregate: {
      totalConversations: metrics.conversations,
      totalBookings: metrics.totalBookings,
      anthropicSpendMonth: usage.month.cost,
      anthropicSpendAllTime: usage.totals.cost_usd,
      cacheHitRate: usage.cacheHitRate,
    },
    pipeline,
  });
});

app.get('/api/operator/clients', requireFounder, (req, res) => {
  res.json({ clients: listSalesClients() });
});

app.post('/api/operator/clients', requireFounder, (req, res) => {
  const b = req.body || {};
  if (!b.businessName || !String(b.businessName).trim()) {
    return res.status(400).json({ error: 'businessName required' });
  }
  const status = b.status || 'lead';
  if (!SALES_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status' });
  const mrrUsd = b.mrrUsd === '' || b.mrrUsd == null ? null : Number(b.mrrUsd);
  if (mrrUsd !== null && (!Number.isFinite(mrrUsd) || mrrUsd < 0)) {
    return res.status(400).json({ error: 'mrrUsd must be a non-negative number' });
  }
  const created = createSalesClient({
    businessName: String(b.businessName).trim(),
    contactName: b.contactName ?? null,
    contactEmail: b.contactEmail ?? null,
    contactPhone: b.contactPhone ?? null,
    vertical: b.vertical ?? null,
    status,
    plan: b.plan ?? null,
    mrrUsd,
    notes: b.notes ?? null,
    nextStep: b.nextStep ?? null,
    nextStepAt: b.nextStepAt ?? null,
  });
  res.json({ client: created });
});

app.patch('/api/operator/clients/:id', requireFounder, (req, res) => {
  const id = Number(req.params.id);
  if (!getSalesClient(id)) return res.status(404).json({ error: 'Client not found' });
  const fields = {};
  const camel = ['businessName', 'contactName', 'contactEmail', 'contactPhone', 'vertical', 'status', 'plan', 'mrrUsd', 'notes', 'nextStep', 'nextStepAt'];
  for (const k of camel) if (k in (req.body || {})) fields[k] = req.body[k];
  if (fields.status !== undefined && !SALES_STATUSES.has(fields.status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (fields.mrrUsd != null && fields.mrrUsd !== '') fields.mrrUsd = Number(fields.mrrUsd);
  if (fields.mrrUsd === '') fields.mrrUsd = null;
  if (fields.mrrUsd !== undefined && fields.mrrUsd !== null && (!Number.isFinite(fields.mrrUsd) || fields.mrrUsd < 0)) {
    return res.status(400).json({ error: 'mrrUsd must be a non-negative number' });
  }
  updateSalesClient(id, fields);
  res.json({ client: getSalesClient(id) });
});

app.delete('/api/operator/clients/:id', requireFounder, (req, res) => {
  const id = Number(req.params.id);
  const ok = deleteSalesClient(id);
  if (!ok) return res.status(404).json({ error: 'Client not found' });
  res.json({ ok: true });
});

app.get('/api/email/outbox', requireBusinessOwner,(req, res) => {
  res.json({ emails: listOutboxEmails(), config: emailService.status() });
});

app.get('/api/integrations/google', requireBusinessOwner,(req, res) => {
  res.json(googleIntegration.status());
});

app.get('/api/integrations/google/connect', requireBusinessOwner,(req, res) => {
  const cfg = googleIntegration.configError();
  if (cfg) return res.status(400).json({ error: cfg });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('google_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(googleIntegration.getAuthUrl(state));
});

app.get('/api/integrations/google/callback', async (req, res) => {
  if (!req.user) {
    return res.redirect('/dunper_signin.html');
  }
  if (req.user.role !== 'business_owner') {
    return res.redirect('/operator.html');
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
    res.redirect('/admin.html?google=error&reason=oauth_failed');
  }
});

app.post('/api/integrations/google/disconnect', requireBusinessOwner,async (req, res) => {
  await googleIntegration.disconnect();
  res.json({ ok: true });
});

app.get('/api/integrations/google/calendars', requireBusinessOwner,async (req, res) => {
  try {
    res.json({ calendars: await googleIntegration.listCalendars() });
  } catch (err) {
    console.error('[Google] list calendars failed:', err.message);
    res.status(400).json({ error: 'Could not load Google calendars.' });
  }
});

app.get('/api/integrations/google/sheets', requireBusinessOwner,async (req, res) => {
  try {
    res.json({ sheets: await googleIntegration.listSheets() });
  } catch (err) {
    console.error('[Google] list sheets failed:', err.message);
    res.status(400).json({ error: 'Could not load Google Sheets.' });
  }
});

app.post('/api/integrations/google/sheets/create', requireBusinessOwner,async (req, res) => {
  try {
    const title = req.body?.title || `Frontdesk — ${getBusiness().name}`;
    const sheet = await googleIntegration.createSheet(title);
    googleIntegration.selectSheet(sheet.id);
    res.json({ sheet });
  } catch (err) {
    console.error('[Google] create sheet failed:', err.message);
    res.status(400).json({ error: 'Could not create Google Sheet.' });
  }
});

app.post('/api/integrations/google/reformat', requireBusinessOwner,async (req, res) => {
  try {
    const result = await googleIntegration.reformatExistingTabs();
    res.json(result);
  } catch (err) {
    console.error('[Google] reformat failed:', err.message);
    res.status(400).json({ error: 'Could not reformat Google Sheet.' });
  }
});

app.post('/api/integrations/google/select', requireBusinessOwner,(req, res) => {
  const { calendarId, sheetId } = req.body || {};
  if (calendarId !== undefined) googleIntegration.selectCalendar(calendarId);
  if (sheetId !== undefined) googleIntegration.selectSheet(sheetId);
  res.json({ status: googleIntegration.status() });
});

app.get('/api/integrations/whatsapp', requireBusinessOwner,(req, res) => {
  res.json(whatsapp.status());
});

const UNCERTAINTY_PHRASES = [
  /\bi (?:do not|don't|cannot|can't) (?:know|tell|determine|see)\b/i,
  /\bi'?m (?:not (?:sure|certain)|unable)\b/i,
  /\bi (?:would|'d) recommend (?:calling|reaching out|contacting)\b/i,
  /\bplease (?:call|contact|reach out)\b/i,
  /\b(?:that|this) is outside (?:what|my)\b/i,
  /\bi (?:do not|don't) have (?:that|this|the) information\b/i,
  /\bunfortunately,? i (?:cannot|can't|don't|do not)\b/i,
];

function repliesIndicateUncertainty(replyText) {
  if (!replyText) return false;
  return UNCERTAINTY_PHRASES.some(rx => rx.test(replyText));
}

function logUsage(callSite, profileId, usage) {
  if (!usage) return;
  try {
    recordAnthropicUsage({
      callSite,
      profileId: profileId ?? null,
      model: usage.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_tokens,
      cacheReadTokens: usage.cache_read_tokens,
      costUsd: usage.cost_usd,
    });
  } catch (err) {
    console.error('[Usage] log failed:', err.message);
  }
}

function maybeFlagUnanswered({ profileId, messageId, questionText, replyText }) {
  if (!questionText || !questionText.trim()) return;
  if (!repliesIndicateUncertainty(replyText)) return;
  try {
    logUnansweredQuestion({
      profileId,
      messageId,
      questionText,
      replyText,
      reason: 'fallback_phrase',
    });
  } catch (err) {
    console.error('[Unanswered] log failed:', err.message);
  }
}

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

    const { messages: baseMessages } = conversation.buildBaseMessagesForClaude(profile.id);
    const claudeMessages = baseMessages.map(m => ({ role: m.role, content: m.content }));

    const docBlocks = documents.buildDocumentBlocks();
    if (docBlocks.length > 0 && claudeMessages.length > 0 && claudeMessages[0].role === 'user') {
      const firstContent = [{ type: 'text', text: claudeMessages[0].content }];
      claudeMessages[0] = { role: 'user', content: [...docBlocks, ...firstContent] };
    }

    let reply;
    try {
      const { text, usage } = await askClaude(claudeMessages, getSystemPrompt());
      reply = text;
      logUsage('whatsapp', profile.id, usage);
    } catch (err) {
      console.error('[WhatsApp] Claude error:', err.message);
      reply = "Sorry, I'm having trouble right now. Please try again in a moment.";
    }

    recordCustomerMessage(profile.id, 'assistant', reply);
    conversation.maybeCompactInBackground(profile.id);
    maybeFlagUnanswered({ profileId: profile.id, messageId: null, questionText: msg.text, replyText: reply });

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

app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '../website/dunper_home.html'));
});

app.use((err, req, res, _next) => {
  console.error('[request error]', err);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  const publicMessage = status >= 500 ? 'Internal server error' : (err.message || 'Bad request');
  res.status(status).json({ error: publicMessage });
});

const server = app.listen(PORT, () => {
  console.log(`Configured for: ${getBusiness().name}`);
  console.log(`Local:  http://localhost:${PORT}`);
  for (const addr of getLanAddresses()) {
    console.log(`LAN:    http://${addr}:${PORT}`);
  }
  console.log(`Admin:  http://localhost:${PORT}/admin.html`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] received ${signal}, closing server…`);
  // Stop accepting new HTTP connections; let in-flight requests finish.
  server.close(err => {
    if (err) console.error('[shutdown] server.close error:', err);
    try { db.close(); console.log('[shutdown] db closed'); }
    catch (e) { console.error('[shutdown] db close error:', e); }
    process.exit(err ? 1 : 0);
  });
  // Hard-exit fallback if a request hangs past 10s.
  setTimeout(() => {
    console.error('[shutdown] forced exit after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', reason => {
  console.error('[unhandledRejection]', reason);
});
