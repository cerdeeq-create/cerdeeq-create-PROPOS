const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateProductPayload,
  validateSalePayload,
  validatePurchaseOrderPayload,
  validateReceivingPayload,
  validateServiceTransactionPayload,
  validateSocialAccountLinkInitPayload,
  validateMediaImportRequestPayload,
  validateSocialAccountLinkCompletePayload,
} = require('./validation');

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

test('validateSocialAccountLinkInitPayload enforces supported platform and permissions', () => {
  assert.deepEqual(validateSocialAccountLinkInitPayload({ platform: 'instagram', accountLabel: 'My Brand', permissions: ['media.read'] }), {
    ok: false,
    error: 'Platform must be tiktok or facebook',
  });

  const valid = validateSocialAccountLinkInitPayload({ platform: 'tiktok', accountLabel: 'My Brand', permissions: ['media.read', 'content.read'] });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value.permissions, ['media.read', 'content.read']);
});

test('validateMediaImportRequestPayload validates account and limit ranges', () => {
  assert.deepEqual(validateMediaImportRequestPayload({ accountId: 0, mediaType: 'all', maxItems: 20 }), {
    ok: false,
    error: 'A valid account is required',
  });

  assert.deepEqual(validateMediaImportRequestPayload({ accountId: 2, mediaType: 'all', maxItems: 500 }), {
    ok: false,
    error: 'maxItems must be between 1 and 200',
  });

  const valid = validateMediaImportRequestPayload({
    accountId: 3,
    mediaType: 'video',
    sinceDate: '2026-01-01',
    untilDate: '2026-08-15',
    maxItems: 35,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.accountId, 3);
  assert.equal(valid.value.mediaType, 'video');
  assert.equal(valid.value.maxItems, 35);
});

test('validateSocialAccountLinkCompletePayload requires state and an identifier', () => {
  assert.deepEqual(validateSocialAccountLinkCompletePayload({ accountId: 0, oauthState: '', platformAccountId: '' }), {
    ok: false,
    error: 'Valid accountId is required',
  });

  assert.deepEqual(validateSocialAccountLinkCompletePayload({ accountId: 2, oauthState: '', platformAccountId: '' }), {
    ok: false,
    error: 'oauthState is required',
  });

  assert.deepEqual(validateSocialAccountLinkCompletePayload({ accountId: 2, oauthState: 'abc123', platformAccountId: '' }), {
    ok: false,
    error: 'authorizationCode or platformAccountId is required',
  });

  const valid = validateSocialAccountLinkCompletePayload({
    accountId: 2,
    oauthState: 'abc123',
    authorizationCode: 'sample_auth_code',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.authorizationCode, 'sample_auth_code');
});
