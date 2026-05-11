const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
  findUserByUsername,
  createBusinessOwnerUser,
  createSession,
  findSession,
  deleteSession,
  setUserEmail,
  createLoginCode,
  consumeLoginCode,
  createSalesClient,
} = require('./db');
const { sendLoginCode, generateCode, emailHint } = require('./mailer');

// Brute-force guard for auth endpoints. Without this, /login + /verify-2fa
// are wide open — 1M-space 6-digit codes fall in well under an hour at
// even modest request rates. 20 attempts / 15 min / IP is generous for
// real humans and prohibitive for sprayers.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'Too many auth attempts — try again in a few minutes.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const SESSION_COOKIE = 'frontdesk_session';
const PENDING_COOKIE = 'frontdesk_pending';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000; // matches login_codes expiry
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

function newSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
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
    secure: COOKIE_SECURE,
    maxAge: PENDING_TTL_MS,
  });
}
function clearPendingCookie(res) { res.clearCookie(PENDING_COOKIE); }
function readPendingCookie(req) {
  const raw = req.cookies?.[PENDING_COOKIE];
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(signPending(payload), sig)) return null;
  return Number(payload);
}
function signPending(payload) {
  // Sign with the session-secret derived from .env if set, else a stable per-process key.
  const secret = process.env.PENDING_LOGIN_SECRET || process.env.ANTHROPIC_API_KEY || 'dev-secret';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24);
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
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

// Throttle every auth path. /me is read-only and very chatty from admin.js,
// so it's exempt — apply the limiter only to mutating endpoints.
const THROTTLED_AUTH_PATHS = ['/login', '/signup', '/verify-2fa', '/resend-2fa', '/set-email'];
router.use((req, res, next) => {
  if (THROTTLED_AUTH_PATHS.includes(req.path)) return authLimiter(req, res, next);
  next();
});

// Bcrypt cost-10 dummy hash — compared against on lookup misses so the
// response time for "user doesn't exist" matches a real bcrypt verify.
// Avoids username enumeration via timing side-channel.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('dunper-timing-dummy', 10);

// Step 1 — verify creds. If the user has 2FA on, mail a code and return
// { step: 'verify', hint }. If not, log them straight in (legacy path —
// the deploy checklist recommends getting everyone onto 2FA before launch).
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = findUserByUsername(username);
  // Always do the bcrypt compare, even on lookup misses, so timing doesn't
  // leak whether the username exists.
  const compareHash = user ? user.password_hash : DUMMY_BCRYPT_HASH;
  const passwordOk = bcrypt.compareSync(password, compareHash);
  const ok = user && passwordOk;
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

// Self-service signup from the marketing site. Creates a business_owner
// account. If an email is provided, kicks off the 2FA flow (same as login
// step 1); otherwise issues a session immediately. Username is the email
// when one is given — otherwise we accept whatever was supplied.
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName  = (name  || '').trim();

  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'That email address looks malformed.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  // Use email as username so existing username-keyed login flow works.
  const user = createBusinessOwnerUser({ username: cleanEmail, password, email: cleanEmail });
  if (!user) {
    return res.status(409).json({ error: 'An account with that email already exists. Try logging in.' });
  }

  // Mirror the new signup into sales_clients so it shows up on the
  // Founder Dashboard right away (status=lead until they convert/pay).
  try {
    createSalesClient({
      businessName: cleanName || cleanEmail,
      contactName: cleanName || null,
      contactEmail: cleanEmail,
      status: 'lead',
      notes: `Self-service signup via dunper.com on ${new Date().toISOString().slice(0, 10)}`,
    });
  } catch (err) {
    console.warn('[signup] could not mirror to sales_clients:', err.message);
  }

  // If SMTP isn't configured we can't actually deliver the 2FA code, so
  // fall back to a direct session (still useful for local demo).
  const smtpReady = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
  if (smtpReady) {
    const code = generateCode();
    createLoginCode(user.id, code);
    try {
      await sendLoginCode(cleanEmail, code, cleanName || cleanEmail);
      setPendingCookie(res, user.id);
      return res.json({ ok: true, step: 'verify', hint: emailHint(cleanEmail) });
    } catch (err) {
      console.warn('[signup] SMTP send failed — falling back to direct session:', err.message);
    }
  }

  // Direct session (no email step) — first-run, dev, or SMTP misconfigured.
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
