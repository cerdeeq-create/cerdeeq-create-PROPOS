import React, { useEffect, useRef, useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
const SHOP_NAME = 'Noor Collection';

function App() {
  const skuInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [reportSales, setReportSales] = useState([]);
  const [form, setForm] = useState({ sku: '', name: '', price: '', stock: '' });
  const [editingProductId, setEditingProductId] = useState(null);
  const [skuInput, setSkuInput] = useState('');
  const [tenderAmount, setTenderAmount] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: 'cashier', password: '' });
  const [loginError, setLoginError] = useState('');
  const [userList, setUserList] = useState([]);
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', role: 'cashier' });
  const [productFilter, setProductFilter] = useState('');
  const [productSort, setProductSort] = useState('name');
  const lowStockThreshold = 5;

  useEffect(() => {
    const storedUser = localStorage.getItem('posUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    fetchProducts();
    fetchReports();
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    } else {
      setUserList([]);
    }
  }, [user]);

  const authHeaders = () => {
    return user?.token
      ? { Authorization: `Bearer ${user.token}` }
      : {};
  };

  const saveUser = (userData) => {
    setUser(userData);
    localStorage.setItem('posUser', JSON.stringify(userData));
  };

  const refreshAuthToken = async () => {
    if (!user?.refreshToken) {
      return false;
    }
    const response = await fetch(`${API_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: user.refreshToken }),
    });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    const updatedUser = { ...user, token: data.token, refreshToken: data.refreshToken };
    saveUser(updatedUser);
    return true;
  };

  const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...authHeaders(),
      },
    });
    if (response.status === 401 && user?.refreshToken) {
      const refreshed = await refreshAuthToken();
      if (!refreshed) {
        logout();
        return response;
      }
      const secondResponse = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...authHeaders(),
        },
      });
      return secondResponse;
    }
    return response;
  };

  const fetchProducts = async () => {
    const response = await fetch(`${API_URL}/products`);
    setProducts(await response.json());
  };

  const fetchReports = async () => {
    const response = await fetch(`${API_URL}/reports/sales`);
    setReportSales(await response.json());
  };

  const fetchUsers = async () => {
    if (user?.role !== 'admin') {
      setUserList([]);
      return;
    }
    const response = await apiFetch(`${API_URL}/users`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      setUserList(await response.json());
    } else {
      setUserList([]);
    }
  };

  const addToCart = (product) => {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item
        );
      }
      return [...current, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const scanBySku = () => {
    const sku = skuInput.trim();
    if (!sku) return;
    const product = products.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
    if (!product) {
      window.alert(`No product found with SKU "${sku}".`);
      return;
    }
    addToCart(product);
    setSkuInput('');
  };

  const updateQuantity = (productId, quantity) => {
    setCart((current) =>
      current
        .map((item) => (item.productId === productId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const startEditProduct = (product) => {
    setEditingProductId(product.id);
    setForm({
      sku: product.sku,
      name: product.name,
      price: product.price.toString(),
      stock: product.stock.toString(),
    });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setForm({ sku: '', name: '', price: '', stock: '' });
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    if (!user || user.role !== 'admin') {
      window.alert('Only admin can manage products.');
      return;
    }

    const payload = {
      sku: form.sku,
      name: form.name,
      price: parseFloat(form.price),
      stock: parseInt(form.stock, 10),
    };

    const url = editingProductId ? `${API_URL}/products/${editingProductId}` : `${API_URL}/products`;
    const method = editingProductId ? 'PUT' : 'POST';

    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      window.alert(editingProductId ? 'Failed to update product.' : 'Failed to add product.');
      return;
    }

    setEditingProductId(null);
    setForm({ sku: '', name: '', price: '', stock: '' });
    fetchProducts();
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('Delete this product?')) {
      return;
    }
    const response = await apiFetch(`${API_URL}/products/${productId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      window.alert('Failed to delete product.');
      return;
    }
    fetchProducts();
  };

  const createUser = async (event) => {
    event.preventDefault();
    const response = await apiFetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUserForm),
    });
    if (!response.ok) {
      window.alert('Only admin can create cashier accounts.');
      return;
    }
    setNewUserForm({ username: '', password: '', role: 'cashier' });
    fetchUsers();
  };

  const login = async (event) => {
    event.preventDefault();
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm),
    });
    if (!response.ok) {
      setLoginError('Invalid username or password');
      return;
    }
    const userData = await response.json();
    saveUser(userData);
    setLoginError('');
    fetchUsers();
  };

  const logout = async () => {
    if (user?.refreshToken) {
      await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: user.refreshToken }),
      });
    }
    setUser(null);
    localStorage.removeItem('posUser');
    setReceipt(null);
    setCart([]);
    setTenderAmount('');
  };

  const placeSale = async () => {
    if (!cart.length) return;
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tenderValue = parseFloat(tenderAmount) || 0;
    if (paymentMethod === 'Cash' && tenderValue < total) {
      window.alert('Enter a cash amount equal to or greater than the total.');
      return;
    }
    const response = await fetch(`${API_URL}/sales`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: cart, paymentMethod, cashierName: user?.username || 'Unknown' }),
    });
    if (!response.ok) {
      window.alert('Failed to complete sale. Please try again.');
      return;
    }
    const sale = await response.json();
    setReceipt({
      saleId: sale.saleId,
      datetime: new Date().toISOString(),
      items: cart,
      total,
      paymentMethod,
      tender: tenderValue,
      change: Math.max(0, tenderValue - total),
    });
    setCart([]);
    setTenderAmount('');
    fetchProducts();
    fetchReports();
    window.alert('Sale completed!');
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const displayedProducts = products
    .filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(productFilter.toLowerCase()))
    .sort((a, b) => {
      if (productSort === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (productSort === 'price') {
        return a.price - b.price;
      }
      if (productSort === 'stock') {
        return a.stock - b.stock;
      }
      return 0;
    });

  const lowStockProducts = products.filter((product) => product.stock <= lowStockThreshold);
  const salesSummary = reportSales.reduce(
    (summary, sale) => {
      const orderItems = sale.items.reduce((count, item) => count + item.quantity, 0);
      summary.totalRevenue += sale.total;
      summary.totalItems += orderItems;
      summary.salesCount += 1;
      summary.paymentMethods[sale.paymentMethod] = (summary.paymentMethods[sale.paymentMethod] || 0) + 1;
      sale.items.forEach((item) => {
        summary.productTotals[item.name] = (summary.productTotals[item.name] || 0) + item.quantity;
      });
      return summary;
    },
    { totalRevenue: 0, totalItems: 0, salesCount: 0, paymentMethods: {}, productTotals: {} }
  );

  const topProducts = Object.entries(salesSummary.productTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const paymentMethodEntries = Object.entries(salesSummary.paymentMethods);

  if (!user) {
    return (
      <div style={{ padding: 20, maxWidth: 500, margin: '0 auto', background: '#fff', borderRadius: 8, boxShadow: '0 0 20px rgba(0,0,0,0.05)' }}>
        <h1>{SHOP_NAME}</h1>
        <h2>Cashier Login</h2>
        <form onSubmit={login} style={{ display: 'grid', gap: 12 }}>
          <label>
            Username
            <input
              type="text"
              value={loginForm.username}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
          {loginError && <div style={{ color: 'red' }}>{loginError}</div>}
          <button type="submit">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>{SHOP_NAME}</h1>
          <div style={{ color: '#555' }}>Cashier: {user.username}</div>
        </div>
        <button onClick={logout}>Logout</button>
      </div>
      {user.role === 'admin' && (
        <section style={{ marginBottom: 20, background: '#fff', padding: 20, borderRadius: 8 }}>
          <h2>Cashier Management</h2>
          <form onSubmit={createUser} style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
          <label>
            New cashier username
            <input
              type="text"
              value={newUserForm.username}
              onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={newUserForm.password}
              onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
              required
            />
          </label>
          <label>
            Role
            <select
              value={newUserForm.role}
              onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
            >
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit">Create User</button>
        </form>
        <div style={{ marginTop: 20 }}>
          <h3>Cashier accounts</h3>
          <ul>
            {userList.map((u) => (
              <li key={u.id}>{u.username}</li>
            ))}
          </ul>
        </div>
      </section>
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr' }}>
        <section style={{ background: '#fff', padding: 20, borderRadius: 8 }}>
          <h2>Inventory Alerts</h2>
          {lowStockProducts.length === 0 ? (
            <div style={{ color: '#4b7d4b' }}>All products have healthy stock levels.</div>
          ) : (
            <div>
              <p style={{ margin: '0 0 12px 0' }}>
                {lowStockProducts.length} product{lowStockProducts.length === 1 ? '' : 's'} are low on stock (≤ {lowStockThreshold}).
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {lowStockProducts.map((product) => (
                  <li key={product.id}>
                    <strong>{product.name}</strong> ({product.sku}) — {product.stock} left
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section style={{ background: '#fff', padding: 20, borderRadius: 8 }}>
          <h2>Sales Dashboard</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ background: '#f6f9ff', borderRadius: 8, padding: 16 }}>
              <div style={{ color: '#777', marginBottom: 6 }}>Revenue</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>${salesSummary.totalRevenue.toFixed(2)}</div>
            </div>
            <div style={{ background: '#f6f9ff', borderRadius: 8, padding: 16 }}>
              <div style={{ color: '#777', marginBottom: 6 }}>Sales</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{salesSummary.salesCount}</div>
            </div>
            <div style={{ background: '#f6f9ff', borderRadius: 8, padding: 16 }}>
              <div style={{ color: '#777', marginBottom: 6 }}>Items Sold</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{salesSummary.totalItems}</div>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Top Products</h3>
            {topProducts.length === 0 ? (
              <div style={{ color: '#666' }}>No sales data yet.</div>
            ) : (
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {topProducts.map(([name, qty]) => (
                  <li key={name}>{name} — {qty} sold</li>
                ))}
              </ol>
            )}
          </div>
          <div style={{ marginTop: 20 }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Payment Methods</h3>
            {paymentMethodEntries.length === 0 ? (
              <div style={{ color: '#666' }}>No payment data yet.</div>
            ) : (
              paymentMethodEntries.map(([method, count]) => (
                <div key={method} style={{ marginBottom: 8 }}>
                  <div style={{ marginBottom: 4, color: '#555' }}>{method} — {count} sale{count === 1 ? '' : 's'}</div>
                  <div style={{ height: 10, background: '#eee', borderRadius: 999 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, (count / Math.max(1, salesSummary.salesCount)) * 100)}%`,
                        background: '#5c7cfa',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr' }}>
        <section style={{ background: '#fff', padding: 20, borderRadius: 8 }}>
          <h2>Products</h2>
          <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Search products:
              <input
                type="text"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                placeholder="Search by SKU or name"
                style={{ padding: 8, minWidth: 220 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Sort by:
              <select value={productSort} onChange={(e) => setProductSort(e.target.value)} style={{ padding: 8 }}>
                <option value="name">Name</option>
                <option value="price">Price</option>
                <option value="stock">Stock</option>
              </select>
            </label>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedProducts.map((product) => (
                  <tr
                    key={product.id}
                    style={{
                      background: product.stock <= 5 ? '#fff7e5' : undefined,
                    }}
                  >
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td>${product.price.toFixed(2)}</td>
                  <td>{product.stock}</td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => addToCart(product)} disabled={product.stock === 0}>
                      Add
                    </button>
                    {user.role === 'admin' && (
                      <>
                        <button onClick={() => startEditProduct(product)}>Edit</button>
                        <button onClick={() => deleteProduct(product.id)} style={{ background: '#f7dede', color: '#660000' }}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {user.role === 'admin' ? (
            <form onSubmit={saveProduct} style={{ marginTop: 20, display: 'grid', gap: 8 }}>
              <h3>{editingProductId ? 'Edit Product' : 'Add Product'}</h3>
              <input required placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input required type="number" step="0.01" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <input required type="number" placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="submit">{editingProductId ? 'Update Product' : 'Save Product'}</button>
                {editingProductId && (
                  <button type="button" onClick={cancelEditProduct} style={{ background: '#eee' }}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div style={{ marginTop: 20, color: '#666' }}>Only admin users can add products.</div>
          )}
        </section>

        <section style={{ background: '#fff', padding: 20, borderRadius: 8 }}>
          <h2>Checkout</h2>
          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            <label>
              Scan / Enter SKU:
              <input
                ref={skuInputRef}
                type="text"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && scanBySku()}
                style={{ marginLeft: 8, width: 220 }}
                placeholder="Scan barcode or type SKU"
              />
            </label>
            <button type="button" onClick={scanBySku} style={{ width: 100 }}>
              Scan
            </button>
          </div>
          {cart.length === 0 ? (
            <p>No items in cart.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.name}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                        style={{ width: 60 }}
                      />
                    </td>
                    <td>${(item.price * item.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 16 }}>
            <label>
              Payment method:
              <select style={{ marginLeft: 8 }} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option>Cash</option>
                <option>Card</option>
                <option>Mobile</option>
              </select>
            </label>
          </div>
          <div style={{ marginTop: 16, display: 'grid', gap: 12, maxWidth: 320 }}>
            <label>
              Tender amount:
              <input
                type="number"
                min="0"
                step="0.01"
                value={tenderAmount}
                onChange={(e) => setTenderAmount(e.target.value)}
                style={{ marginLeft: 8, width: 180 }}
                placeholder="0.00"
              />
            </label>
            {paymentMethod === 'Cash' && (
              <div style={{ fontSize: 14, color: '#555' }}>
                Change: ${((parseFloat(tenderAmount) || 0) - total).toFixed(2)}
              </div>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <strong>Total:</strong> ${total.toFixed(2)}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={placeSale} disabled={cart.length === 0}>
              Complete Sale
            </button>
            <button type="button" onClick={() => skuInputRef.current?.focus()}>
              Focus Scanner
            </button>
            {receipt && (
              <button onClick={() => window.print()} type="button">
                Print Receipt
              </button>
            )}
          </div>
        </section>
      </div>

      {receipt && (
        <section className="receipt-print" style={{ marginTop: 24, background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 0 12px rgba(0,0,0,0.05)' }}>
          <div style={{ marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
            <h2 style={{ margin: 0 }}>{SHOP_NAME} Receipt</h2>
            <div style={{ color: '#555', marginTop: 4 }}>Thank you for shopping with us!</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, color: '#444' }}>
            <div>Sale ID: {receipt.saleId}</div>
            <div>Date: {new Date(receipt.datetime).toLocaleString()}</div>
            <div>Cashier: {user.username}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '8px 0' }}>Item</th>
                <th style={{ textAlign: 'center', padding: '8px 0' }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '8px 0' }}>Price</th>
                <th style={{ textAlign: 'right', padding: '8px 0' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={item.productId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0' }}>{item.name}</td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
            <div>Total</div>
            <div>${receipt.total.toFixed(2)}</div>
          </div>
          {receipt.tender >= 0 && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
              <div>Tender</div>
              <div>${receipt.tender.toFixed(2)}</div>
            </div>
          )}
          {receipt.change >= 0 && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
              <div>Change</div>
              <div>${receipt.change.toFixed(2)}</div>
            </div>
          )}
          <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 12, color: '#666' }}>
            My Shop · thank you for coming!
          </div>
        </section>
      )}

      <section style={{ marginTop: 24, background: '#fff', padding: 20, borderRadius: 8 }}>
        <h2>Sales Reports</h2>
        {reportSales.length === 0 ? (
          <p>No sales yet.</p>
        ) : (
          reportSales.map((sale) => (
            <div key={sale.id} style={{ marginBottom: 12, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
              <div>
                <strong>{new Date(sale.datetime).toLocaleString()}</strong> — ${sale.total.toFixed(2)} ({sale.paymentMethod})
              </div>
              <ul>
                {sale.items.map((item) => (
                  <li key={item.id}>{item.quantity} x {item.name}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

export default App;
