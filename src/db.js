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
`);

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
  const allowed = ['name', 'phone', 'notes'];
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
};
