const test = require('node:test');
const assert = require('node:assert/strict');

const dbModulePath = require.resolve('./db');

function resetDbModule() {
  delete require.cache[dbModulePath];
}

test('db falls back to pg-mem when DATABASE_URL is not configured', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetDbModule();

  try {
    const { pool } = require('./db');
    assert.ok(pool);
    const result = await pool.query('SELECT 1 AS ok');
    assert.deepEqual(result.rows[0], { ok: 1 });
  } finally {
    resetDbModule();
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
  }
});
