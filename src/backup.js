const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const KEEP_DAYS = 7;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

fs.mkdirSync(BACKUP_DIR, { recursive: true });

async function runBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `data-${stamp}.db`);
  try {
    await db.backup(target);
    console.log(`[Backup] saved ${path.basename(target)}`);
    pruneOld();
  } catch (err) {
    console.error('[Backup] failed:', err.message);
  }
}

function pruneOld() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('data-') && f.endsWith('.db'));
  for (const f of files) {
    const stat = fs.statSync(path.join(BACKUP_DIR, f));
    if (stat.mtimeMs < cutoff) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        console.log(`[Backup] pruned old ${f}`);
      } catch {}
    }
  }
}

function startBackupSchedule() {
  setTimeout(() => {
    runBackup();
    setInterval(runBackup, INTERVAL_MS);
  }, 60 * 1000);
  console.log(`[Backup] scheduled every ${INTERVAL_MS / 1000 / 3600}h, keeping ${KEEP_DAYS} days in ${BACKUP_DIR}`);
}

module.exports = { startBackupSchedule, runBackup };
