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
      p.id, p.session_id, p.name, p.phone, p.notes,
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
      (profile_id, customer_name, customer_phone, customer_email, service_name, duration_minutes, starts_at, ends_at, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    b.notes ?? null
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
};
