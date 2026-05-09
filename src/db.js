const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../data.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS business_versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username   TEXT,
    snapshot   TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_business_versions_created_at ON business_versions(created_at);

  CREATE TABLE IF NOT EXISTS customer_profiles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL UNIQUE,
    name         TEXT,
    phone        TEXT,
    email        TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customer_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_customer_messages_profile ON customer_messages(profile_id, created_at);

  CREATE TABLE IF NOT EXISTS customer_message_attachments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id        INTEGER NOT NULL REFERENCES customer_messages(id) ON DELETE CASCADE,
    profile_id        INTEGER NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    content_type      TEXT NOT NULL,
    size              INTEGER NOT NULL,
    storage_name      TEXT NOT NULL UNIQUE,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_customer_attachments_message ON customer_message_attachments(message_id);

  CREATE TABLE IF NOT EXISTS business_documents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    filename     TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size         INTEGER NOT NULL,
    storage_name TEXT NOT NULL UNIQUE,
    uploaded_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_by_username TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id       INTEGER REFERENCES customer_profiles(id) ON DELETE SET NULL,
    customer_name    TEXT NOT NULL,
    customer_phone   TEXT NOT NULL,
    customer_email   TEXT,
    service_name     TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    starts_at        TEXT NOT NULL,
    ends_at          TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'confirmed',
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_starts_at ON bookings(starts_at);
  CREATE INDEX IF NOT EXISTS idx_bookings_profile ON bookings(profile_id);

  CREATE TABLE IF NOT EXISTS customer_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id      INTEGER NOT NULL UNIQUE REFERENCES customer_profiles(id) ON DELETE CASCADE,
    summary         TEXT NOT NULL,
    sentiment       TEXT,
    intent          TEXT,
    last_message_id INTEGER,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- WhatsApp inbound message dedup. Meta retries on transient failures
  -- so we track every processed messageId and skip duplicates.
  CREATE TABLE IF NOT EXISTS processed_wa_messages (
    message_id   TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_processed_wa_at ON processed_wa_messages(processed_at);

  -- OAuth-based Google connection. Singleton row (id=1) for now; will gain
  -- workspace_id when we go multi-tenant.
  CREATE TABLE IF NOT EXISTS google_connection (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    access_token  TEXT NOT NULL,
    refresh_token TEXT,
    expires_at    TEXT NOT NULL,
    scopes        TEXT,
    email         TEXT,
    calendar_id   TEXT,
    sheet_id      TEXT,
    connected_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    connected_by_username TEXT
  );
`);

// Migrations for existing data.db files where the table predates a column.
function ensureColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    console.log(`Migrated: added ${column} to ${table}`);
  }
}
ensureColumn('customer_profiles', 'email', 'TEXT');
ensureColumn('bookings', 'customer_email', 'TEXT');

function seedAdminFromEnv() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`Seeded initial admin user: ${username}`);
}

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function createSession(sessionId, userId, expiresAt) {
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, userId, expiresAt);
}

function findSession(sessionId) {
  return db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).get(sessionId);
}

function deleteSession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
}

function recordBusinessVersion({ snapshot, user, note }) {
  db.prepare(`
    INSERT INTO business_versions (user_id, username, snapshot, note)
    VALUES (?, ?, ?, ?)
  `).run(user?.id ?? null, user?.username ?? null, JSON.stringify(snapshot), note ?? null);
}

function listBusinessVersions(limit = 50) {
  return db.prepare(`
    SELECT id, user_id, username, note, created_at, snapshot
    FROM business_versions
    ORDER BY id DESC
    LIMIT ?
  `).all(limit).map(row => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    note: row.note,
    createdAt: row.created_at,
    snapshot: JSON.parse(row.snapshot),
  }));
}

function getBusinessVersion(id) {
  const row = db.prepare(`
    SELECT id, user_id, username, note, created_at, snapshot
    FROM business_versions WHERE id = ?
  `).get(id);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    note: row.note,
    createdAt: row.created_at,
    snapshot: JSON.parse(row.snapshot),
  };
}

function seedInitialBusinessVersion(currentBusiness) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM business_versions').get().n;
  if (count > 0) return;
  recordBusinessVersion({
    snapshot: currentBusiness,
    user: null,
    note: 'Initial snapshot from business.json',
  });
  console.log('Seeded initial business version (v1)');
}

function getOrCreateProfileBySession(sessionId) {
  let row = db.prepare('SELECT * FROM customer_profiles WHERE session_id = ?').get(sessionId);
  if (row) {
    db.prepare('UPDATE customer_profiles SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    return row;
  }
  const result = db.prepare('INSERT INTO customer_profiles (session_id) VALUES (?)').run(sessionId);
  return db.prepare('SELECT * FROM customer_profiles WHERE id = ?').get(result.lastInsertRowid);
}

function recordCustomerMessage(profileId, role, content) {
  const result = db.prepare('INSERT INTO customer_messages (profile_id, role, content) VALUES (?, ?, ?)')
    .run(profileId, role, content);
  return result.lastInsertRowid;
}

function addCustomerAttachment({ messageId, profileId, originalFilename, contentType, size, storageName }) {
  const result = db.prepare(`
    INSERT INTO customer_message_attachments
      (message_id, profile_id, original_filename, content_type, size, storage_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(messageId, profileId, originalFilename, contentType, size, storageName);
  return result.lastInsertRowid;
}

function getAttachmentsForMessage(messageId) {
  return db.prepare(`
    SELECT id, message_id, profile_id, original_filename, content_type, size, storage_name, created_at
    FROM customer_message_attachments
    WHERE message_id = ?
    ORDER BY id ASC
  `).all(messageId);
}

function getAttachmentById(id) {
  return db.prepare('SELECT * FROM customer_message_attachments WHERE id = ?').get(id);
}

function getCustomerMessages(profileId) {
  return db.prepare(`
    SELECT id, role, content, created_at
    FROM customer_messages
    WHERE profile_id = ?
    ORDER BY id ASC
  `).all(profileId);
}

function listCustomerProfiles() {
  return db.prepare(`
    SELECT
      p.id, p.session_id, p.name, p.phone, p.email, p.notes,
      p.created_at, p.last_seen_at,
      (SELECT COUNT(*) FROM customer_messages WHERE profile_id = p.id) AS message_count,
      (SELECT content FROM customer_messages WHERE profile_id = p.id ORDER BY id DESC LIMIT 1) AS last_message
    FROM customer_profiles p
    ORDER BY p.last_seen_at DESC
    LIMIT 200
  `).all();
}

function getCustomerProfile(id) {
  return db.prepare('SELECT * FROM customer_profiles WHERE id = ?').get(id);
}

function addBusinessDocument({ filename, contentType, size, storageName, user }) {
  const result = db.prepare(`
    INSERT INTO business_documents
      (filename, content_type, size, storage_name, uploaded_by_user_id, uploaded_by_username)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(filename, contentType, size, storageName, user?.id ?? null, user?.username ?? null);
  return getBusinessDocument(result.lastInsertRowid);
}

function listBusinessDocuments() {
  return db.prepare(`
    SELECT id, filename, content_type, size, storage_name,
           uploaded_by_user_id, uploaded_by_username, created_at
    FROM business_documents
    ORDER BY id DESC
  `).all();
}

function getBusinessDocument(id) {
  return db.prepare('SELECT * FROM business_documents WHERE id = ?').get(id);
}

function deleteBusinessDocument(id) {
  const info = db.prepare('DELETE FROM business_documents WHERE id = ?').run(id);
  return info.changes > 0;
}

function updateCustomerProfile(id, fields) {
  const allowed = ['name', 'phone', 'email', 'notes'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return false;
  values.push(id);
  const info = db.prepare(`UPDATE customer_profiles SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return info.changes > 0;
}

function createBooking(b) {
  const result = db.prepare(`
    INSERT INTO bookings
      (profile_id, customer_name, customer_phone, customer_email, service_name, duration_minutes, starts_at, ends_at, status, notes, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.profileId ?? null,
    b.customerName,
    b.customerPhone,
    b.customerEmail ?? null,
    b.serviceName,
    b.durationMinutes,
    b.startsAt,
    b.endsAt,
    b.status ?? 'confirmed',
    b.notes ?? null,
    b.source ?? 'web'
  );
  return getBookingById(result.lastInsertRowid);
}

function getBookingById(id) {
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
}

function listBookings(limit = 200) {
  return db.prepare(`
    SELECT b.*, p.session_id AS profile_session_id
    FROM bookings b
    LEFT JOIN customer_profiles p ON p.id = b.profile_id
    ORDER BY b.starts_at DESC
    LIMIT ?
  `).all(limit);
}

function listBookingsForProfile(profileId) {
  return db.prepare(`
    SELECT * FROM bookings WHERE profile_id = ? ORDER BY starts_at DESC
  `).all(profileId);
}

function listBookingsBetween(startIso, endIso) {
  return db.prepare(`
    SELECT * FROM bookings
    WHERE status != 'cancelled' AND starts_at < ? AND ends_at > ?
    ORDER BY starts_at ASC
  `).all(endIso, startIso);
}

function cancelBooking(id) {
  const info = db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(id);
  return info.changes > 0;
}

function upsertCustomerSummary({ profileId, summary, sentiment, intent, lastMessageId }) {
  db.prepare(`
    INSERT INTO customer_summaries (profile_id, summary, sentiment, intent, last_message_id, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(profile_id) DO UPDATE SET
      summary = excluded.summary,
      sentiment = excluded.sentiment,
      intent = excluded.intent,
      last_message_id = excluded.last_message_id,
      updated_at = CURRENT_TIMESTAMP
  `).run(profileId, summary, sentiment ?? null, intent ?? null, lastMessageId ?? null);
  return getCustomerSummary(profileId);
}

function getCustomerSummary(profileId) {
  return db.prepare('SELECT * FROM customer_summaries WHERE profile_id = ?').get(profileId);
}

function getGoogleConnection() {
  return db.prepare('SELECT * FROM google_connection WHERE id = 1').get();
}

function saveGoogleConnection({ accessToken, refreshToken, expiresAt, scopes, email, user }) {
  db.prepare(`
    INSERT INTO google_connection
      (id, access_token, refresh_token, expires_at, scopes, email, connected_at, connected_by_username)
    VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, google_connection.refresh_token),
      expires_at = excluded.expires_at,
      scopes = excluded.scopes,
      email = excluded.email,
      connected_at = CURRENT_TIMESTAMP,
      connected_by_username = excluded.connected_by_username
  `).run(accessToken, refreshToken ?? null, expiresAt, scopes ?? null, email ?? null, user?.username ?? null);
  return getGoogleConnection();
}

function updateGoogleTokens({ accessToken, expiresAt }) {
  db.prepare('UPDATE google_connection SET access_token = ?, expires_at = ? WHERE id = 1')
    .run(accessToken, expiresAt);
  return getGoogleConnection();
}

function setGoogleSelection({ calendarId, sheetId }) {
  const sets = [];
  const values = [];
  if (calendarId !== undefined) { sets.push('calendar_id = ?'); values.push(calendarId); }
  if (sheetId !== undefined) { sets.push('sheet_id = ?'); values.push(sheetId); }
  if (sets.length === 0) return getGoogleConnection();
  db.prepare(`UPDATE google_connection SET ${sets.join(', ')} WHERE id = 1`).run(...values);
  return getGoogleConnection();
}

function clearGoogleConnection() {
  db.prepare('DELETE FROM google_connection WHERE id = 1').run();
}

function createEscalation({ profileId, reason }) {
  const result = db.prepare(`
    INSERT INTO escalations (profile_id, reason) VALUES (?, ?)
  `).run(profileId, reason ?? null);
  return result.lastInsertRowid;
}

function listOpenEscalations() {
  return db.prepare(`
    SELECT e.*,
           p.name AS customer_name, p.phone AS customer_phone, p.email AS customer_email,
           p.session_id AS profile_session_id
    FROM escalations e
    LEFT JOIN customer_profiles p ON p.id = e.profile_id
    WHERE e.status = 'pending'
    ORDER BY e.created_at ASC
  `).all();
}

function listAllEscalations(limit = 100) {
  return db.prepare(`
    SELECT e.*,
           p.name AS customer_name, p.phone AS customer_phone, p.email AS customer_email
    FROM escalations e
    LEFT JOIN customer_profiles p ON p.id = e.profile_id
    ORDER BY e.created_at DESC
    LIMIT ?
  `).all(limit);
}

function resolveEscalation(id, { username, note }) {
  const info = db.prepare(`
    UPDATE escalations
       SET status = 'resolved', resolved_by_username = ?, resolved_note = ?, resolved_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'
  `).run(username ?? null, note ?? null, id);
  return info.changes > 0;
}

function logUnansweredQuestion({ profileId, messageId, questionText, replyText, reason }) {
  const result = db.prepare(`
    INSERT INTO unanswered_questions (profile_id, message_id, question_text, reply_text, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(profileId, messageId ?? null, questionText, replyText ?? null, reason ?? 'fallback_phrase');
  return result.lastInsertRowid;
}

function listUnansweredQuestions(limit = 100) {
  return db.prepare(`
    SELECT u.*,
           p.name AS customer_name, p.phone AS customer_phone, p.email AS customer_email
    FROM unanswered_questions u
    LEFT JOIN customer_profiles p ON p.id = u.profile_id
    ORDER BY u.created_at DESC
    LIMIT ?
  `).all(limit);
}

function reviewUnansweredQuestion(id, { username, note, status }) {
  const info = db.prepare(`
    UPDATE unanswered_questions
       SET status = ?, reviewed_by_username = ?, reviewed_note = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `).run(status || 'reviewed', username ?? null, note ?? null, id);
  return info.changes > 0;
}

function recordOutboxEmail({ toAddress, subject, bodyText, bodyHtml, category, relatedId, status, errorText, sentAt }) {
  const result = db.prepare(`
    INSERT INTO email_outbox (to_address, subject, body_text, body_html, category, related_id, status, error_text, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    toAddress,
    subject,
    bodyText,
    bodyHtml ?? null,
    category,
    relatedId ?? null,
    status || 'pending',
    errorText ?? null,
    sentAt ?? null
  );
  return result.lastInsertRowid;
}

function listOutboxEmails(limit = 50) {
  return db.prepare(`
    SELECT id, to_address, subject, category, related_id, status, error_text, created_at, sent_at
    FROM email_outbox
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

function getMetricsSnapshot() {
  const conversations = db.prepare('SELECT COUNT(*) AS n FROM customer_profiles').get().n;
  const totalBookings = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled'").get().n;
  const cancelledBookings = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'cancelled'").get().n;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(); monthStart.setMonth(monthStart.getMonth() - 1);

  const todayBookings = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled' AND starts_at >= ?`).get(todayStart.toISOString()).n;
  const weekBookings = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled' AND starts_at >= ?`).get(weekStart.toISOString()).n;
  const monthBookings = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled' AND starts_at >= ?`).get(monthStart.toISOString()).n;

  const topServiceRow = db.prepare(`
    SELECT service_name, COUNT(*) AS n
    FROM bookings
    WHERE status != 'cancelled' AND created_at >= ?
    GROUP BY service_name
    ORDER BY n DESC
    LIMIT 1
  `).get(monthStart.toISOString());

  const sourceRows = db.prepare(`
    SELECT source, COUNT(*) AS n FROM bookings WHERE status != 'cancelled' GROUP BY source
  `).all();

  const sentimentRows = db.prepare(`
    SELECT sentiment, COUNT(*) AS n FROM customer_summaries WHERE sentiment IS NOT NULL GROUP BY sentiment
  `).all();

  const openEscalations = db.prepare(`SELECT COUNT(*) AS n FROM escalations WHERE status = 'pending'`).get().n;
  const openUnanswered = db.prepare(`SELECT COUNT(*) AS n FROM unanswered_questions WHERE status = 'open'`).get().n;

  const totalMessages = db.prepare(`SELECT COUNT(*) AS n FROM customer_messages WHERE role = 'user'`).get().n;
  const conversionRate = conversations > 0 ? Math.round((totalBookings / conversations) * 100) : 0;

  return {
    conversations,
    customerMessages: totalMessages,
    totalBookings,
    cancelledBookings,
    todayBookings,
    weekBookings,
    monthBookings,
    conversionRate,
    topService: topServiceRow ? { name: topServiceRow.service_name, count: topServiceRow.n } : null,
    bookingsBySource: sourceRows,
    sentimentBreakdown: sentimentRows,
    openEscalations,
    openUnanswered,
  };
}

function listSalesClients() {
  return db.prepare(`
    SELECT * FROM sales_clients
    ORDER BY
      CASE status
        WHEN 'active'         THEN 1
        WHEN 'proposal_sent'  THEN 2
        WHEN 'demo_done'      THEN 3
        WHEN 'demo_scheduled' THEN 4
        WHEN 'lead'           THEN 5
        WHEN 'churned'        THEN 6
        WHEN 'lost'           THEN 7
        ELSE 8
      END,
      next_step_at IS NULL,
      next_step_at ASC,
      updated_at DESC
  `).all();
}

function getSalesClient(id) {
  return db.prepare('SELECT * FROM sales_clients WHERE id = ?').get(id);
}

function createSalesClient(c) {
  const result = db.prepare(`
    INSERT INTO sales_clients
      (business_name, contact_name, contact_email, contact_phone, vertical, status, plan, mrr_usd, notes, next_step, next_step_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    c.businessName,
    c.contactName ?? null,
    c.contactEmail ?? null,
    c.contactPhone ?? null,
    c.vertical ?? null,
    c.status || 'lead',
    c.plan ?? null,
    c.mrrUsd ?? null,
    c.notes ?? null,
    c.nextStep ?? null,
    c.nextStepAt ?? null,
  );
  return getSalesClient(result.lastInsertRowid);
}

function updateSalesClient(id, fields) {
  const allowed = ['business_name', 'contact_name', 'contact_email', 'contact_phone', 'vertical', 'status', 'plan', 'mrr_usd', 'notes', 'next_step', 'next_step_at'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (camelKey in fields) {
      sets.push(`${key} = ?`);
      values.push(fields[camelKey]);
    }
  }
  if (sets.length === 0) return false;
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);
  const info = db.prepare(`UPDATE sales_clients SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return info.changes > 0;
}

function deleteSalesClient(id) {
  const info = db.prepare('DELETE FROM sales_clients WHERE id = ?').run(id);
  return info.changes > 0;
}

function getSalesPipelineStats() {
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS n, COALESCE(SUM(mrr_usd), 0) AS mrr
    FROM sales_clients
    GROUP BY status
  `).all();

  const totals = {
    leads: 0, demoScheduled: 0, demoDone: 0, proposalSent: 0,
    active: 0, churned: 0, lost: 0,
    activeMrr: 0,
  };
  const map = {
    'lead': 'leads',
    'demo_scheduled': 'demoScheduled',
    'demo_done': 'demoDone',
    'proposal_sent': 'proposalSent',
    'active': 'active',
    'churned': 'churned',
    'lost': 'lost',
  };
  byStatus.forEach(r => {
    const k = map[r.status];
    if (k) totals[k] = r.n;
    if (r.status === 'active') totals.activeMrr = r.mrr || 0;
  });

  const upcoming = db.prepare(`
    SELECT id, business_name, status, next_step, next_step_at
    FROM sales_clients
    WHERE next_step_at IS NOT NULL AND next_step_at <= datetime('now', '+14 days')
      AND status NOT IN ('lost', 'churned')
    ORDER BY next_step_at ASC
    LIMIT 10
  `).all();

  return { byStatus, totals, upcoming };
}

function recordAnthropicUsage({ callSite, profileId, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, costUsd }) {
  db.prepare(`
    INSERT INTO anthropic_usage_log
      (call_site, profile_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    callSite,
    profileId ?? null,
    model || null,
    inputTokens || 0,
    outputTokens || 0,
    cacheCreationTokens || 0,
    cacheReadTokens || 0,
    costUsd || 0
  );
}

function getUsageSnapshot() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(); monthStart.setMonth(monthStart.getMonth() - 1);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
      COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
      COALESCE(SUM(cost_usd), 0) AS cost_usd,
      COUNT(*) AS calls
    FROM anthropic_usage_log
  `).get();

  const today = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*) AS calls
    FROM anthropic_usage_log WHERE created_at >= ?
  `).get(todayStart.toISOString());
  const week = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*) AS calls
    FROM anthropic_usage_log WHERE created_at >= ?
  `).get(weekStart.toISOString());
  const month = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*) AS calls
    FROM anthropic_usage_log WHERE created_at >= ?
  `).get(monthStart.toISOString());

  const byCallSite = db.prepare(`
    SELECT call_site, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost
    FROM anthropic_usage_log
    WHERE created_at >= ?
    GROUP BY call_site
    ORDER BY cost DESC
  `).all(monthStart.toISOString());

  const topProfiles = db.prepare(`
    SELECT u.profile_id, p.name, p.phone, COUNT(*) AS calls, COALESCE(SUM(u.cost_usd), 0) AS cost
    FROM anthropic_usage_log u
    LEFT JOIN customer_profiles p ON p.id = u.profile_id
    WHERE u.created_at >= ? AND u.profile_id IS NOT NULL
    GROUP BY u.profile_id
    ORDER BY cost DESC
    LIMIT 10
  `).all(monthStart.toISOString());

  const cacheReads = totals.cache_read_tokens || 0;
  const cacheCreates = totals.cache_creation_tokens || 0;
  const cacheHitRate = (cacheReads + cacheCreates) > 0
    ? Math.round((cacheReads / (cacheReads + cacheCreates)) * 100)
    : 0;

  return {
    totals,
    today: { cost: today.cost, calls: today.calls },
    week: { cost: week.cost, calls: week.calls },
    month: { cost: month.cost, calls: month.calls },
    byCallSite,
    topProfiles,
    cacheHitRate,
  };
}

function getConversationCompaction(profileId) {
  return db.prepare('SELECT * FROM conversation_compactions WHERE profile_id = ?').get(profileId);
}

function upsertConversationCompaction({ profileId, throughMessageId, summary, messageCount }) {
  db.prepare(`
    INSERT INTO conversation_compactions (profile_id, through_message_id, summary, message_count, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(profile_id) DO UPDATE SET
      through_message_id = excluded.through_message_id,
      summary = excluded.summary,
      message_count = excluded.message_count,
      updated_at = CURRENT_TIMESTAMP
  `).run(profileId, throughMessageId, summary, messageCount);
}

function markWhatsAppMessageProcessed(messageId) {
  try {
    db.prepare('INSERT INTO processed_wa_messages (message_id) VALUES (?)').run(messageId);
    return true;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return false;
    throw err;
  }
}

function purgeOldWhatsAppMessages() {
  db.prepare("DELETE FROM processed_wa_messages WHERE processed_at < datetime('now', '-7 days')").run();
}

module.exports = {
  db,
  seedAdminFromEnv,
  findUserByUsername,
  createSession,
  findSession,
  deleteSession,
  purgeExpiredSessions,
  recordBusinessVersion,
  listBusinessVersions,
  getBusinessVersion,
  seedInitialBusinessVersion,
  getOrCreateProfileBySession,
  recordCustomerMessage,
  getCustomerMessages,
  listCustomerProfiles,
  getCustomerProfile,
  updateCustomerProfile,
  addBusinessDocument,
  listBusinessDocuments,
  getBusinessDocument,
  deleteBusinessDocument,
  addCustomerAttachment,
  getAttachmentsForMessage,
  getAttachmentById,
  createBooking,
  getBookingById,
  listBookings,
  listBookingsForProfile,
  listBookingsBetween,
  cancelBooking,
  upsertCustomerSummary,
  getCustomerSummary,
  getGoogleConnection,
  saveGoogleConnection,
  updateGoogleTokens,
  setGoogleSelection,
  clearGoogleConnection,
  markWhatsAppMessageProcessed,
  purgeOldWhatsAppMessages,
  getConversationCompaction,
  upsertConversationCompaction,
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
};
