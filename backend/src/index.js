const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'pos_jwt_secret';
const app = express();
const db = new Database(path.resolve(__dirname, '..', 'data', 'pos.sqlite'));

app.use(cors());
app.use(express.json());

function initDatabase() {
  db.prepare(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier'
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datetime TEXT NOT NULL,
    total REAL NOT NULL,
    paymentMethod TEXT NOT NULL,
    cashierName TEXT NOT NULL DEFAULT 'Unknown'
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saleId INTEGER NOT NULL,
    productId INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY(saleId) REFERENCES sales(id),
    FOREIGN KEY(productId) REFERENCES products(id)
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    userId INTEGER NOT NULL,
    expiresAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`).run();

  db.prepare('DELETE FROM refresh_tokens WHERE expiresAt < ?').run(new Date().toISOString());

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (userCount.count === 0) {
    const adminPassword = bcrypt.hashSync('admin123', 10);
    const cashierPassword = bcrypt.hashSync('12345', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', adminPassword, 'admin');
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('cashier', cashierPassword, 'cashier');
  }

  const columns = db.prepare("PRAGMA table_info(sales)").all();
  if (!columns.some((col) => col.name === 'cashierName')) {
    db.prepare('ALTER TABLE sales ADD COLUMN cashierName TEXT NOT NULL DEFAULT "Unknown"').run();
  }
}

initDatabase();

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY name').all();
  res.json(products);
});

app.post('/api/products', authenticateToken, requireAdmin, (req, res) => {
  const { sku, name, price, stock } = req.body;
  const stmt = db.prepare('INSERT INTO products (sku, name, price, stock) VALUES (?, ?, ?, ?)');
  try {
    const result = stmt.run(sku, name, price, stock);
    res.status(201).json({ id: result.lastInsertRowid, sku, name, price, stock });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function saveRefreshToken(token, userId) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, userId, expiresAt);
}

function deleteRefreshToken(token) {
  db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
}

function findValidRefreshToken(token) {
  const tokenRow = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token);
  if (!tokenRow) {
    return null;
  }
  if (new Date(tokenRow.expiresAt) < new Date()) {
    deleteRefreshToken(token);
    return null;
  }
  return tokenRow;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role FROM users ORDER BY username').all();
  res.json(users);
});

app.post('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const userRole = role === 'admin' ? 'admin' : 'cashier';
  const hashedPassword = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashedPassword, userRole);
    res.status(201).json({ id: result.lastInsertRowid, username, role: userRole });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT id, username, password, role FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '15m',
  });
  const refreshToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });
  saveRefreshToken(refreshToken, user.id);
  res.json({ id: user.id, username: user.username, role: user.role, token, refreshToken });
});

app.post('/api/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }
  const storedToken = findValidRefreshToken(refreshToken);
  if (!storedToken) {
    return res.status(403).json({ error: 'Invalid refresh token' });
  }
  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET);
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      deleteRefreshToken(refreshToken);
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    deleteRefreshToken(refreshToken);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
      expiresIn: '15m',
    });
    const newRefreshToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
      expiresIn: '7d',
    });
    saveRefreshToken(newRefreshToken, user.id);
    res.json({ token, refreshToken: newRefreshToken });
  } catch (err) {
    deleteRefreshToken(refreshToken);
    return res.status(403).json({ error: 'Invalid refresh token' });
  }
});

app.post('/api/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    deleteRefreshToken(refreshToken);
  }
  res.status(204).end();
});

app.put('/api/products/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { sku, name, price, stock } = req.body;
  const stmt = db.prepare('UPDATE products SET sku = ?, name = ?, price = ?, stock = ? WHERE id = ?');
  const result = stmt.run(sku, name, price, stock, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json({ id: Number(id), sku, name, price, stock });
});

app.delete('/api/products/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const stmt = db.prepare('DELETE FROM products WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.status(204).end();
});

app.post('/api/sales', authenticateToken, (req, res) => {
  const { items, paymentMethod } = req.body;
  const cashierName = req.user?.username || 'Unknown';
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Sale items are required' });
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const stmtSale = db.prepare('INSERT INTO sales (datetime, total, paymentMethod, cashierName) VALUES (?, ?, ?, ?)');
  const resultSale = stmtSale.run(new Date().toISOString(), total, paymentMethod, cashierName || 'Unknown');
  const saleId = resultSale.lastInsertRowid;

  const stmtItem = db.prepare('INSERT INTO sale_items (saleId, productId, quantity, price) VALUES (?, ?, ?, ?)');
  const stmtUpdateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  const insertItem = db.transaction((itemsList) => {
    for (const item of itemsList) {
      stmtItem.run(saleId, item.productId, item.quantity, item.price);
      stmtUpdateStock.run(item.quantity, item.productId);
    }
  });

  insertItem(items);
  res.status(201).json({ saleId, total, paymentMethod, items });
});

app.get('/api/reports/sales', (req, res) => {
  const sales = db.prepare('SELECT * FROM sales ORDER BY datetime DESC').all();
  const salesWithItems = sales.map((sale) => {
    const items = db.prepare(
      'SELECT si.*, p.name, p.sku FROM sale_items si JOIN products p ON si.productId = p.id WHERE si.saleId = ?'
    ).all(sale.id);
    return { ...sale, items };
  });
  res.json(salesWithItems);
});

app.listen(4000, () => {
  console.log('POS backend listening on http://localhost:4000');
});
