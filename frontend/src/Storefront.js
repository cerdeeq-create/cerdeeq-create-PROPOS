import React, { useMemo, useState } from 'react';

const COLORS = {
  espresso: '#2B2118',
  walnut: '#4A3426',
  gold: '#C6A15B',
  antiqueGold: '#A9823A',
  ivory: '#F7F3EA',
  warmWhite: '#FFFDF8',
  charcoal: '#292521',
  taupe: '#8A8177',
  border: '#E5DCCB',
};

function Storefront({ products, shopName, currencySymbol, onStaffLoginClick, onPlaceOrder }) {
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState({ customerName: '', phone: '', address: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState(null);

  const availableProducts = (products || []).filter((product) => Number(product.stock) > 0);

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
      setForm({ customerName: '', phone: '', address: '', notes: '' });
    } catch (err) {
      setError(err.message || 'Could not place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successOrder) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${COLORS.ivory} 0%, #F0E9D8 100%)`, padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 460, background: COLORS.warmWhite, border: `1px solid ${COLORS.border}`, borderRadius: 24, boxShadow: '0 24px 60px rgba(29, 27, 24, 0.12)', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 26, color: COLORS.espresso }}>Order Placed!</div>
          <div style={{ color: COLORS.taupe, fontSize: 14, marginTop: 8 }}>
            Order #{successOrder.id} — {currencySymbol}{Number(successOrder.totalAmount).toLocaleString()}
          </div>
          <div style={{ color: COLORS.charcoal, fontSize: 14, marginTop: 16, lineHeight: 1.6 }}>
            Thank you, {successOrder.customerName}! Please come in or wait for us to reach out to arrange pickup/delivery and payment.
          </div>
          <button
            type="button"
            onClick={() => setSuccessOrder(null)}
            style={{ marginTop: 20, background: `linear-gradient(180deg, ${COLORS.gold} 0%, ${COLORS.espresso} 100%)`, color: COLORS.warmWhite, border: 'none', borderRadius: 12, padding: '12px 20px', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Place Another Order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.ivory }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', background: COLORS.warmWhite, borderBottom: `1px solid ${COLORS.border}` }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 26, color: COLORS.espresso, lineHeight: 1 }}>{shopName || 'NOOR'}</div>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: COLORS.gold, marginTop: 4 }}>Shop Online</div>
        </div>
        <button
          type="button"
          onClick={onStaffLoginClick}
          style={{ padding: '10px 16px', border: `1px solid ${COLORS.border}`, borderRadius: 10, background: 'transparent', color: COLORS.walnut, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Staff Login
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, padding: 24, maxWidth: 1200, margin: '0 auto', alignItems: 'start' }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: COLORS.espresso, marginBottom: 16 }}>Our Products</div>
          {!availableProducts.length && (
            <div style={{ color: COLORS.taupe, fontSize: 14 }}>No products are available right now. Please check back later.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {availableProducts.map((product) => {
              const inCart = cart.find((item) => item.productId === product.id);
              return (
                <div key={product.id} style={{ background: COLORS.warmWhite, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16, display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 700, color: COLORS.espresso, fontSize: 15 }}>{product.name}</div>
                  <div style={{ color: COLORS.gold, fontWeight: 700, fontSize: 16 }}>{currencySymbol}{Number(product.price).toLocaleString()}</div>
                  <div style={{ color: COLORS.taupe, fontSize: 12 }}>{product.stock} in stock</div>
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={inCart ? inCart.quantity >= product.stock : false}
                    style={{
                      marginTop: 4,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: inCart && inCart.quantity >= product.stock ? COLORS.border : `linear-gradient(180deg, ${COLORS.gold} 0%, ${COLORS.antiqueGold} 100%)`,
                      color: COLORS.warmWhite,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: inCart && inCart.quantity >= product.stock ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {inCart ? `In Cart (${inCart.quantity})` : 'Add to Cart'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: COLORS.warmWhite, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20, position: 'sticky', top: 24 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 700, color: COLORS.espresso, marginBottom: 12 }}>Your Cart</div>
          {!cart.length && <div style={{ color: COLORS.taupe, fontSize: 13 }}>Your cart is empty.</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            {cart.map((item) => (
              <div key={item.productId} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.charcoal }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.taupe }}>{currencySymbol}{item.price.toLocaleString()} each</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" onClick={() => updateQuantity(item.productId, item.quantity - 1)} style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.ivory, cursor: 'pointer' }}>-</button>
                  <span style={{ minWidth: 18, textAlign: 'center', fontSize: 13 }}>{item.quantity}</span>
                  <button type="button" onClick={() => updateQuantity(item.productId, item.quantity + 1)} style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.ivory, cursor: 'pointer' }}>+</button>
                  <button type="button" onClick={() => removeFromCart(item.productId)} style={{ marginLeft: 4, border: 'none', background: 'transparent', color: '#b42318', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {!!cart.length && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: COLORS.espresso }}>
              <span>Total</span>
              <span>{currencySymbol}{cartTotal.toLocaleString()}</span>
            </div>
          )}

          <form onSubmit={submitOrder} style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.charcoal, fontWeight: 600 }}>
              Full Name
              <input
                type="text"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14 }}
                placeholder="Your name"
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.charcoal, fontWeight: 600 }}>
              Phone Number
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14 }}
                placeholder="Your phone number"
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.charcoal, fontWeight: 600 }}>
              Delivery Address (optional)
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14 }}
                placeholder="Leave blank for in-store pickup"
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: COLORS.charcoal, fontWeight: 600 }}>
              Notes (optional)
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, minHeight: 50, fontFamily: 'inherit' }}
                placeholder="Any special instructions"
              />
            </label>

            {error && <div style={{ color: '#b42318', background: '#fff1f2', border: '1px solid #fbcfe0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}

            <button
              type="submit"
              disabled={submitting || !cart.length}
              style={{
                marginTop: 4,
                background: submitting || !cart.length ? COLORS.border : `linear-gradient(180deg, ${COLORS.gold} 0%, ${COLORS.espresso} 100%)`,
                color: COLORS.warmWhite,
                border: 'none',
                borderRadius: 12,
                padding: '14px 16px',
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: submitting || !cart.length ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Placing Order…' : 'Place Order (Pay on Pickup/Delivery)'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.06em', color: COLORS.taupe, fontWeight: 700, textTransform: 'uppercase' }}>
              POWERD BY PRO CREATIVES | 08147621844
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Storefront;
