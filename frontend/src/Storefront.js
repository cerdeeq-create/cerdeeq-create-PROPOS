import React, { useEffect, useMemo, useState } from 'react';

const COLORS = {
  primary: '#9C7A32',
  primaryDark: '#7C5F26',
  primaryDarker: '#5E481D',
  sale: '#7A2E2E',
  bg: '#FAF6EE',
  card: '#FFFFFF',
  text: '#241F1A',
  muted: '#867C6D',
  border: '#E4DAC5',
  green: '#3F6B4A',
  ink: '#1E1A16',
};

function Storefront({ products, shopName, currencySymbol, bankName, bankAccountName, bankAccountNumber, onPlaceOrder, customerAuth, onCustomerSignup, onCustomerLogin, onCustomerLogout, myOrders, onRefreshMyOrders }) {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ customerName: '', phone: '', address: '', notes: '' });
  const [paymentMethod, setPaymentMethod] = useState('delivery');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const productGridRef = React.useRef(null);

  const goToCategory = (cat) => {
    setActiveCategory(cat);
    setSearch('');
    productGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (customerAuth) {
      setForm((prev) => ({ ...prev, customerName: customerAuth.name || prev.customerName, phone: customerAuth.phone || prev.phone }));
    }
  }, [customerAuth]);

  const availableProducts = (products || []).filter((product) => Number(product.stock) > 0);
  const categories = useMemo(() => {
    const unique = [...new Set(availableProducts.map((product) => (product.category || '').trim()).filter(Boolean))];
    return ['All', ...unique.sort((a, b) => a.localeCompare(b))];
  }, [availableProducts]);
  const categoryTiles = useMemo(() => {
    return categories
      .filter((cat) => cat !== 'All')
      .map((cat) => {
        const items = availableProducts.filter((product) => (product.category || '').trim() === cat);
        return { name: cat, count: items.length, imageUrl: items.find((item) => item.imageUrl)?.imageUrl || '' };
      });
  }, [categories, availableProducts]);
  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availableProducts.filter((product) => {
      const matchesCategory = activeCategory === 'All' || (product.category || '').trim() === activeCategory;
      const matchesSearch = !q || product.name.toLowerCase().includes(q) || (product.category || '').toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [availableProducts, search, activeCategory]);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0), [cart]);
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0),
    [cart]
  );
  const hasBankDetails = Boolean((bankAccountNumber || '').trim());

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
        paymentMethod: paymentMethod === 'transfer' ? 'Bank Transfer' : 'Pay on Pickup/Delivery',
      });
      setSuccessOrder(order);
      setCart([]);
      setCartOpen(false);
      setForm({ customerName: '', phone: '', address: '', notes: '' });
      setPaymentMethod('delivery');
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
    confirmed: { bg: '#E9F3FF', text: '#1E5A8A' },
    completed: { bg: '#EAF7EE', text: COLORS.green },
    cancelled: { bg: '#FDECEC', text: COLORS.sale },
  };

  if (successOrder) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: COLORS.bg, padding: 20, fontFamily: "'Lora', Georgia, serif" }}>
        <div style={{ width: '100%', maxWidth: 420, background: COLORS.card, borderRadius: 6, border: `1px solid ${COLORS.border}`, boxShadow: '0 20px 50px rgba(0,0,0,0.08)', padding: 36, textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', border: `2px solid ${COLORS.green}`, color: COLORS.green, display: 'grid', placeItems: 'center', fontSize: 26, margin: '0 auto 16px' }}>✓</div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 24, color: COLORS.ink }}>Order Placed</div>
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, letterSpacing: '0.03em' }}>
            Order #{successOrder.id} · {currencySymbol}{Number(successOrder.totalAmount).toLocaleString()}
          </div>
          <div style={{ color: COLORS.text, fontSize: 14, marginTop: 18, lineHeight: 1.7 }}>
            {successOrder.paymentMethod === 'Bank Transfer'
              ? `Thank you, ${successOrder.customerName}. Your order is pending — please send payment to the account below and keep your receipt. We'll confirm as soon as we receive it.`
              : `Thank you, ${successOrder.customerName}. Please come in or wait for us to reach out to arrange pickup/delivery and payment.`}
          </div>
          {successOrder.paymentMethod === 'Bank Transfer' && (
            <div style={{ marginTop: 18, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 16, textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Send Money To</div>
              <div style={{ display: 'grid', gap: 4, fontSize: 14, color: COLORS.text }}>
                <div><strong>Bank:</strong> {bankName || 'Not set'}</div>
                <div><strong>Account Name:</strong> {bankAccountName || 'Not set'}</div>
                <div><strong>Account Number:</strong> {bankAccountNumber || 'Not set'}</div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSuccessOrder(null)}
            style={{ marginTop: 24, width: '100%', background: COLORS.ink, color: '#fff', border: 'none', borderRadius: 4, padding: '14px 20px', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Place Another Order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'Lora', Georgia, 'Times New Roman', serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap');
        @keyframes storefrontAuthPop {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .storefront-search-input {
          border: 1px solid ${COLORS.border};
        }
        .storefront-search-input:focus {
          border-color: ${COLORS.primary};
          box-shadow: 0 0 0 3px rgba(156,122,50,0.18);
        }
        input, textarea, select {
          font-family: 'Lora', Georgia, serif;
        }
        input[type="text"], input[type="tel"], input[type="email"], input[type="password"], input[type="search"], textarea {
          border-radius: 3px !important;
        }
      `}</style>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: COLORS.ink, borderBottom: `2px solid ${COLORS.primary}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 23, color: '#fff', letterSpacing: '0.04em', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{shopName || 'NOOR'}</div>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 14, fontSize: 14, opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products or categories..."
              className="storefront-search-input"
              list="storefront-category-suggestions"
              style={{ width: '100%', padding: '11px 36px 11px 38px', borderRadius: 4, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff', color: COLORS.text, fontFamily: "'Lora', Georgia, serif", transition: 'box-shadow 0.15s ease, border-color 0.15s ease' }}
            />
            <datalist id="storefront-category-suggestions">
              {categories.filter((cat) => cat !== 'All').map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
            {!!search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                style={{ position: 'absolute', right: 8, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#EDEDED', color: '#767676', fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                ×
              </button>
            )}
          </div>
          {customerAuth ? (
            <>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, fontStyle: 'italic', whiteSpace: 'nowrap' }}>Hi, {customerAuth.name}</span>
              <button
                type="button"
                onClick={openMyOrders}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, color: '#fff', padding: '9px 14px', fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                My Orders
              </button>
              <button
                type="button"
                onClick={onCustomerLogout}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, color: '#fff', padding: '9px 14px', fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setAuthOpen(true); setAuthMode('login'); setAuthError(''); }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, color: '#fff', padding: '9px 14px', fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Login / Sign Up
            </button>
          )}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            style={{ position: 'relative', background: COLORS.primary, border: 'none', borderRadius: 4, color: '#fff', padding: '10px 18px', fontWeight: 600, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
          >
            Cart
            {cartCount > 0 && (
              <span style={{ background: '#fff', color: COLORS.ink, borderRadius: '50%', minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, padding: '0 4px' }}>
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`, color: COLORS.ink, padding: '26px 16px', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 22, letterSpacing: '0.01em', fontStyle: 'italic' }}>Shop Now · Pay on Pickup or Delivery</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>No account needed — order in seconds</div>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 90px' }}>
        {activeCategory === 'All' && !search.trim() && categoryTiles.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 19, color: COLORS.ink, marginBottom: 14, letterSpacing: '0.01em' }}>Shop by Category</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {categoryTiles.map((tile) => (
                <button
                  key={tile.name}
                  type="button"
                  onClick={() => goToCategory(tile.name)}
                  style={{ display: 'grid', gap: 6, border: `1px solid ${COLORS.border}`, background: COLORS.card, borderRadius: 4, padding: 10, cursor: 'pointer', textAlign: 'center' }}
                >
                  <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 2, background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `1px solid ${COLORS.border}` }}>
                    {tile.imageUrl ? (
                      <img src={tile.imageUrl} alt={tile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, color: COLORS.primary }}>{tile.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tile.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, letterSpacing: '0.04em' }}>{tile.count} item{tile.count === 1 ? '' : 's'}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {categories.length > 1 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 14, WebkitOverflowScrolling: 'touch' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => goToCategory(cat)}
                style={{
                  flexShrink: 0,
                  padding: '8px 16px',
                  borderRadius: 2,
                  border: activeCategory === cat ? `1px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                  borderBottom: activeCategory === cat ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                  background: activeCategory === cat ? COLORS.ink : COLORS.card,
                  color: activeCategory === cat ? '#fff' : COLORS.text,
                  fontWeight: 600,
                  fontSize: 12,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
        <div ref={productGridRef} style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 19, color: COLORS.ink, marginBottom: 14, scrollMarginTop: 70 }}>
          {search.trim() ? `Results for "${search.trim()}"` : activeCategory === 'All' ? 'All Products' : activeCategory}
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
              <div key={product.id} style={{ background: COLORS.card, borderRadius: 4, overflow: 'hidden', display: 'grid', border: `1px solid ${COLORS.border}` }}>
                <div style={{ width: '100%', aspectRatio: '1 / 1', background: COLORS.bg, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span style={{ color: COLORS.muted, fontSize: 12, fontStyle: 'italic' }}>No Image</span>
                  )}
                  {lowStock && (
                    <span style={{ position: 'absolute', top: 6, left: 6, background: COLORS.ink, color: '#fff', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 2, textTransform: 'uppercase' }}>
                      Low Stock
                    </span>
                  )}
                </div>
                <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 500, color: COLORS.text, fontSize: 13, lineHeight: 1.3, minHeight: 34, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {product.name}
                  </div>
                  <div style={{ color: COLORS.sale, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 17 }}>{currencySymbol}{Number(product.price).toLocaleString()}</div>
                  <div style={{ color: lowStock ? COLORS.sale : COLORS.green, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>{product.stock} in stock</div>
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={maxedOut}
                    style={{
                      padding: '9px 10px',
                      borderRadius: 2,
                      border: `1px solid ${maxedOut ? '#DDD' : COLORS.ink}`,
                      background: maxedOut ? '#DDD' : COLORS.ink,
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      cursor: maxedOut ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {inCart ? `In Cart (${inCart.quantity})` : 'Add to Cart'}
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
          style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 25, background: COLORS.ink, color: '#fff', border: 'none', borderRadius: 4, padding: '14px 20px', fontWeight: 600, fontSize: 13, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 6px 20px rgba(0,0,0,0.25)', cursor: 'pointer', maxWidth: 1200, margin: '0 auto' }}
        >
          <span>{cartCount} item{cartCount > 1 ? 's' : ''} in cart</span>
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
            <div style={{ background: COLORS.card, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0 }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 18, color: COLORS.ink }}>Your Cart</div>
              <button type="button" onClick={() => setCartOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: COLORS.muted, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 18, flex: 1 }}>
              {!cart.length && <div style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 30, fontStyle: 'italic' }}>Your cart is empty.</div>}
              <div style={{ display: 'grid', gap: 10 }}>
                {cart.map((item) => (
                  <div key={item.productId} style={{ background: COLORS.card, borderRadius: 4, border: `1px solid ${COLORS.border}`, padding: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.sale, fontWeight: 600 }}>{currencySymbol}{item.price.toLocaleString()} each</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={() => updateQuantity(item.productId, item.quantity - 1)} style={{ width: 26, height: 26, borderRadius: 2, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: 'pointer', fontWeight: 700 }}>-</button>
                      <span style={{ minWidth: 18, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.productId, item.quantity + 1)} style={{ width: 26, height: 26, borderRadius: 2, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: 'pointer', fontWeight: 700 }}>+</button>
                      <button type="button" onClick={() => removeFromCart(item.productId)} style={{ marginLeft: 4, border: 'none', background: 'transparent', color: COLORS.sale, cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>

              {!!cart.length && (
                <div style={{ marginTop: 14, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: 14, display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: COLORS.ink, fontSize: 15 }}>
                  <span style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Total</span>
                  <span style={{ color: COLORS.sale, fontFamily: "'Playfair Display', Georgia, serif" }}>{currencySymbol}{cartTotal.toLocaleString()}</span>
                </div>
              )}

              {!!cart.length && (
                <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.ink, textTransform: 'uppercase', letterSpacing: '0.06em' }}>How will you pay?</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('delivery')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 2,
                        border: paymentMethod === 'delivery' ? `1.5px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                        background: paymentMethod === 'delivery' ? COLORS.bg : COLORS.card,
                        color: COLORS.text,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Pay on Pickup/Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transfer')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 2,
                        border: paymentMethod === 'transfer' ? `1.5px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                        background: paymentMethod === 'transfer' ? COLORS.bg : COLORS.card,
                        color: COLORS.text,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Bank Transfer
                    </button>
                  </div>
                  {paymentMethod === 'transfer' && (
                    <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 2, padding: 12 }}>
                      {hasBankDetails ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Send Money To</div>
                          <div style={{ display: 'grid', gap: 3, fontSize: 13, color: COLORS.text }}>
                            <div><strong>Bank:</strong> {bankName || 'Not set'}</div>
                            <div><strong>Account Name:</strong> {bankAccountName || 'Not set'}</div>
                            <div><strong>Account Number:</strong> {bankAccountNumber || 'Not set'}</div>
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6, fontStyle: 'italic' }}>Your order stays pending until we confirm your payment.</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: COLORS.muted }}>Bank details are not set up yet. Please choose "Pay on Pickup/Delivery" or contact us directly.</div>
                      )}
                    </div>
                  )}
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
                  disabled={submitting || !cart.length || (paymentMethod === 'transfer' && !hasBankDetails)}
                  style={{
                    marginTop: 4,
                    background: submitting || !cart.length || (paymentMethod === 'transfer' && !hasBankDetails) ? '#DDD' : COLORS.ink,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    padding: '15px 16px',
                    fontWeight: 600,
                    fontSize: 13,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: submitting || !cart.length || (paymentMethod === 'transfer' && !hasBankDetails) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Placing Order…' : paymentMethod === 'transfer' ? 'Place Order (Bank Transfer)' : 'Place Order (Pay on Pickup/Delivery)'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.04em', color: COLORS.muted, fontWeight: 500, fontStyle: 'italic' }}>
                  Powered by Pro Creatives | 08147621844
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {authOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div
            onClick={() => setAuthOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(17,17,17,0.55)', backdropFilter: 'blur(2px)' }}
          />
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 400,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: COLORS.card,
              borderRadius: 20,
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              animation: 'storefrontAuthPop 0.18s ease-out',
            }}
          >
            <button
              type="button"
              onClick={() => setAuthOpen(false)}
              aria-label="Close"
              style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#F2F2F2', color: COLORS.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </button>

            <div style={{ padding: '36px 32px 28px', textAlign: 'center', borderBottom: `1px solid ${COLORS.border}` }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  margin: '0 auto 14px',
                  borderRadius: '50%',
                  background: COLORS.ink,
                  border: `2px solid ${COLORS.primary}`,
                  color: '#fff',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontWeight: 700,
                  fontSize: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {(shopName || 'N').trim().charAt(0).toUpperCase()}
              </div>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 21, color: COLORS.ink, letterSpacing: '0.01em' }}>
                {authMode === 'login' ? 'Welcome back' : 'Create your account'}
              </div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
                {authMode === 'login' ? `Log in to track your orders at ${shopName || 'our store'}.` : 'Sign up to save your details and track your orders.'}
              </div>
            </div>

            <div style={{ padding: '24px 32px 32px' }}>
              <div style={{ display: 'flex', gap: 0, marginBottom: 22, borderBottom: `1px solid ${COLORS.border}` }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  style={{ flex: 1, padding: '10px 12px', border: 'none', borderBottom: authMode === 'login' ? `2px solid ${COLORS.primary}` : '2px solid transparent', cursor: 'pointer', fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'color 0.15s', background: 'transparent', color: authMode === 'login' ? COLORS.ink : COLORS.muted }}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                  style={{ flex: 1, padding: '10px 12px', border: 'none', borderBottom: authMode === 'signup' ? `2px solid ${COLORS.primary}` : '2px solid transparent', cursor: 'pointer', fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'color 0.15s', background: 'transparent', color: authMode === 'signup' ? COLORS.ink : COLORS.muted }}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={submitAuth} style={{ display: 'grid', gap: 14 }}>
                {authMode === 'signup' && (
                  <>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                      Full Name
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.55 }}>👤</span>
                        <input
                          type="text"
                          value={authForm.name}
                          onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                          style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s' }}
                          onFocus={(e) => { e.target.style.borderColor = COLORS.primary; }}
                          onBlur={(e) => { e.target.style.borderColor = COLORS.border; }}
                          placeholder="Your name"
                        />
                      </div>
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                      Phone Number
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.55 }}>📱</span>
                        <input
                          type="tel"
                          value={authForm.phone}
                          onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                          style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s' }}
                          onFocus={(e) => { e.target.style.borderColor = COLORS.primary; }}
                          onBlur={(e) => { e.target.style.borderColor = COLORS.border; }}
                          placeholder="Your phone number"
                        />
                      </div>
                    </label>
                  </>
                )}
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  Email
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.55 }}>✉️</span>
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s' }}
                      onFocus={(e) => { e.target.style.borderColor = COLORS.primary; }}
                      onBlur={(e) => { e.target.style.borderColor = COLORS.border; }}
                      placeholder="you@example.com"
                    />
                  </div>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.text, fontWeight: 700 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Password</span>
                    {authMode === 'login' && (
                      <span style={{ color: COLORS.primary, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Forgot password?</span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.55 }}>🔒</span>
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                      style={{ width: '100%', padding: '12px 40px 12px 38px', borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s' }}
                      onFocus={(e) => { e.target.style.borderColor = COLORS.primary; }}
                      onBlur={(e) => { e.target.style.borderColor = COLORS.border; }}
                      placeholder="At least 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword((v) => !v)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: COLORS.muted, fontWeight: 700 }}
                    >
                      {showAuthPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                {authError && <div style={{ color: COLORS.sale, background: '#fff1f0', border: '1px solid #ffd0cc', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{authError}</div>}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  style={{
                    marginTop: 4,
                    background: authSubmitting ? '#DDD' : COLORS.ink,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    padding: '14px 16px',
                    fontWeight: 600,
                    fontSize: 13,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: authSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {authSubmitting ? 'Please wait…' : authMode === 'login' ? 'Log In' : 'Create Account'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
                  <div style={{ flex: 1, height: 1, background: COLORS.border }} />
                  <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: COLORS.border }} />
                </div>

                <div style={{ textAlign: 'center', fontSize: 13, color: COLORS.muted }}>
                  {authMode === 'login' ? (
                    <>Don't have an account?{' '}
                      <span style={{ color: COLORS.primary, fontWeight: 800, cursor: 'pointer' }} onClick={() => { setAuthMode('signup'); setAuthError(''); }}>Sign Up</span>
                    </>
                  ) : (
                    <>Already have an account?{' '}
                      <span style={{ color: COLORS.primary, fontWeight: 800, cursor: 'pointer' }} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Log In</span>
                    </>
                  )}
                </div>
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
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 18, color: COLORS.ink }}>My Orders</div>
              <button type="button" onClick={() => setMyOrdersOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: COLORS.muted, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 18, flex: 1, display: 'grid', gap: 12, alignContent: 'start' }}>
              {!(myOrders || []).length && (
                <div style={{ textAlign: 'center', marginTop: 50 }}>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, color: COLORS.border, marginBottom: 10 }}>&mdash;</div>
                  <div style={{ color: COLORS.muted, fontSize: 13, fontStyle: 'italic' }}>You haven't placed any orders yet.</div>
                </div>
              )}
              {(myOrders || []).map((order) => {
                const items = typeof order.itemsJson === 'string' ? JSON.parse(order.itemsJson) : (order.itemsJson || []);
                const statusStyle = orderStatusColors[order.status] || { bg: COLORS.border, text: COLORS.text };
                const orderDate = order.createdAt || order.date ? new Date(order.createdAt || order.date) : null;
                return (
                  <div key={order.id} style={{ background: COLORS.card, borderRadius: 4, padding: 14, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 15, color: COLORS.ink }}>Order #{order.id}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusStyle.text, border: `1px solid ${statusStyle.text}`, borderRadius: 2, padding: '3px 8px' }}>
                        {order.status}
                      </span>
                    </div>
                    {orderDate && (
                      <div style={{ fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 2 }}>{orderDate.toLocaleString()}</div>
                    )}
                    <div style={{ display: 'grid', gap: 3, margin: '10px 0', paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
                      {items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: COLORS.text }}>
                          <span>{item.name}</span>
                          <span style={{ color: COLORS.muted }}>× {item.quantity}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
                      <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 16, color: COLORS.sale }}>{currencySymbol}{Number(order.totalAmount).toLocaleString()}</span>
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

