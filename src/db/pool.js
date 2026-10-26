const { Pool } = require('pg');
const { config } = require('../config');

function createPool(connectionString = config.databaseUrl, ssl = config.databaseSsl) {
  return new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}

module.exports = { createPool };
