async function ensureStarterProducts(db) {
  const { rows } = await db.query('SELECT COUNT(*) AS count FROM products');
  if (Number(rows[0].count) > 0) {
    return;
  }

  const starterProducts = [
    { sku: 'SKU-001', name: 'Rice 5kg', price: 6000, costPrice: 5000, stock: 20 },
    { sku: 'SKU-002', name: 'Cooking Oil 1L', price: 2500, costPrice: 2000, stock: 15 },
    { sku: 'SKU-003', name: 'Sugar 1kg', price: 1800, costPrice: 1500, stock: 25 },
  ];

  for (const product of starterProducts) {
    await db.query(
      'INSERT INTO products (sku, name, price, "costPrice", stock) VALUES ($1, $2, $3, $4, $5)',
      [product.sku, product.name, product.price, product.costPrice, product.stock]
    );
  }
}

module.exports = { ensureStarterProducts };

