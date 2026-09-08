const { Pool } = require('pg');

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
