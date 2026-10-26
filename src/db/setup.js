// Makes the tables in the database.  Run with:  npm run db:setup
const fs = require('fs');
const path = require('path');
const { config, checkConfig } = require('../config');
const { createPool } = require('./pool');

async function applySchema(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

if (require.main === module) {
  checkConfig();
  const pool = createPool(config.databaseUrl, config.databaseSsl);
  applySchema(pool)
    .then(() => console.log('Database tables are ready.'))
    .catch((err) => {
      console.error('Could not set up the database:', err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { applySchema };
