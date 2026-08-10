const defaultSettings = {
  shopName: 'A NOOR INVESTMENT',
  currencySymbol: '₦',
  defaultStoreAccount: 'Main Store',
  receiptFooter: 'Thank you for shopping with us!',
  autoPrintReceipts: false,
};

const defaultCustomers = [
  { id: 1, name: 'Walk-in Customer', phone: 'N/A' },
];

const defaultSuppliers = [
  { id: 1, name: 'Main Supplier', phone: '07000000000' },
];

export function loadStarterShopData(storage) {
  const savedCustomers = JSON.parse(storage.getItem('posCustomers') || '[]');
  const savedSuppliers = JSON.parse(storage.getItem('posSuppliers') || '[]');
  const savedSettings = JSON.parse(storage.getItem('posSettings') || '{}');

  const hasCustomers = Array.isArray(savedCustomers) && savedCustomers.length > 0;
  const hasSuppliers = Array.isArray(savedSuppliers) && savedSuppliers.length > 0;

  const seededCustomers = hasCustomers ? savedCustomers : defaultCustomers;
  const seededSuppliers = hasSuppliers ? savedSuppliers : defaultSuppliers;
  const mergedSettings = { ...defaultSettings, ...savedSettings };

  if (!hasCustomers) {
    storage.setItem('posCustomers', JSON.stringify(seededCustomers));
  }
  if (!hasSuppliers) {
    storage.setItem('posSuppliers', JSON.stringify(seededSuppliers));
  }
  if (!storage.getItem('posSettings')) {
    storage.setItem('posSettings', JSON.stringify(mergedSettings));
  }

  return {
    customers: seededCustomers,
    suppliers: seededSuppliers,
    settings: mergedSettings,
  };
}
