const { Pool, types } = require('pg');

// node-pg returns NUMERIC / INT8 as strings — parse to real numbers,
// otherwise amounts concat ("0"+"13244"="013244") and numeric merge guards fail.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

// Local dev uses the LAN Postgres below; production sets DATABASE_URL.
// SSL only when the URL asks for it (Neon: ?sslmode=require). The on-VM
// Postgres has no SSL — forcing it breaks with "server does not support SSL".
const _dbUrl = process.env.DATABASE_URL || '';
const _needSSL = /sslmode=require/i.test(_dbUrl);
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: _needSSL ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'wandersync',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'Postgres@0809',
    });

pool.on('error', (err) => {
  console.error('Unexpected PG error:', err);
});

module.exports = pool;
