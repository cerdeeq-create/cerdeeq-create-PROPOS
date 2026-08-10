const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductPayload, validateSalePayload, validatePurchaseOrderPayload, validateReceivingPayload, validateServiceTransactionPayload } = require('./validation');

test('validateProductPayload rejects negative stock and invalid prices', () => {
  assert.deepEqual(validateProductPayload({ sku: 'A1', name: 'Bag', price: -1, costPrice: 10, stock: -2 }), {
    ok: false,
    error: 'Price must be zero or greater and stock must be zero or greater',
  });
});

test('validateSalePayload rejects sale lines with insufficient stock', () => {
  const products = [{ id: 1, stock: 1 }];
  assert.deepEqual(validateSalePayload({ items: [{ productId: 1, name: 'Bag', price: 10, costPrice: 5, quantity: 2 }], paymentMethod: 'Cash' }, products), {
    ok: false,
    error: 'Not enough stock for Bag',
  });
});

test('validatePurchaseOrderPayload rejects empty supplier or items', () => {
  assert.deepEqual(validatePurchaseOrderPayload({ supplier: ' ', storeAccount: 'Main Store', items: [] }), {
    ok: false,
    error: 'Supplier name is required and at least one item is required',
  });
});

test('validateReceivingPayload rejects invalid quantities', () => {
  assert.deepEqual(validateReceivingPayload({ supplier: 'Supplier', storeAccount: 'Main Store', items: [{ name: 'Bag', quantity: 0, unitCost: 10 }] }), {
    ok: false,
    error: 'Each receiving item needs a quantity greater than zero and a valid unit cost',
  });
});

test('validateServiceTransactionPayload rejects incomplete or invalid service transactions', () => {
  assert.deepEqual(validateServiceTransactionPayload({ serviceType: 'data', beneficiary: ' ', phoneNumber: '', amount: 0 }), {
    ok: false,
    error: 'Service type, beneficiary, phone number, and a positive amount are required',
  });

  assert.deepEqual(validateServiceTransactionPayload({ serviceType: 'unknown', beneficiary: 'Jane', phoneNumber: '08012345678', amount: 100 }), {
    ok: false,
    error: 'Unsupported service type',
  });
});
