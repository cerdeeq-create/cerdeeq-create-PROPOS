import { calculateSaleTotals, validateCartAgainstStock } from './posUtils';

describe('calculateSaleTotals', () => {
  it('calculates subtotal, discount, and payable total for amount discounts', () => {
    const cart = [{ productId: 1, name: 'Bag', price: 100, quantity: 2 }];

    expect(calculateSaleTotals({ cart, discountType: 'amount', discountValue: '20' })).toEqual({
      subtotal: 200,
      discountAmount: 20,
      total: 180,
    });
  });

  it('calculates percentage discounts from the subtotal', () => {
    const cart = [{ productId: 1, name: 'Bag', price: 100, quantity: 2 }];

    expect(calculateSaleTotals({ cart, discountType: 'percent', discountValue: '10' })).toEqual({
      subtotal: 200,
      discountAmount: 20,
      total: 180,
    });
  });
});

describe('validateCartAgainstStock', () => {
  it('flags cart lines that exceed current stock', () => {
    const cart = [{ productId: 1, name: 'Bag', quantity: 4 }];
    const products = [{ id: 1, name: 'Bag', stock: 3 }];

    expect(validateCartAgainstStock(cart, products)).toEqual([
      { productId: 1, name: 'Bag', available: 3, requested: 4 },
    ]);
  });

  it('returns no issues when the cart stays within stock', () => {
    const cart = [{ productId: 1, name: 'Bag', quantity: 2 }];
    const products = [{ id: 1, name: 'Bag', stock: 3 }];

    expect(validateCartAgainstStock(cart, products)).toEqual([]);
  });

  it('flags cart lines for products not present in the catalog', () => {
    const cart = [{ productId: 99, name: 'Unknown Item', quantity: 1 }];
    const products = [{ id: 1, name: 'Bag', stock: 3 }];

    expect(validateCartAgainstStock(cart, products)).toEqual([
      { productId: 99, name: 'Unknown Item', available: 0, requested: 1 },
    ]);
  });
});
