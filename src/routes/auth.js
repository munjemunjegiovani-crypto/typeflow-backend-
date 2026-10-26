const express = require('express');
const bcrypt = require('bcryptjs');
const { signToken, requireAuth } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}

module.exports = function authRoutes(pool, secret, authLimiter) {
  const router = express.Router();

  router.post('/auth/register', authLimiter, async (req, res, next) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const displayName = String(req.body.displayName || '').trim();

      if (!EMAIL_RE.test(email) || email.length > 254) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (password.length < 8 || password.length > 72) {
        return res.status(400).json({ error: 'The password must have 8 to 72 characters.' });
      }
      if (displayName.length < 2 || displayName.length > 20) {
        return res.status(400).json({ error: 'The display name must have 2 to 20 characters.' });
      }

      const hash = await bcrypt.hash(password, 10);
      let row;
      try {
        const result = await pool.query(
          'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *',
          [email, hash, displayName]
        );
        row = result.rows[0];
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: 'This email already has an account. Try to log in.' });
        }
        throw err;
      }
      return res.status(201).json({ token: signToken(row, secret), user: publicUser(row) });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/auth/login', authLimiter, async (req, res, next) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const row = result.rows[0];
      // Same message for a wrong email and a wrong password, on purpose.
      const ok = row ? await bcrypt.compare(password, row.password_hash) : false;
      if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
      return res.json({ token: signToken(row, secret), user: publicUser(row) });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/me', requireAuth(secret), async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      if (!result.rows[0]) return res.status(401).json({ error: 'This account no longer exists.' });
      return res.json({ user: publicUser(result.rows[0]) });
    } catch (err) {
      return next(err);
    }
  });

  router.delete('/me', requireAuth(secret), async (req, res, next) => {
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
};
