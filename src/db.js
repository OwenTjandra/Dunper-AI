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
};
