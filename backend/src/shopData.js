function ensureStarterProducts(db) {
  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get();
  if (productCount.count > 0) {
    return;
  }

  const starterProducts = [
    { sku: 'SKU-001', name: 'Rice 5kg', price: 6000, costPrice: 5000, stock: 20 },
    { sku: 'SKU-002', name: 'Cooking Oil 1L', price: 2500, costPrice: 2000, stock: 15 },
    { sku: 'SKU-003', name: 'Sugar 1kg', price: 1800, costPrice: 1500, stock: 25 },
  ];

  const stmt = db.prepare('INSERT INTO products (sku, name, price, costPrice, stock) VALUES (?, ?, ?, ?, ?)');
  starterProducts.forEach((product) => {
    stmt.run(product.sku, product.name, product.price, product.costPrice, product.stock);
  });
}

module.exports = { ensureStarterProducts };
