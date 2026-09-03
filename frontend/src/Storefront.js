import React, { useEffect, useMemo, useState } from 'react';

const COLORS = {
  primary: '#FF6B00',
  primaryDark: '#E85D04',
  primaryDarker: '#C24A00',
  sale: '#FF3B30',
  bg: '#F5F5F5',
  card: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#767676',
  border: '#ECECEC',
  green: '#0C8A3E',
};

function Storefront({ products, shopName, currencySymbol, onPlaceOrder, customerAuth, onCustomerSignup, onCustomerLogin, onCustomerLogout, myOrders, onRefreshMyOrders }) {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ customerName: '', phone: '', address: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);

  useEffect(() => {
    if (customerAuth) {
      setForm((prev) => ({ ...prev, customerName: customerAuth.name || prev.customerName, phone: customerAuth.phone || prev.phone }));
    }
  }, [customerAuth]);

  const availableProducts = (products || []).filter((product) => Number(product.stock) > 0);
  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableProducts;
    return availableProducts.filter((product) => product.name.toLowerCase().includes(q));
  }, [availableProducts, search]);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0), [cart]);
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0),
    [cart]
  );

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      const maxQty = Number(product.stock) || 0;
      if (existing) {
        if (existing.quantity >= maxQty) return prev;
        return prev.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      if (maxQty <= 0) return prev;
      return [...prev, { productId: product.id, name: product.name, price: Number(product.price) || 0, quantity: 1, stock: maxQty }];
    });
  };

  const updateQuantity = (productId, quantity) => {
    setCart((prev) =>
      prev
        .map((item) => (item.productId === productId ? { ...item, quantity: Math.max(1, Math.min(quantity, item.stock)) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const submitOrder = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.customerName.trim() || !form.phone.trim()) {
      setError('Please enter your name and phone number.');
      return;
    }
    if (!cart.length) {
      setError('Your cart is empty. Add at least one item.');
      return;
    }

    setSubmitting(true);
    try {
      const order = await onPlaceOrder({
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      });
      setSuccessOrder(order);
      setCart([]);
      setCartOpen(false);
      setForm({ customerName: '', phone: '', address: '', notes: '' });
    } catch (err) {
      setError(err.message || 'Could not place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      if (authMode === 'login') {
        if (!authForm.email.trim() || !authForm.password) {
          throw new Error('Please enter your email and password.');
        }
        await onCustomerLogin({ email: authForm.email.trim(), password: authForm.password });
      } else {
        if (!authForm.name.trim() || !authForm.phone.trim() || !authForm.email.trim() || !authForm.password) {
          throw new Error('Please fill in all fields.');
        }
        await onCustomerSignup({
          name: authForm.name.trim(),
          phone: authForm.phone.trim(),
          email: authForm.email.trim(),
          password: authForm.password,
        });
      }
      setAuthForm({ name: '', phone: '', email: '', password: '' });
      setAuthOpen(false);
    } catch (err) {
      setAuthError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const openMyOrders = () => {
    setMyOrdersOpen(true);
    if (onRefreshMyOrders) onRefreshMyOrders();
  };

  const orderStatusColors = {
    pending: { bg: '#FFF8E5', text: '#8A6A00' },
    confirmed: { bg: '#E9F3FF', text: '#0B5FB8' },
    completed: { bg: '#EAF7EE', text: '#1E7A3B' },
    cancelled: { bg: '#FDECEC', text: COLORS.sale },
  };

  if (successOrder) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: COLORS.bg, padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 420, background: COLORS.card, borderRadius: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.12)', padding: 32, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: COLORS.green, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 32, margin: '0 auto 12px' }}>✓</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>Order Placed!</div>
          <div style={{ color: COLORS.muted, fontSize: 14, marginTop: 8 }}>
            Order #{successOrder.id} · {currencySymbol}{Number(successOrder.totalAmount).toLocaleString()}
          </div>
          <div style={{ color: COLORS.text, fontSize: 14, marginTop: 16, lineHeight: 1.6 }}>
            Thank you, {successOrder.customerName}! Please come in or wait for us to reach out to arrange pickup/delivery and payment.
          </div>
          <button
            type="button"
            onClick={() => setSuccessOrder(null)}
            style={{ marginTop: 20, width: '100%', background: `linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.sale} 100%)`, color: '#fff', border: 'none', borderRadius: 999, padding: '14px 20px', fontWeight: 800, fontSize: 14, letterSpacing: '0.03em', cursor: 'pointer' }}
          >
            Place Another Order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'Manrope', 'Segoe UI', sans-serif" }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: `linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)`, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: '#fff', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{shopName || 'NOOR'}</div>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 999, border: 'none', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {customerAuth ? (
            <>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>Hi, {customerAuth.name}</span>
              <button
                type="button"
                onClick={openMyOrders}
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 999, color: '#fff', padding: '10px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                My Orders
              </button>
              <button
                type="button"
                onClick={onCustomerLogout}
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 999, color: '#fff', padding: '10px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setAuthOpen(true); setAuthMode('login'); setAuthError(''); }}
              style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 999, color: '#fff', padding: '10px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Login / Sign Up
            </button>
          )}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            style={{ position: 'relative', background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 999, color: '#fff', padding: '10px 16px', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            🛒 Cart
            {cartCount > 0 && (
              <span style={{ background: '#fff', color: COLORS.sale, borderRadius: '50%', minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, padding: '0 4px' }}>
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div style={{ background: `linear-gradient(120deg, ${COLORS.sale} 0%, ${COLORS.primary} 60%, ${COLORS.primaryDark} 100%)`, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.01em' }}>🔥 Shop Now, Pay on Pickup or Delivery</div>
        <div style={{ fontSize: 13, opacity: 0.92, marginTop: 4, fontWeight: 600 }}>No account needed — order in seconds</div>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 90px' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text, marginBottom: 12 }}>
          {search.trim() ? `Results for "${search.trim()}"` : 'All Products'}
        </div>
        {!visibleProducts.length && (
          <div style={{ color: COLORS.muted, fontSize: 14, background: COLORS.card, borderRadius: 12, padding: 24, textAlign: 'center' }}>
            {availableProducts.length ? 'No products match your search.' : 'No products are available right now. Please check back later.'}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {visibleProducts.map((product) => {
            const inCart = cart.find((item) => item.productId === product.id);
            const maxedOut = inCart ? inCart.quantity >= product.stock : false;
            const lowStock = product.stock > 0 && product.stock <= 5;
            return (
              <div key={product.id} style={{ background: COLORS.card, borderRadius: 12, overflow: 'hidden', display: 'grid', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: `1px solid ${COLORS.border}` }}>
                <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#FAFAFA', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>No Image</span>
                  )}
                  {lowStock && (
                    <span style={{ position: 'absolute', top: 6, left: 6, background: COLORS.sale, color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6 }}>
                      LOW STOCK
                    </span>
                  )}
                </div>
                <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 600, color: COLORS.text, fontSize: 13, lineHeight: 1.3, minHeight: 34, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {product.name}
                  </div>
                  <div style={{ color: COLORS.sale, fontWeight: 900, fontSize: 17 }}>{currencySymbol}{Number(product.price).toLocaleString()}</div>
                  <div style={{ color: lowStock ? COLORS.sale : COLORS.green, fontSize: 11, fontWeight: 700 }}>{product.stock} in stock</div>
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={maxedOut}
                    style={{
                      padding: '9px 10px',
                      borderRadius: 999,
                      border: 'none',
                      background: maxedOut ? '#DDD' : `linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.sale} 100%)`,
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: maxedOut ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {inCart ? `In Cart (${inCart.quantity})` : '+ Add to Cart'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {cartCount > 0 && !cartOpen && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 25, background: `linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.sale} 100%)`, color: '#fff', border: 'none', borderRadius: 999, padding: '14px 20px', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 6px 20px rgba(0,0,0,0.2)', cursor: 'pointer', maxWidth: 1200, margin: '0 auto' }}
        >
          <span>🛒 {cartCount} item{cartCount > 1 ? 's' : ''}</span>
          <span>View Cart · {currencySymbol}{cartTotal.toLocaleString()}</span>
        </button>
      )}

      {cartOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            onClick={() => setCartOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
          />
          <div style={{ position: 'relative', width: '100%', maxWidth: 420, background: COLORS.bg, height: '100%', overflowY: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: COLORS.card, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text }}>Your Cart</div>
              <button type="button" onClick={() => setCartOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: COLORS.muted, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 16, flex: 1 }}>
              {!cart.length && <div style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 30 }}>Your cart is empty.</div>}
              <div style={{ display: 'grid', gap: 10 }}>
                {cart.map((item) => (
                  <div key={item.productId} style={{ background: COLORS.card, borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.sale, fontWeight: 700 }}>{currencySymbol}{item.price.toLocaleString()} each</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={() => updateQuantity(item.productId, item.quantity - 1)} style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: 'pointer', fontWeight: 700 }}>-</button>
                      <span style={{ minWidth: 18, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.productId, item.quantity + 1)} style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: 'pointer', fontWeight: 700 }}>+</button>
                      <button type="button" onClick={() => removeFromCart(item.productId)} style={{ marginLeft: 4, border: 'none', background: 'transparent', color: COLORS.sale, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>

              {!!cart.length && (
                <div style={{ marginTop: 14, background: COLORS.card, borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: COLORS.text, fontSize: 15 }}>
                  <span>Total</span>
                  <span style={{ color: COLORS.sale }}>{currencySymbol}{cartTotal.toLocaleString()}</span>
                </div>
              )}

              <form onSubmit={submitOrder} style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  Full Name
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="Your name"
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  Phone Number
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="Your phone number"
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  Delivery Address (optional)
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="Leave blank for in-store pickup"
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  Notes (optional)
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, minHeight: 50, fontFamily: 'inherit', boxSizing: 'border-box' }}
                    placeholder="Any special instructions"
                  />
                </label>

                {error && <div style={{ color: COLORS.sale, background: '#fff1f0', border: '1px solid #ffd0cc', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}

                <button
                  type="submit"
                  disabled={submitting || !cart.length}
                  style={{
                    marginTop: 4,
                    background: submitting || !cart.length ? '#DDD' : `linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.sale} 100%)`,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 999,
                    padding: '15px 16px',
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: '0.02em',
                    cursor: submitting || !cart.length ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Placing Order…' : 'Place Order (Pay on Pickup/Delivery)'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.04em', color: COLORS.muted, fontWeight: 700 }}>
                  POWERD BY PRO CREATIVES | 08147621844
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {authOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            onClick={() => setAuthOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
          />
          <div style={{ position: 'relative', width: '100%', maxWidth: 420, background: COLORS.bg, height: '100%', overflowY: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: COLORS.card, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text }}>{authMode === 'login' ? 'Log In' : 'Sign Up'}</div>
              <button type="button" onClick={() => setAuthOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: COLORS.muted, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 16, flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: COLORS.card, borderRadius: 999, padding: 4 }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, background: authMode === 'login' ? COLORS.primary : 'transparent', color: authMode === 'login' ? '#fff' : COLORS.text }}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, background: authMode === 'signup' ? COLORS.primary : 'transparent', color: authMode === 'signup' ? '#fff' : COLORS.text }}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={submitAuth} style={{ display: 'grid', gap: 10 }}>
                {authMode === 'signup' && (
                  <>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                      Full Name
                      <input
                        type="text"
                        value={authForm.name}
                        onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box' }}
                        placeholder="Your name"
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                      Phone Number
                      <input
                        type="tel"
                        value={authForm.phone}
                        onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box' }}
                        placeholder="Your phone number"
                      />
                    </label>
                  </>
                )}
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  Email
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="you@example.com"
                  />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  Password
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="At least 6 characters"
                  />
                </label>

                {authError && <div style={{ color: COLORS.sale, background: '#fff1f0', border: '1px solid #ffd0cc', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{authError}</div>}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  style={{
                    marginTop: 4,
                    background: authSubmitting ? '#DDD' : `linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.sale} 100%)`,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 999,
                    padding: '15px 16px',
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: '0.02em',
                    cursor: authSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {authSubmitting ? 'Please wait…' : authMode === 'login' ? 'Log In' : 'Create Account'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {myOrdersOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            onClick={() => setMyOrdersOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
          />
          <div style={{ position: 'relative', width: '100%', maxWidth: 420, background: COLORS.bg, height: '100%', overflowY: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: COLORS.card, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text }}>My Orders</div>
              <button type="button" onClick={() => setMyOrdersOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: COLORS.muted, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 16, flex: 1, display: 'grid', gap: 10, alignContent: 'start' }}>
              {!(myOrders || []).length && (
                <div style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 30 }}>You haven't placed any orders yet.</div>
              )}
              {(myOrders || []).map((order) => {
                const items = typeof order.itemsJson === 'string' ? JSON.parse(order.itemsJson) : (order.itemsJson || []);
                const statusStyle = orderStatusColors[order.status] || { bg: COLORS.border, text: COLORS.text };
                return (
                  <div key={order.id} style={{ background: COLORS.card, borderRadius: 10, padding: 12, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: COLORS.text }}>Order #{order.id}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: statusStyle.text, background: statusStyle.bg, borderRadius: 999, padding: '4px 8px' }}>
                        {order.status}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 2, marginBottom: 6 }}>
                      {items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: COLORS.muted }}>
                          <span>{item.quantity} × {item.name}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 13, color: COLORS.text }}>
                      <span>Total</span>
                      <span style={{ color: COLORS.sale }}>{currencySymbol}{Number(order.totalAmount).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Storefront;

