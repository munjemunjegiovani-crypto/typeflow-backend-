require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  isProduction,
};

function checkConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is missing. Copy .env.example to .env and fill it in.');
  if (!config.jwtSecret || config.jwtSecret.length < 24) {
    throw new Error('JWT_SECRET is missing or too short (use at least 24 characters).');
  }
}

module.exports = { config, checkConfig };
