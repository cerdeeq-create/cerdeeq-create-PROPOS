export function validateProductForm(values) {
  const name = String(values?.name || '').trim();
  const price = Number(values?.price);
  const costPrice = Number(values?.costPrice || 0);
  const stock = Number(values?.stock);

  if (!name) {
    return { ok: false, error: 'Product name is required' };
  }

  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: 'Price must be zero or greater' };
  }

  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return { ok: false, error: 'Cost price must be zero or greater' };
  }

  if (!Number.isFinite(stock) || stock < 0) {
    return { ok: false, error: 'Stock must be zero or greater' };
  }

  return { ok: true };
}
