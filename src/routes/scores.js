const express = require('express');
const { requireAuth } = require('../middleware/auth');

module.exports = function scoreRoutes(pool, secret) {
  const router = express.Router();

  // A logged-in user sends a typing test score.
  router.post('/scores', requireAuth(secret), async (req, res, next) => {
    try {
      const wpm = Number(req.body.wpm);
      const accuracy = Number(req.body.accuracy);
      const duration = Math.round(Number(req.body.durationSeconds));
      if (!Number.isFinite(wpm) || wpm < 0 || wpm > 300) {
        return res.status(400).json({ error: 'The speed must be a number from 0 to 300.' });
      }
      if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
        return res.status(400).json({ error: 'The accuracy must be a number from 0 to 100.' });
      }
      if (!Number.isFinite(duration) || duration < 15 || duration > 3600) {
        return res.status(400).json({ error: 'The test time must be from 15 to 3600 seconds.' });
      }
      await pool.query(
        'INSERT INTO scores (user_id, wpm, accuracy, duration_seconds) VALUES ($1, $2, $3, $4)',
        [req.userId, wpm.toFixed(1), accuracy.toFixed(1), duration]
      );
      return res.status(201).json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // Anyone can see the best score of each user (accuracy 90% or more).
  router.get('/leaderboard', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const result = await pool.query(
        `SELECT u.display_name, s.wpm, s.accuracy, s.created_at
         FROM (
           SELECT DISTINCT ON (user_id) *
           FROM scores
           WHERE accuracy >= 90
           ORDER BY user_id, wpm DESC, created_at ASC
         ) s
         JOIN users u ON u.id = s.user_id
         ORDER BY s.wpm DESC, s.created_at ASC
         LIMIT $1`,
        [limit]
      );
      const entries = result.rows.map((row, i) => ({
        rank: i + 1,
        displayName: row.display_name,
        wpm: Number(row.wpm),
        accuracy: Number(row.accuracy),
        date: row.created_at,
      }));
      return res.json({ entries });
    } catch (err) {
      return next(err);
    }
  });

  return router;
};
