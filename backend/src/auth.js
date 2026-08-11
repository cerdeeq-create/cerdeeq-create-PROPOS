const bcrypt = require('bcryptjs');

async function ensureDefaultUsers(db) {
  const { rows } = await db.query('SELECT COUNT(*) AS count FROM users');
  if (Number(rows[0].count) === 0) {
    await db.query('INSERT INTO users (username, password, role, "fullName") VALUES ($1, $2, $3, $4)', ['admin', bcrypt.hashSync('admin123', 10), 'admin', 'Admin']);
    await db.query('INSERT INTO users (username, password, role, "fullName") VALUES ($1, $2, $3, $4)', ['cashier', bcrypt.hashSync('12345', 10), 'cashier', 'Cashier']);
  }
}

module.exports = { ensureDefaultUsers };

