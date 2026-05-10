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
    if (session) req.user = { id: session.user_id, username: session.username, role: session.role };
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

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login.html');
    }
    if (req.user.role !== role) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Forbidden: wrong role' });
      }
      // Send the user to their own dashboard rather than a dead-end 403 page.
      const target = req.user.role === 'founder' ? '/operator.html' : '/admin.html';
      return res.redirect(target);
    }
    next();
  };
}

const requireFounder = requireRole('founder');
const requireBusinessOwner = requireRole('business_owner');

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

  res.json({ ok: true, user: { username: user.username, role: user.role } });
});

router.post('/logout', (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) deleteSession(sid);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: { username: req.user.username, role: req.user.role } });
});

module.exports = { router, attachUser, requireAuth, requireFounder, requireBusinessOwner };
