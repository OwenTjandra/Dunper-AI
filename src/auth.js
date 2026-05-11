const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const {
  findUserByUsername,
  createSession,
  findSession,
  deleteSession,
  setUserEmail,
  createLoginCode,
  consumeLoginCode,
} = require('./db');
const { sendLoginCode, generateCode, emailHint } = require('./mailer');

const SESSION_COOKIE = 'frontdesk_session';
const PENDING_COOKIE = 'frontdesk_pending';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000; // matches login_codes expiry

function newSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE);
}

// Short-lived signed cookie used between login step 1 (creds) and step 2 (code).
// Carries the user id + an HMAC so the verify endpoint can identify which user
// the code belongs to without trusting the client to pass it.
function setPendingCookie(res, userId) {
  const payload = String(userId);
  const sig = signPending(payload);
  res.cookie(PENDING_COOKIE, `${payload}.${sig}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: PENDING_TTL_MS,
  });
}
function clearPendingCookie(res) { res.clearCookie(PENDING_COOKIE); }
function readPendingCookie(req) {
  const raw = req.cookies?.[PENDING_COOKIE];
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  if (signPending(payload) !== sig) return null;
  return Number(payload);
}
function signPending(payload) {
  // Sign with the session-secret derived from .env if set, else a stable per-process key.
  const secret = process.env.PENDING_LOGIN_SECRET || process.env.ANTHROPIC_API_KEY || 'dev-secret';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24);
}

function attachUser(req, _res, next) {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) {
    const session = findSession(sid);
    if (session) req.user = { id: session.user_id, username: session.username, role: session.role };
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.redirect('/dunper_signin.html');
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/dunper_signin.html');
    }
    if (req.user.role !== role) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Forbidden: wrong role' });
      }
      const target = req.user.role === 'founder' ? '/operator.html' : '/admin.html';
      return res.redirect(target);
    }
    next();
  };
}

const requireFounder = requireRole('founder');
const requireBusinessOwner = requireRole('business_owner');

const router = express.Router();

// Step 1 — verify creds. If the user has 2FA on, mail a code and return
// { step: 'verify', hint }. If not, log them straight in (legacy path —
// the deploy checklist recommends getting everyone onto 2FA before launch).
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = findUserByUsername(username);
  const ok = user && bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

  // Dev escape hatch — DISABLE_2FA=1 in .env skips the email-code step
  // entirely and signs the user in with just username + password. Refuses
  // to apply when NODE_ENV=production so this can never accidentally
  // weaken the live deploy. Prints a warning every time it fires.
  const bypass2FA =
    process.env.DISABLE_2FA === '1' &&
    process.env.NODE_ENV !== 'production';

  if (!bypass2FA && user.twofa_enabled && user.email) {
    const code = generateCode();
    createLoginCode(user.id, code);
    await sendLoginCode(user.email, code, user.username);
    setPendingCookie(res, user.id);
    return res.json({
      ok: true,
      step: 'verify',
      hint: emailHint(user.email),
    });
  }
  if (bypass2FA && user.twofa_enabled) {
    console.warn(`[auth] DISABLE_2FA=1 — bypassing 2FA for ${user.username}. NEVER set this in production.`);
  }

  // No 2FA — fall through to direct session (legacy)
  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString().replace('T', ' ').replace('Z', '');
  createSession(sessionId, user.id, expiresAt);
  setSessionCookie(res, sessionId);
  return res.json({ ok: true, step: 'done', user: { username: user.username, role: user.role } });
});

// Step 2 — verify the 6-digit code that was emailed to the user.
router.post('/verify-2fa', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code required' });

  const userId = readPendingCookie(req);
  if (!userId) return res.status(401).json({ error: 'Login session expired — please sign in again.' });

  const cleanCode = String(code).replace(/\D/g, '');
  const ok = consumeLoginCode(userId, cleanCode);
  if (!ok) return res.status(401).json({ error: 'Invalid or expired code.' });

  // Look up user by id to put their role on the session
  const { db } = require('./db');
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(401).json({ error: 'Account not found.' });

  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString().replace('T', ' ').replace('Z', '');
  createSession(sessionId, user.id, expiresAt);
  setSessionCookie(res, sessionId);
  clearPendingCookie(res);
  return res.json({ ok: true, user: { username: user.username, role: user.role } });
});

// Resend the code for the pending login session.
router.post('/resend-2fa', async (req, res) => {
  const userId = readPendingCookie(req);
  if (!userId) return res.status(401).json({ error: 'Login session expired — please sign in again.' });
  const { db } = require('./db');
  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
  if (!user || !user.email) return res.status(400).json({ error: '2FA not configured for this account.' });
  const code = generateCode();
  createLoginCode(user.id, code);
  await sendLoginCode(user.email, code, user.username);
  res.json({ ok: true, hint: emailHint(user.email) });
});

// Update the linked 2FA email — requires the user to be signed in already.
router.post('/set-email', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in first.' });
  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  setUserEmail(req.user.id, email.trim());
  res.json({ ok: true, email: email.trim() });
});

router.post('/logout', (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) deleteSession(sid);
  clearSessionCookie(res);
  clearPendingCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: { username: req.user.username, role: req.user.role } });
});

module.exports = { router, attachUser, requireAuth, requireFounder, requireBusinessOwner };
