const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const { ensureStarterProducts } = require('./shopData');

test('ensureStarterProducts seeds basic inventory when the products table is empty', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-shop-data-'));
  const dbPath = path.join(tempDir, 'pos.sqlite');
  const db = new DatabaseSync(dbPath);

  db.prepare(`CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    costPrice REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
  )`).run();

  ensureStarterProducts(db);

  const rows = db.prepare('SELECT sku, name, price, costPrice, stock FROM products ORDER BY id').all();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    sku: 'SKU-001',
    name: 'Rice 5kg',
    price: 6000,
    costPrice: 5000,
    stock: 20,
  });
});
