const test = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');
const { ensureDefaultUsers } = require('./auth');

test('ensureDefaultUsers creates admin and cashier accounts when the users table is empty', async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  await pool.query(`CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    "fullName" TEXT NOT NULL DEFAULT ''
  )`);

  await ensureDefaultUsers(pool);

  const { rows } = await pool.query('SELECT username, role FROM users ORDER BY id');
  assert.deepEqual(rows, [
    { username: 'admin', role: 'admin' },
    { username: 'cashier', role: 'cashier' },
  ]);

  const adminResult = await pool.query('SELECT password FROM users WHERE username = $1', ['admin']);
  assert.match(adminResult.rows[0].password, /^\$2[aby]\$/);
});

