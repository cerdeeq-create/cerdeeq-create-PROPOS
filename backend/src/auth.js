const bcrypt = require('bcryptjs');

function ensureDefaultUsers(db) {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (userCount.count === 0) {
    db.prepare('INSERT INTO users (username, password, role, fullName) VALUES (?, ?, ?, ?)').run('admin', bcrypt.hashSync('admin123', 10), 'admin', 'Admin');
    db.prepare('INSERT INTO users (username, password, role, fullName) VALUES (?, ?, ?, ?)').run('cashier', bcrypt.hashSync('12345', 10), 'cashier', 'Cashier');
  }
}

module.exports = { ensureDefaultUsers };
