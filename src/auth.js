const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const {
  findUserByUsername,
  createSession,
  findSession,
  deleteSession,
} = require('./db');

const SESSION_COOKIE = 'frontdesk_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function attachUser(req, _res, next) {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) {
    const session = findSession(sid);
    if (session) req.user = { id: session.user_id, username: session.username };
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.redirect('/login.html');
}

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = findUserByUsername(username);
  const ok = user && bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString().replace('T', ' ').replace('Z', '');
  createSession(sessionId, user.id, expiresAt);
  setSessionCookie(res, sessionId);

  res.json({ ok: true, user: { username: user.username } });
});

router.post('/logout', (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) deleteSession(sid);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: { username: req.user.username } });
});

module.exports = { router, attachUser, requireAuth };
