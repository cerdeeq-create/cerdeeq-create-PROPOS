const test = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');
const { ensureStarterProducts } = require('./shopData');

test('ensureStarterProducts seeds basic inventory when the products table is empty', async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  await pool.query(`CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
  )`);

  await ensureStarterProducts(pool);

  const { rows } = await pool.query('SELECT sku, name, price, "costPrice", stock FROM products ORDER BY id');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    sku: 'SKU-001',
    name: 'Rice 5kg',
    price: 6000,
    costPrice: 5000,
    stock: 20,
  });
});

