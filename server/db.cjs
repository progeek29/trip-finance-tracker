const { Pool, types } = require('pg');

// node-pg returns NUMERIC / INT8 as strings — parse to real numbers,
// otherwise amounts concat ("0"+"13244"="013244") and numeric merge guards fail.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'wandersync',
  user: 'postgres',
  password: 'Postgres@0809',
});

pool.on('error', (err) => {
  console.error('Unexpected PG error:', err);
});

module.exports = pool;
