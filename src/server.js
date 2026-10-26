const { config, checkConfig } = require('./config');
const { createPool } = require('./db/pool');
const { createApp } = require('./app');

checkConfig();
const pool = createPool();
const app = createApp(pool, { jwtSecret: config.jwtSecret, corsOrigins: config.corsOrigins });

app.listen(config.port, () => {
  console.log(`TypeFlow backend is running on port ${config.port}`);
});
