const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('path');
const { pool } = require('./db');
const { ensureDefaultUsers } = require('./auth');
const { ensureStarterProducts } = require('./shopData');
const { validateProductPayload, validateSalePayload, validatePurchaseOrderPayload, validateReceivingPayload, validateServiceTransactionPayload } = require('./validation');

const JWT_SECRET = process.env.JWT_SECRET || 'pos_jwt_secret';
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4000);
const FRONTEND_BUILD_PATH = process.env.FRONTEND_BUILD_PATH || path.resolve(__dirname, '..', '..', 'frontend', 'build');
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
      const { rows } = await pool.query('SELECT * FROM products ORDER BY name');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && pathname === '/api/stock-movements') {
      const { rows } = await pool.query('SELECT * FROM stock_movements ORDER BY "createdAt" DESC LIMIT 50');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && pathname === '/api/receiving-history') {
      const { rows } = await pool.query('SELECT * FROM receiving_history ORDER BY date DESC LIMIT 20');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'GET' && pathname === '/api/service-transactions') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { rows } = await pool.query('SELECT * FROM service_transactions ORDER BY "createdAt" DESC LIMIT 50');
      return sendJson(res, 200, rows);
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
      const result = await pool.query(
        'INSERT INTO service_transactions ("serviceType", beneficiary, "phoneNumber", amount, reference, "createdAt", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [
          String(body.serviceType || '').trim().toLowerCase(),
          String(body.beneficiary || '').trim(),
          String(body.phoneNumber || '').trim(),
          Number(body.amount) || 0,
          String(body.reference || '').trim() || `svc-${Date.now()}`,
          now,
          user.username || 'Unknown',
        ]
      );
      return sendJson(res, 201, { id: result.rows[0].id, ...body, createdAt: now, createdBy: user.username || 'Unknown' });
    }

    if (req.method === 'GET' && pathname === '/api/purchase-orders') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const { rows } = await pool.query('SELECT * FROM purchase_orders ORDER BY "createdAt" DESC');
      return sendJson(res, 200, rows);
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/purchase-orders/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      const body = await readJsonBody(req);
      const { status } = body;
      const nextStatus = status === 'approved' || status === 'completed' ? status : 'pending';
      const result = await pool.query('UPDATE purchase_orders SET status = $1, "updatedAt" = $2 WHERE id = $3', [nextStatus, new Date().toISOString(), id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'Purchase order not found' });
      }
      const updatedOrder = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
      return sendJson(res, 200, updatedOrder.rows[0]);
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
      const result = await pool.query(
        'INSERT INTO purchase_orders (supplier, "storeAccount", date, "itemsJson", "totalAmount", "createdAt", "updatedAt", status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [supplier || 'Supplier not specified', storeAccount || 'Main Store', date || now, JSON.stringify(items), Number(totalAmount) || 0, now, now, 'pending']
      );
      return sendJson(res, 201, { id: result.rows[0].id, supplier, storeAccount, date, totalAmount: Number(totalAmount) || 0, items, createdAt: now, updatedAt: now, itemsJson: JSON.stringify(items), status: 'pending' });
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
      const result = await pool.query(
        'INSERT INTO receiving_history (supplier, "storeAccount", date, "itemsJson", "totalAmount", "purchaseOrderId") VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [supplier || 'Supplier not specified', storeAccount || 'Main Store', date || new Date().toISOString(), JSON.stringify(items), Number(totalAmount) || 0, purchaseOrderId || null]
      );
      for (const item of items) {
        await pool.query(
          'INSERT INTO stock_movements ("productId", "productName", "movementType", quantity, "createdAt", note) VALUES ($1, $2, $3, $4, $5, $6)',
          [0, item.name, 'receiving', Math.abs(Number(item.quantity) || 0), new Date().toISOString(), `Received from ${supplier || 'supplier'}`]
        );
      }
      return sendJson(res, 201, { id: result.rows[0].id, supplier, storeAccount, date, totalAmount: Number(totalAmount) || 0, items });
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
      const result = await pool.query(
        'INSERT INTO products (sku, name, price, "costPrice", stock) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [sku, name, price, Number(costPrice) || 0, stock]
      );
      return sendJson(res, 201, { id: result.rows[0].id, sku, name, price, costPrice: Number(costPrice) || 0, stock });
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const { rows } = await pool.query('SELECT id, username, "fullName", role FROM users ORDER BY username');
      return sendJson(res, 200, rows);
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
      const result = await pool.query('INSERT INTO users (username, password, role, "fullName") VALUES ($1, $2, $3, $4) RETURNING id', [username, hashedPassword, userRole, safeFullName]);
      return sendJson(res, 201, { id: result.rows[0].id, username, fullName: safeFullName, role: userRole });
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
      let idx = 1;
      updates.push(`username = $${idx++}`); values.push(username);
      updates.push(`role = $${idx++}`); values.push(userRole);
      updates.push(`"fullName" = $${idx++}`); values.push(safeFullName);
      if (password) {
        updates.push(`password = $${idx++}`); values.push(hashPassword(password));
      }
      values.push(id);
      const result = await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      return sendJson(res, 200, { id: Number(id), username, fullName: safeFullName, role: userRole });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/users/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      await pool.query('DELETE FROM refresh_tokens WHERE "userId" = $1', [id]);
      const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readJsonBody(req);
      const { username, password } = body;
      const { rows } = await pool.query('SELECT id, username, password, role FROM users WHERE username = $1', [username]);
      const user = rows[0];
      if (!user || !verifyPassword(password, user.password)) {
        return sendJson(res, 401, { error: 'Invalid username or password' });
      }
      const token = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '15m');
      const refreshToken = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '7d');
      await saveRefreshToken(refreshToken, user.id);
      return sendJson(res, 200, { id: user.id, username: user.username, role: user.role, token, refreshToken });
    }

    if (req.method === 'POST' && pathname === '/api/refresh') {
      const body = await readJsonBody(req);
      const { refreshToken } = body;
      if (!refreshToken) {
        return sendJson(res, 400, { error: 'Refresh token required' });
      }
      const storedToken = await findValidRefreshToken(refreshToken);
      if (!storedToken) {
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      const payload = verifyToken(refreshToken, JWT_SECRET);
      if (!payload) {
        await deleteRefreshToken(refreshToken);
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      const { rows } = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [payload.id]);
      const user = rows[0];
      if (!user) {
        await deleteRefreshToken(refreshToken);
        return sendJson(res, 403, { error: 'Invalid refresh token' });
      }
      await deleteRefreshToken(refreshToken);
      const token = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '15m');
      const newRefreshToken = signToken({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, '7d');
      await saveRefreshToken(newRefreshToken, user.id);
      return sendJson(res, 200, { token, refreshToken: newRefreshToken });
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const body = await readJsonBody(req);
      const { refreshToken } = body;
      if (refreshToken) {
        await deleteRefreshToken(refreshToken);
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
      const result = await pool.query('UPDATE products SET sku = $1, name = $2, price = $3, "costPrice" = $4, stock = $5 WHERE id = $6', [sku, name, price, Number(costPrice) || 0, stock, id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'Product not found' });
      }
      return sendJson(res, 200, { id: Number(id), sku, name, price, costPrice: Number(costPrice) || 0, stock });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/products/')) {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required' });
      const id = pathname.split('/').pop();
      await pool.query('DELETE FROM sale_items WHERE "productId" = $1', [id]);
      const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return sendJson(res, 404, { error: 'Product not found' });
      }
      return sendJson(res, 204, null);
    }

    if (req.method === 'POST' && pathname === '/api/sales') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      const { items, paymentMethod, discountType = 'none', discountValue = '0' } = body;
      const productRowsResult = await pool.query('SELECT id, stock FROM products');
      const validation = validateSalePayload({ items, paymentMethod, discountType, discountValue }, productRowsResult.rows);
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const saleResult = await client.query(
          'INSERT INTO sales (datetime, total, profit, "paymentMethod", "cashierName") VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [new Date().toISOString(), total, profit, paymentMethod, user.username || 'Unknown']
        );
        const saleId = saleResult.rows[0].id;
        for (const item of items) {
          await client.query(
            'INSERT INTO sale_items ("saleId", "productId", quantity, price, "costPrice") VALUES ($1, $2, $3, $4, $5)',
            [saleId, item.productId, item.quantity, item.price, Number(item.costPrice) || 0]
          );
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.productId]);
          await client.query(
            'INSERT INTO stock_movements ("productId", "productName", "movementType", quantity, "createdAt", note) VALUES ($1, $2, $3, $4, $5, $6)',
            [item.productId, item.name, 'sale', -Math.abs(Number(item.quantity) || 0), new Date().toISOString(), `Sale #${saleId}`]
          );
        }
        await client.query('COMMIT');
        return sendJson(res, 201, { saleId, subtotal, discountAmount, total, profit, paymentMethod, items });
      } catch (error) {
        await client.query('ROLLBACK');
        return sendJson(res, 400, { error: error.message });
      } finally {
        client.release();
      }
    }

    if (req.method === 'GET' && pathname === '/api/reports/sales') {
      const salesResult = await pool.query('SELECT * FROM sales ORDER BY datetime DESC');
      const salesWithItems = await Promise.all(salesResult.rows.map(async (sale) => {
        const itemsResult = await pool.query(
          'SELECT si.*, p.name, p.sku, CASE WHEN si."costPrice" IS NOT NULL AND si."costPrice" <> 0 THEN si."costPrice" ELSE p."costPrice" END AS "costPrice" FROM sale_items si JOIN products p ON si."productId" = p.id WHERE si."saleId" = $1',
          [sale.id]
        );
        const items = itemsResult.rows;
        const calculatedProfit = items.reduce((sum, item) => {
          const unitProfit = (Number(item.price) || 0) - (Number(item.costPrice) || 0);
          return sum + unitProfit * (Number(item.quantity) || 0);
        }, 0);
        return { ...sale, profit: Number(calculatedProfit) || 0, items };
      }));
      return sendJson(res, 200, salesWithItems);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

async function initDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    "fullName" TEXT NOT NULL DEFAULT ''
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    datetime TEXT NOT NULL,
    total DOUBLE PRECISION NOT NULL,
    profit DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL DEFAULT 'Unknown'
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    "saleId" INTEGER NOT NULL REFERENCES sales(id),
    "productId" INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    "userId" INTEGER NOT NULL REFERENCES users(id),
    "expiresAt" TEXT NOT NULL
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    "productId" INTEGER NOT NULL DEFAULT 0,
    "productName" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS receiving_history (
    id SERIAL PRIMARY KEY,
    supplier TEXT NOT NULL DEFAULT 'Supplier not specified',
    "storeAccount" TEXT NOT NULL DEFAULT 'Main Store',
    date TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseOrderId" INTEGER
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    supplier TEXT NOT NULL DEFAULT 'Supplier not specified',
    "storeAccount" TEXT NOT NULL DEFAULT 'Main Store',
    date TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS service_transactions (
    id SERIAL PRIMARY KEY,
    "serviceType" TEXT NOT NULL,
    beneficiary TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    reference TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'Unknown'
  )`);

  await pool.query('DELETE FROM refresh_tokens WHERE "expiresAt" < $1', [new Date().toISOString()]);

  await ensureDefaultUsers(pool);
  await ensureStarterProducts(pool);
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

async function saveRefreshToken(token, userId) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pool.query('INSERT INTO refresh_tokens (token, "userId", "expiresAt") VALUES ($1, $2, $3)', [token, userId, expiresAt]);
}

async function deleteRefreshToken(token) {
  await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
}

async function findValidRefreshToken(token) {
  const { rows } = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [token]);
  const tokenRow = rows[0];
  if (!tokenRow) {
    return null;
  }
  if (new Date(tokenRow.expiresAt) < new Date()) {
    await deleteRefreshToken(token);
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

initDatabase()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`POS backend listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
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
