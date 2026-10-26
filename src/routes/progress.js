const express = require('express');
const { requireAuth } = require('../middleware/auth');

// The only items a user may save. They match the names used by the website.
const ALLOWED_KEYS = [
  'profile',
  'settings',
  'results',
  'lessonProgress',
  'customTexts',
  'gameResults',
  'activityMinutes',
  'achievements',
  'goalCompletions',
  'goalMarker',
  'keyStats',
];

module.exports = function progressRoutes(pool, secret) {
  const router = express.Router();
  const auth = requireAuth(secret);

  router.get('/progress', auth, async (req, res, next) => {
    try {
      const result = await pool.query('SELECT key, value, updated_at FROM user_data WHERE user_id = $1', [req.userId]);
      const data = {};
      let updatedAt = null;
      for (const row of result.rows) {
        data[row.key] = row.value;
        if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at;
      }
      return res.json({ data, updatedAt });
    } catch (err) {
      return next(err);
    }
  });

  router.put('/progress', auth, async (req, res, next) => {
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Send the progress as an object called "data".' });
    }
    const entries = Object.entries(data).filter(([key]) => ALLOWED_KEYS.includes(key));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        await client.query(
          `INSERT INTO user_data (user_id, key, value, updated_at)
           VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [req.userId, key, JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
      return res.json({ ok: true, saved: entries.length });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      return next(err);
    } finally {
      client.release();
    }
  });

  return router;
};

module.exports.ALLOWED_KEYS = ALLOWED_KEYS;
