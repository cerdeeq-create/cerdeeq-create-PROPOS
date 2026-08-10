function validateProductPayload(payload) {
  const price = Number(payload?.price);
  const costPrice = Number(payload?.costPrice);
  const stock = Number(payload?.stock);

  if (!payload?.name || !String(payload.name).trim()) {
    return { ok: false, error: 'Product name is required' };
  }

  if ((!Number.isFinite(price) || price < 0) || (!Number.isFinite(costPrice) || costPrice < 0) || (!Number.isFinite(stock) || stock < 0)) {
    return { ok: false, error: 'Price must be zero or greater and stock must be zero or greater' };
  }

  return { ok: true };
}

function validateSalePayload(payload, products = []) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const discountType = payload?.discountType || 'none';
  const discountValue = Number(payload?.discountValue);
  if (!items.length) {
    return { ok: false, error: 'Sale items are required' };
  }

  if (!['none', 'amount', 'percent'].includes(discountType)) {
    return { ok: false, error: 'Discount type is invalid' };
  }

  if (discountType === 'amount' && (!Number.isFinite(discountValue) || discountValue < 0)) {
    return { ok: false, error: 'Discount amount must be zero or greater' };
  }

  if (discountType === 'percent' && (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > 100)) {
    return { ok: false, error: 'Discount percent must be between 0 and 100' };
  }

  const productMap = new Map((products || []).map((product) => [product.id, product]));
  for (const item of items) {
    const requestedQuantity = Number(item?.quantity) || 0;
    const product = productMap.get(item?.productId);
    if (!product) {
      return { ok: false, error: `Product ${item?.name || 'unknown'} was not found` };
    }
    if (requestedQuantity <= 0) {
      return { ok: false, error: 'Each sale item needs a positive quantity' };
    }
    const available = Number(product.stock) || 0;
    if (requestedQuantity > available) {
      return { ok: false, error: `Not enough stock for ${item.name || 'item'}` };
    }
  }

  return { ok: true };
}

function validatePurchaseOrderPayload(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const supplier = String(payload?.supplier || '').trim();
  if (!supplier || !items.length) {
    return { ok: false, error: 'Supplier name is required and at least one item is required' };
  }

  return { ok: true };
}

function validateReceivingPayload(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) {
    return { ok: false, error: 'Receiving items are required' };
  }

  for (const item of items) {
    const quantity = Number(item?.quantity) || 0;
    const unitCost = Number(item?.unitCost) || 0;
    if (quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      return { ok: false, error: 'Each receiving item needs a quantity greater than zero and a valid unit cost' };
    }
  }

  return { ok: true };
}

function validateServiceTransactionPayload(payload) {
  const serviceType = String(payload?.serviceType || '').trim().toLowerCase();
  const beneficiary = String(payload?.beneficiary || '').trim();
  const phoneNumber = String(payload?.phoneNumber || '').trim();
  const amount = Number(payload?.amount);

  if (!serviceType || !beneficiary || !phoneNumber || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Service type, beneficiary, phone number, and a positive amount are required' };
  }

  if (!['data', 'airtime', 'subscription', 'exams'].includes(serviceType)) {
    return { ok: false, error: 'Unsupported service type' };
  }

  return { ok: true };
}

module.exports = {
  validateProductPayload,
  validateSalePayload,
  validatePurchaseOrderPayload,
  validateReceivingPayload,
  validateServiceTransactionPayload,
};
