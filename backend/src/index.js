const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { ensureDefaultUsers } = require('./auth');
const { ensureStarterProducts } = require('./shopData');
const { validateProductPayload, validateSalePayload, validatePurchaseOrderPayload, validateReceivingPayload, validateServiceTransactionPayload } = require('./validation');

const JWT_SECRET = process.env.JWT_SECRET || 'pos_jwt_secret';
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4000);
const FRONTEND_BUILD_PATH = process.env.FRONTEND_BUILD_PATH || path.resolve(__dirname, '..', '..', 'frontend', 'build');
const db = new DatabaseSync(path.resolve(__dirname, '..', 'data', 'pos.sqlite'));
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = parsedUrl;

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && !pathname.startsWith('/api')) {
      const served = tryServeFrontend(req, res, pathname);
      if (served) {
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/api/products') {
      const products = db.prepare('SELECT * FROM products ORDER BY name').all();
      return sendJson(res, 200, products);
    }

    if (req.method === 'GET' && pathname === '/api/stock-movements') {
      const movements = db.prepare('SELECT * FROM stock_movements ORDER BY createdAt DESC LIMIT 50').all();
      return sendJson(res, 200, movements);
    }

    if (req.method === 'GET' && pathname === '/api/receiving-history') {
      const history = db.prepare('SELECT * FROM receiving_history ORDER BY date DESC LIMIT 20').all();
      return sendJson(res, 200, history);
    }

    if (req.method === 'GET' && pathname === '/api/service-transactions') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const transactions = db.prepare('SELECT * FROM service_transactions ORDER BY createdAt DESC LIMIT 50').all();
      return sendJson(res, 200, transactions);
    }

    if (req.method === 'POST' && pathname === '/api/service-transactions') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      const validation = validateServiceTransactionPayload(body);
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }

      const now = new Date().toISOString();
      const stmt = db.prepare('INSERT INTO service_transactions (serviceType, beneficiary, phoneNumber, amount, reference, createdAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const result = stmt.run(
        String(body.serviceType || '').trim().toLowerCase(),
        String(body.beneficiary || '').trim(),
        String(body.phoneNumber || '').trim(),
        Number(body.amount) || 0,
        String(body.reference || '').trim() || `svc-${Date.now()}`,
        now,
        user.username || 'Unknown'
      );
      return sendJson(res, 201, { id: result.lastInsertRowid, ...body, createdAt: now, createdBy: user.username || 'Unknown' });
    }

    if (req.method === 'GET' && pathname === '/api/purchase-orders') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const orders = db.prepare('SELECT * FROM purchase_orders ORDER BY createdAt DESC').all();
      return sendJson(res, 200, orders);
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/purchase-orders/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      const body = await readJsonBody(req);
      const { status } = body;
      const nextStatus = status === 'approved' || status === 'completed' ? status : 'pending';
      const result = db.prepare('UPDATE purchase_orders SET status = ?, updatedAt = ? WHERE id = ?').run(nextStatus, new Date().toISOString(), id);
      if (result.changes === 0) {
        return sendJson(res, 404, { error: 'Purchase order not found' });
      }
      const updatedOrder = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
      return sendJson(res, 200, updatedOrder);
    }

    if (req.method === 'POST' && pathname === '/api/purchase-orders') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { supplier, storeAccount, date, items, totalAmount } = body;
      const validation = validatePurchaseOrderPayload({ supplier, items });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const now = new Date().toISOString();
      const stmt = db.prepare('INSERT INTO purchase_orders (supplier, storeAccount, date, itemsJson, totalAmount, createdAt, updatedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const result = stmt.run(supplier || 'Supplier not specified', storeAccount || 'Main Store', date || now, JSON.stringify(items), Number(totalAmount) || 0, now, now, 'pending');
      return sendJson(res, 201, { id: result.lastInsertRowid, supplier, storeAccount, date, totalAmount: Number(totalAmount) || 0, items, createdAt: now, updatedAt: now, itemsJson: JSON.stringify(items), status: 'pending' });
    }

    if (req.method === 'POST' && pathname === '/api/receiving-history') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { supplier, storeAccount, date, items, totalAmount, purchaseOrderId } = body;
      const validation = validateReceivingPayload({ supplier, items });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const stmt = db.prepare('INSERT INTO receiving_history (supplier, storeAccount, date, itemsJson, totalAmount, purchaseOrderId) VALUES (?, ?, ?, ?, ?, ?)');
      const result = stmt.run(supplier || 'Supplier not specified', storeAccount || 'Main Store', date || new Date().toISOString(), JSON.stringify(items), Number(totalAmount) || 0, purchaseOrderId || null);
      const movementStmt = db.prepare('INSERT INTO stock_movements (productId, productName, movementType, quantity, createdAt, note) VALUES (?, ?, ?, ?, ?, ?)');
      items.forEach((item) => {
        movementStmt.run(0, item.name, 'receiving', Math.abs(Number(item.quantity) || 0), new Date().toISOString(), `Received from ${supplier || 'supplier'}`);
      });
      return sendJson(res, 201, { id: result.lastInsertRowid, supplier, storeAccount, date, totalAmount: Number(totalAmount) || 0, items });
    }

    if (req.method === 'POST' && pathname === '/api/products') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { sku, name, price, stock, costPrice } = body;
      const validation = validateProductPayload({ sku, name, price, costPrice, stock });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const stmt = db.prepare('INSERT INTO products (sku, name, price, costPrice, stock) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(sku, name, price, Number(costPrice) || 0, stock);
      return sendJson(res, 201, { id: result.lastInsertRowid, sku, name, price, costPrice: Number(costPrice) || 0, stock });
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const users = db.prepare('SELECT id, username, fullName, role FROM users ORDER BY username').all();
      return sendJson(res, 200, users);
    }

    if (req.method === 'POST' && pathname === '/api/users') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const body = await readJsonBody(req);
      const { fullName, username, password, role } = body;
      if (!username || !password) {
        return sendJson(res, 400, { error: 'Username and password are required' });
      }
      const userRole = role === 'admin' ? 'admin' : 'cashier';
      const safeFullName = (fullName || '').trim() || username;
      const hashedPassword = hashPassword(password);
      const result = db.prepare('INSERT INTO users (username, password, role, fullName) VALUES (?, ?, ?, ?)').run(username, hashedPassword, userRole, safeFullName);
      return sendJson(res, 201, { id: result.lastInsertRowid, username, fullName: safeFullName, role: userRole });
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/users/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      const body = await readJsonBody(req);
      const { fullName, username, password, role } = body;
      if (!username) {
        return sendJson(res, 400, { error: 'Username is required' });
      }
      const userRole = role === 'admin' ? 'admin' : 'cashier';
      const safeFullName = (fullName || '').trim() || username;
      const updates = [];
      const values = [];
      updates.push('username = ?'); values.push(username);
      updates.push('role = ?'); values.push(userRole);
      updates.push('fullName = ?'); values.push(safeFullName);
      if (password) {
        updates.push('password = ?'); values.push(hashPassword(password));
      }
      values.push(id);
      const result = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      if (result.changes === 0) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      return sendJson(res, 200, { id: Number(id), username, fullName: safeFullName, role: userRole });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/users/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      db.prepare('DELETE FROM refresh_tokens WHERE userId = ?').run(id);
      const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
      if (result.changes === 0) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readJsonBody(req);
      const { username, password } = body;
      const user = db.prepare('SELECT id, username, password, role FROM users WHERE username = ?').get(username);
      if (!user || !verifyPassword(password, user.password)) {
        return sendJson(res, 401, { error: 'Invalid username or password' });
      }
      const token = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '15m');
      const refreshToken = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '7d');
      saveRefreshToken(refreshToken, user.id);
      return sendJson(res, 200, { id: user.id, username: user.username, role: user.role, token, refreshToken });
    }

    if (req.method === 'POST' && pathname === '/api/refresh') {
      const body = await readJsonBody(req);
      const { refreshToken } = body;
      if (!refreshToken) {
        return sendJson(res, 400, { error: 'Refresh token required' });
      }
      const storedToken = findValidRefreshToken(refreshToken);
      if (!storedToken) {
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      const payload = verifyToken(refreshToken, JWT_SECRET);
      if (!payload) {
        deleteRefreshToken(refreshToken);
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(payload.id);
      if (!user) {
        deleteRefreshToken(refreshToken);
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      deleteRefreshToken(refreshToken);
      const token = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '15m');
      const newRefreshToken = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '7d');
      saveRefreshToken(newRefreshToken, user.id);
      return sendJson(res, 200, { token, refreshToken: newRefreshToken });
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const body = await readJsonBody(req);
      const { refreshToken } = body;
      if (refreshToken) {
        deleteRefreshToken(refreshToken);
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/products/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      const body = await readJsonBody(req);
      const { sku, name, price, stock, costPrice } = body;
      const validation = validateProductPayload({ sku, name, price, costPrice, stock });
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const result = db.prepare('UPDATE products SET sku = ?, name = ?, price = ?, costPrice = ?, stock = ? WHERE id = ?').run(sku, name, price, Number(costPrice) || 0, stock, id);
      if (result.changes === 0) {
        return sendJson(res, 404, { error: 'Product not found' });
      }
      return sendJson(res, 200, { id: Number(id), sku, name, price, costPrice: Number(costPrice) || 0, stock });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/products/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      db.prepare('DELETE FROM sale_items WHERE productId = ?').run(id);
      const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
      if (result.changes === 0) {
        return sendJson(res, 404, { error: 'Product not found' });
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'POST' && pathname === '/api/sales') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      const { items, paymentMethod, discountType = 'none', discountValue = '0' } = body;
      const productRows = db.prepare('SELECT id, stock FROM products').all();
      const validation = validateSalePayload({ items, paymentMethod, discountType, discountValue }, productRows);
      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }
      const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
      const parsedDiscountValue = Number(discountValue) || 0;
      let discountAmount = 0;
      if (discountType === 'amount') {
        discountAmount = Math.max(0, parsedDiscountValue);
      } else if (discountType === 'percent') {
        discountAmount = Math.max(0, subtotal * (parsedDiscountValue / 100));
      }
      const total = Math.max(0, subtotal - discountAmount);
      const costTotal = items.reduce((sum, item) => sum + (Number(item.costPrice) || 0) * item.quantity, 0);
      const profit = total - costTotal;
      db.exec('BEGIN');
      try {
        const resultSale = db.prepare('INSERT INTO sales (datetime, total, profit, paymentMethod, cashierName) VALUES (?, ?, ?, ?, ?)').run(new Date().toISOString(), total, profit, paymentMethod, user.username || 'Unknown');
        const saleId = resultSale.lastInsertRowid;
        const stmtItem = db.prepare('INSERT INTO sale_items (saleId, productId, quantity, price, costPrice) VALUES (?, ?, ?, ?, ?)');
        const stmtUpdateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        const stmtMovement = db.prepare('INSERT INTO stock_movements (productId, productName, movementType, quantity, createdAt, note) VALUES (?, ?, ?, ?, ?, ?)');
        for (const item of items) {
          stmtItem.run(saleId, item.productId, item.quantity, item.price, Number(item.costPrice) || 0);
          stmtUpdateStock.run(item.quantity, item.productId);
          stmtMovement.run(item.productId, item.name, 'sale', -Math.abs(Number(item.quantity) || 0), new Date().toISOString(), `Sale #${saleId}`);
        }
        db.exec('COMMIT');
        return sendJson(res, 201, { saleId, subtotal, discountAmount, total, profit, paymentMethod, items });
      } catch (error) {
        db.exec('ROLLBACK');
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (req.method === 'GET' && pathname === '/api/reports/sales') {
      const sales = db.prepare('SELECT * FROM sales ORDER BY datetime DESC').all();
      const salesWithItems = sales.map((sale) => {
        const items = db.prepare('SELECT si.*, p.name, p.sku, CASE WHEN si.costPrice IS NOT NULL AND si.costPrice <> 0 THEN si.costPrice ELSE p.costPrice END AS costPrice FROM sale_items si JOIN products p ON si.productId = p.id WHERE si.saleId = ?').all(sale.id);
        const calculatedProfit = items.reduce((sum, item) => {
          const unitProfit = (Number(item.price) || 0) - (Number(item.costPrice) || 0);
          return sum + unitProfit * (Number(item.quantity) || 0);
        }, 0);
        return { ...sale, profit: Number(calculatedProfit) || 0, items };
      });
      return sendJson(res, 200, salesWithItems);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

function initDatabase() {
  db.prepare(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    costPrice REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    fullName TEXT NOT NULL DEFAULT ''
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datetime TEXT NOT NULL,
    total REAL NOT NULL,
    profit REAL NOT NULL DEFAULT 0,
    paymentMethod TEXT NOT NULL,
    cashierName TEXT NOT NULL DEFAULT 'Unknown'
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saleId INTEGER NOT NULL,
    productId INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    costPrice REAL NOT NULL DEFAULT 0,
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

  db.prepare(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    productId INTEGER NOT NULL DEFAULT 0,
    productName TEXT NOT NULL,
    movementType TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS receiving_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier TEXT NOT NULL DEFAULT 'Supplier not specified',
    storeAccount TEXT NOT NULL DEFAULT 'Main Store',
    date TEXT NOT NULL,
    itemsJson TEXT NOT NULL,
    totalAmount REAL NOT NULL DEFAULT 0,
    purchaseOrderId INTEGER
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier TEXT NOT NULL DEFAULT 'Supplier not specified',
    storeAccount TEXT NOT NULL DEFAULT 'Main Store',
    date TEXT NOT NULL,
    itemsJson TEXT NOT NULL,
    totalAmount REAL NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS service_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serviceType TEXT NOT NULL,
    beneficiary TEXT NOT NULL,
    phoneNumber TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    reference TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    createdBy TEXT NOT NULL DEFAULT 'Unknown'
  )`).run();

  db.prepare('DELETE FROM refresh_tokens WHERE expiresAt < ?').run(new Date().toISOString());

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some((col) => col.name === 'fullName')) {
    db.prepare('ALTER TABLE users ADD COLUMN fullName TEXT NOT NULL DEFAULT ""').run();
  }

  ensureDefaultUsers(db);
  ensureStarterProducts(db);

  const productColumns = db.prepare('PRAGMA table_info(products)').all();
  if (!productColumns.some((col) => col.name === 'costPrice')) {
    db.prepare('ALTER TABLE products ADD COLUMN costPrice REAL NOT NULL DEFAULT 0').run();
  }

  const salesColumns = db.prepare('PRAGMA table_info(sales)').all();
  if (!salesColumns.some((col) => col.name === 'cashierName')) {
    db.prepare('ALTER TABLE sales ADD COLUMN cashierName TEXT NOT NULL DEFAULT "Unknown"').run();
  }
  if (!salesColumns.some((col) => col.name === 'profit')) {
    db.prepare('ALTER TABLE sales ADD COLUMN profit REAL NOT NULL DEFAULT 0').run();
  }

  const purchaseOrderColumns = db.prepare('PRAGMA table_info(purchase_orders)').all();
  if (!purchaseOrderColumns.some((col) => col.name === 'updatedAt')) {
    db.prepare('ALTER TABLE purchase_orders ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ""').run();
  }

  const receivingHistoryColumns = db.prepare('PRAGMA table_info(receiving_history)').all();
  if (!receivingHistoryColumns.some((col) => col.name === 'purchaseOrderId')) {
    db.prepare('ALTER TABLE receiving_history ADD COLUMN purchaseOrderId INTEGER').run();
  }

  const saleItemColumns = db.prepare('PRAGMA table_info(sale_items)').all();
  if (!saleItemColumns.some((col) => col.name === 'costPrice')) {
    db.prepare('ALTER TABLE sale_items ADD COLUMN costPrice REAL NOT NULL DEFAULT 0').run();
  }
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, storedValue) {
  if (!storedValue) {
    return false;
  }

  if (storedValue.startsWith('$2a$') || storedValue.startsWith('$2b$') || storedValue.startsWith('$2y$')) {
    return bcrypt.compareSync(password, storedValue);
  }

  const [salt, hash] = storedValue.split(':');
  if (!salt || !hash) {
    return false;
  }

  try {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

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

function signToken(payload, secret, expiresIn) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + (expiresIn === '15m' ? 15 * 60 : 7 * 24 * 60 * 60);
  const body = base64Url(JSON.stringify({ ...payload, exp }));
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  if (expectedSignature !== signature) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  if (statusCode === 204) {
    res.writeHead(204, { 'Content-Type': 'application/json' });
    res.end();
    return;
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function requireAuth(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    sendJson(res, 401, { error: 'Authorization token required' });
    return null;
  }
  const user = verifyToken(token);
  if (!user) {
    sendJson(res, 401, { error: 'Invalid or expired token' });
    return null;
  }
  return user;
}

initDatabase();

server.listen(PORT, HOST, () => {
  console.log(`POS backend listening on http://${HOST}:${PORT}`);
});

function tryServeFrontend(req, res, pathname) {
  if (!fs.existsSync(FRONTEND_BUILD_PATH)) {
    return false;
  }

  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const relativePath = normalizedPath.replace(/^\/+/, '');
  const safePath = relativePath || 'index.html';
  const fullPath = path.resolve(FRONTEND_BUILD_PATH, safePath);
  const buildRoot = path.resolve(FRONTEND_BUILD_PATH);

  if (!fullPath.startsWith(buildRoot)) {
    return false;
  }

  const fileExists = fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
  if (fileExists) {
    return sendFile(res, fullPath);
  }

  const indexPath = path.resolve(FRONTEND_BUILD_PATH, 'index.html');
  if (fs.existsSync(indexPath)) {
    return sendFile(res, indexPath);
  }

  return false;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  }[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
