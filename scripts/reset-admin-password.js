#!/usr/bin/env node
/* Reset (or create) a user's password without wiping data.db.
 *
 * Usage:
 *
 *   node scripts/reset-admin-password.js                       # interactive — prompts for both
 *   node scripts/reset-admin-password.js <username> <password> # one-liner
 *   node scripts/reset-admin-password.js --list                # show all users in data.db
 *
 * What it does:
 *   - Finds the user by username
 *   - bcrypt-hashes the new password (cost 10, same as the seeder)
 *   - UPDATEs the row in `users`
 *   - Optionally creates the row if the username doesn't exist (it'll ask)
 *
 * Why this exists:
 *   The seeder only runs when `users` is empty. Editing ADMIN_PASSWORD in
 *   .env after the table has rows does NOTHING — the seed is idempotent.
 *   This script is the official way to change a password locally.
 */
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');
process.chdir(path.join(__dirname, '..'));

const { db } = require('../src/db');
require('../src/migrations').runPending(db);

function listUsers() {
  const rows = db.prepare(
    "SELECT id, username, role, email, twofa_enabled, datetime(created_at) AS created FROM users ORDER BY id"
  ).all();
  if (!rows.length) {
    console.log('No users in data.db yet. Run the server once to seed the admin from .env, or pass arguments to this script to create one now.');
    return;
  }
  console.log(`\nUsers in data.db (${rows.length}):\n`);
  for (const r of rows) {
    const twofa = r.twofa_enabled ? `2FA → ${r.email || '?'}` : 'no 2FA';
    console.log(`  #${r.id}  ${r.username.padEnd(28)}  role=${r.role.padEnd(15)}  ${twofa}`);
  }
  console.log('');
}

function ask(prompt, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      // Best-effort password masking
      const onData = (char) => { /* swallow visible chars */ };
      process.stdout.write(prompt);
      let buf = '';
      process.stdin.on('data', function listener(d) {
        const s = d.toString('utf8');
        for (const ch of s) {
          if (ch === '\n' || ch === '\r') {
            process.stdin.removeListener('data', listener);
            process.stdout.write('\n');
            rl.close();
            return resolve(buf);
          } else if (ch === '' || ch === '\b') {
            buf = buf.slice(0, -1);
          } else {
            buf += ch;
            process.stdout.write('*');
          }
        }
      });
      process.stdin.resume();
    } else {
      rl.question(prompt, (answer) => { rl.close(); resolve(answer); });
    }
  });
}

function setPassword(username, password) {
  if (!username || !password) {
    console.error('❌ Both username and password are required.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters.');
    process.exit(1);
  }
  const existing = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(username);
  const hash = bcrypt.hashSync(password, 10);
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
    console.log(`✅ Password updated for user '${username}' (role=${existing.role})`);
  } else {
    console.log(`ℹ️  No user '${username}' found.`);
    // Create as business_owner by default. If you want a founder, edit FOUNDERS in .env and restart.
    db.prepare(
      "INSERT INTO users (username, password_hash, role, email, twofa_enabled) VALUES (?, ?, 'business_owner', NULL, 0)"
    ).run(username, hash);
    console.log(`✅ Created new business_owner '${username}' with the supplied password.`);
  }
  console.log(`\nNow log in at http://localhost:3000/dunper_signin.html — username: ${username}, password: (the one you just set).`);
}

async function interactive() {
  console.log('Reset admin password\n');
  listUsers();
  const username = await ask('Username to reset (or new username to create): ');
  if (!username.trim()) { console.error('Empty username, aborting.'); process.exit(1); }
  const password = await ask('New password (min 8 chars, hidden as you type): ', { hidden: true });
  if (!password) { console.error('Empty password, aborting.'); process.exit(1); }
  setPassword(username.trim(), password);
}

const args = process.argv.slice(2);
if (args[0] === '--list' || args[0] === '-l') {
  listUsers();
  process.exit(0);
}
if (args.length >= 2) {
  setPassword(args[0], args.slice(1).join(' '));
  process.exit(0);
}
interactive().catch(err => { console.error(err); process.exit(1); });
