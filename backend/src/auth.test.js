const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const { ensureDefaultUsers } = require('./auth');

test('ensureDefaultUsers creates admin and cashier accounts when the users table is empty', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-auth-'));
  const dbPath = path.join(tempDir, 'pos.sqlite');
  const db = new DatabaseSync(dbPath);

  db.prepare(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    fullName TEXT NOT NULL DEFAULT ''
  )`).run();

  ensureDefaultUsers(db);

  const rows = db.prepare('SELECT username, role FROM users ORDER BY id').all().map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    { username: 'admin', role: 'admin' },
    { username: 'cashier', role: 'cashier' },
  ]);

  const adminRow = db.prepare('SELECT password FROM users WHERE username = ?').get('admin');
  assert.match(adminRow.password, /^\$2[aby]\$/);
});
