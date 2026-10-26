const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');
const scoreRoutes = require('./routes/scores');

function createApp(pool, options) {
  const { jwtSecret, corsOrigins, authLimit = 20, generalLimit = 300 } = options;
  const app = express();

  app.set('trust proxy', 1); // the host (Render, Railway...) sits in front of the app
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow the listed websites. Also allow tools with no origin (like curl).
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: generalLimit, standardHeaders: true, legacyHeaders: false }));
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many tries. Please wait a few minutes.' },
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', authRoutes(pool, jwtSecret, authLimiter));
  app.use('/api', progressRoutes(pool, jwtSecret));
  app.use('/api', scoreRoutes(pool, jwtSecret));

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The data is too big.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The data is not valid JSON.' });
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

module.exports = { createApp };
