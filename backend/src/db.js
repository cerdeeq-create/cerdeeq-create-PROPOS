const { Pool } = require('pg');
const { newDb } = require('pg-mem');

const connectionString = process.env.DATABASE_URL;

let pool;

if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });
} else {
  const mem = newDb();
  const { Pool: MemPool } = mem.adapters.createPg();
  pool = new MemPool();
}

module.exports = { pool };
