export const calculateSaleTotals = ({ cart = [], discountType = 'none', discountValue = '0' } = {}) => {
  const subtotal = (cart || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const parsedDiscount = Number(discountValue) || 0;
  let discountAmount = 0;

  if (discountType === 'amount') {
    discountAmount = Math.max(0, parsedDiscount);
  } else if (discountType === 'percent') {
    discountAmount = Math.max(0, subtotal * (parsedDiscount / 100));
  }

  return {
    subtotal,
    discountAmount,
    total: Math.max(0, subtotal - discountAmount),
  };
};

export const validateCartAgainstStock = (cart, products) => {
  const productMap = new Map(products.map((product) => [product.id, product]));

  return cart
    .map((item) => {
      const product = productMap.get(item.productId);
      const requested = Number(item.quantity) || 0;
      const available = Number(product?.stock) || 0;

      if (!product) {
        return {
          productId: item.productId,
          name: item.name,
          available: 0,
          requested,
        };
      }

      if (requested > available) {
        return {
          productId: item.productId,
          name: item.name,
          available,
          requested,
        };
      }

      return null;
    })
    .filter(Boolean);
};
