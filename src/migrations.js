const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3,}.*\.sql$/.test(f))
    .sort();
}

function applied(db) {
  return new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

function makeAlterAddColumnIdempotent(db, sql) {
  return sql.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+([^;]+);/gi, (stmt, table, column) => {
    return columnExists(db, table, column) ? `-- skipped existing column: ${table}.${column};` : stmt;
  });
}

function runPending(db) {
  ensureMigrationsTable(db);
  const done = applied(db);
  const files = listMigrationFiles();
  const pending = files.filter(f => !done.has(f));
  if (pending.length === 0) return { applied: [] };

  const applyOne = db.transaction((file) => {
    const sql = makeAlterAddColumnIdempotent(db, fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    if (sql.trim()) db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
  });

  const appliedNow = [];
  for (const file of pending) {
    try {
      applyOne(file);
      appliedNow.push(file);
      console.log(`[Migrations] applied ${file}`);
    } catch (err) {
      console.error(`[Migrations] FAILED on ${file}:`, err.message);
      throw err;
    }
  }
  return { applied: appliedNow };
}

module.exports = { runPending, listMigrationFiles };
