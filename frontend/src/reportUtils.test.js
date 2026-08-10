import { buildCashierPerformance, buildPurchaseOrderAuditSummary, buildPurchaseOrderCompletionPayload, buildPurchaseOrderProgress, buildPurchaseOrderReceivingHistory, buildPurchaseOrderSummary, buildPurchaseOrderTimeline, buildReceivingItemsFromPurchaseOrder, buildReceivingSpendTrend, buildReceivingSupplierSummary, buildSalesSummary, buildSupplierContactSummary, buildSupplierOrderHistory, buildSupplierPerformanceSummary, buildSupplierReportSummary, calculateActualProfit, exportPurchaseOrdersToCsv, exportReceivingHistoryToCsv, exportSalesToCsv, exportSupplierReportToCsv, filterReceivingHistory, filterSalesByDateRange, parsePurchaseOrderItems } from './reportUtils';

describe('reportUtils', () => {
  it('filters sales within the selected date range', () => {
    const sales = [
      { id: 1, datetime: '2026-07-10T10:00:00.000Z', items: [] },
      { id: 2, datetime: '2026-07-20T10:00:00.000Z', items: [] },
      { id: 3, datetime: '2026-08-02T10:00:00.000Z', items: [] },
    ];

    const filtered = filterSalesByDateRange(sales, '2026-07-15', '2026-08-01');

    expect(filtered).toHaveLength(1);
    expect(filtered.map((sale) => sale.id)).toEqual([2]);
  });

  it('builds summary totals from sales', () => {
    const sales = [
      {
        total: 100,
        items: [{ quantity: 2, price: 50, costPrice: 20 }],
        paymentMethod: 'Cash',
      },
    ];

    const summary = buildSalesSummary(sales);

    expect(summary.totalRevenue).toBe(100);
    expect(summary.totalProfit).toBe(60);
    expect(summary.salesCount).toBe(1);
    expect(summary.paymentMethods.Cash).toBe(1);
  });

  it('calculates profit from item costs', () => {
    const sale = {
      items: [{ quantity: 2, price: 40, costPrice: 25 }],
    };

    expect(calculateActualProfit(sale)).toBe(30);
  });

  it('exports filtered sales to CSV content', () => {
    const sales = [{ datetime: '2026-08-01T10:00:00.000Z', paymentMethod: 'Cash', total: 100, items: [{ quantity: 2, price: 50, costPrice: 30 }] }];

    const csv = exportSalesToCsv(sales);

    expect(csv).toContain('"Date","Payment Method","Items Sold","Revenue","Profit"');
    expect(csv).toContain('Cash');
    expect(csv).toContain('100');
  });

  it('builds cashier performance summaries', () => {
    const sales = [
      { cashierName: 'Ada', total: 100, items: [{ name: 'Bag', quantity: 2, price: 50, costPrice: 20 }], paymentMethod: 'Cash' },
      { cashierName: 'Ada', total: 80, items: [{ name: 'Shoes', quantity: 1, price: 80, costPrice: 40 }], paymentMethod: 'POS' },
      { cashierName: 'Ben', total: 60, items: [{ name: 'Bag', quantity: 1, price: 60, costPrice: 30 }], paymentMethod: 'Cash' },
    ];

    const performance = buildCashierPerformance(sales);

    expect(performance[0].cashierName).toBe('Ada');
    expect(performance[0].salesCount).toBe(2);
    expect(performance[0].totalRevenue).toBe(180);
    expect(performance[0].topProducts[0].name).toBe('Bag');
    expect(performance[0].salesHistory).toHaveLength(2);
    expect(performance[0].salesHistory[0].paymentMethod).toBe('Cash');
  });

  it('filters receiving history by supplier and date', () => {
    const history = [
      { id: 1, supplier: 'Modern Hub', date: '2026-08-01T10:00:00.000Z' },
      { id: 2, supplier: 'Classic Suppliers', date: '2026-08-05T10:00:00.000Z' },
      { id: 3, supplier: 'Modern Hub', date: '2026-08-06T10:00:00.000Z' },
    ];

    const filtered = filterReceivingHistory(history, 'modern', '2026-08-02', '2026-08-08');

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(3);
  });

  it('builds supplier-level receiving summaries', () => {
    const history = [
      { id: 1, supplier: 'Modern Hub', totalAmount: 1000, itemsJson: '[{"name":"Bag","quantity":2}]' },
      { id: 2, supplier: 'Modern Hub', totalAmount: 600, itemsJson: '[{"name":"Shoes","quantity":1}]' },
      { id: 3, supplier: 'Classic Suppliers', totalAmount: 400, itemsJson: '[{"name":"Belt","quantity":1}]' },
    ];

    const summary = buildReceivingSupplierSummary(history);

    expect(summary).toHaveLength(2);
    expect(summary[0].supplier).toBe('Modern Hub');
    expect(summary[0].totalAmount).toBe(1600);
    expect(summary[0].receiptsCount).toBe(2);
  });

  it('exports receiving history to CSV content', () => {
    const history = [{ supplier: 'Modern Hub', date: '2026-08-01T10:00:00.000Z', totalAmount: 1000, itemsJson: '[{"name":"Bag","quantity":2}]' }];

    const csv = exportReceivingHistoryToCsv(history);

    expect(csv).toContain('Supplier');
    expect(csv).toContain('Modern Hub');
    expect(csv).toContain('1000');
  });

  it('builds a supplier spend trend summary', () => {
    const history = [
      { supplier: 'Modern Hub', totalAmount: 1200, itemsJson: '[]' },
      { supplier: 'Modern Hub', totalAmount: 800, itemsJson: '[]' },
      { supplier: 'Classic Suppliers', totalAmount: 400, itemsJson: '[]' },
    ];

    const trend = buildReceivingSpendTrend(history);

    expect(trend).toHaveLength(2);
    expect(trend[0].supplier).toBe('Modern Hub');
    expect(trend[0].totalAmount).toBe(2000);
  });

  it('builds purchase-order summaries from draft data', () => {
    const orders = [
      { supplier: 'Modern Hub', totalAmount: 1200, itemsJson: '[{"name":"Bag","quantity":2}]' },
      { supplier: 'Classic Suppliers', totalAmount: 500, itemsJson: '[{"name":"Shoes","quantity":1}]' },
    ];

    const summary = buildPurchaseOrderSummary(orders);

    expect(summary).toHaveLength(2);
    expect(summary[0].supplier).toBe('Modern Hub');
    expect(summary[0].totalAmount).toBe(1200);
    expect(summary[0].itemCount).toBe(2);
  });

  it('parses purchase-order items from saved order data', () => {
    const order = {
      itemsJson: '[{"name":"Bag","quantity":2,"unitCost":120,"totalCost":240}]',
      items: [{ name: 'Shoes', quantity: 1, unitCost: 300, totalCost: 300 }],
    };

    const items = parsePurchaseOrderItems(order);

    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Bag');
    expect(items[0].quantity).toBe(2);
    expect(items[1].name).toBe('Shoes');
  });

  it('exports purchase orders to CSV content', () => {
    const orders = [{ supplier: 'Modern Hub', storeAccount: 'Main Store', status: 'approved', createdAt: '2026-08-01T10:00:00.000Z', totalAmount: 1200, itemsJson: '[{"name":"Bag","quantity":2}]' }];

    const csv = exportPurchaseOrdersToCsv(orders);

    expect(csv).toContain('Supplier');
    expect(csv).toContain('Modern Hub');
    expect(csv).toContain('approved');
  });

  it('builds receiving items from a purchase order payload', () => {
    const order = {
      supplier: 'Modern Hub',
      storeAccount: 'Main Store',
      date: '2026-08-01T10:00:00.000Z',
      itemsJson: '[{"name":"Bag","quantity":2,"unitCost":120,"totalCost":240}]',
      items: [{ name: 'Shoes', quantity: 1, unitCost: 300, totalCost: 300 }],
    };

    const items = buildReceivingItemsFromPurchaseOrder(order);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Bag', quantity: 2, unitCost: 120, totalCost: 240 });
    expect(items[1]).toMatchObject({ name: 'Shoes', quantity: 1, unitCost: 300, totalCost: 300 });
  });

  it('marks a purchase order as complete when the receiving draft matches its items', () => {
    const order = { id: 10, status: 'approved', itemsJson: '[{"name":"Bag","quantity":2}]' };
    const receivingItems = [{ name: 'Bag', quantity: 2 }];

    const payload = buildPurchaseOrderCompletionPayload(order, receivingItems);

    expect(payload.shouldComplete).toBe(true);
    expect(payload.status).toBe('completed');
  });

  it('builds supplier report summaries from orders and receiving history', () => {
    const orders = [{ supplier: 'Modern Hub', totalAmount: 1200, status: 'approved' }, { supplier: 'Classic Suppliers', totalAmount: 500, status: 'pending' }];
    const history = [{ supplier: 'Modern Hub', totalAmount: 800, itemsJson: '[{"name":"Bag","quantity":2}]' }];

    const summary = buildSupplierReportSummary(orders, history);

    expect(summary).toHaveLength(2);
    expect(summary[0].supplier).toBe('Modern Hub');
    expect(summary[0].purchaseOrderAmount).toBe(1200);
    expect(summary[0].receivingAmount).toBe(800);
    expect(summary[0].purchaseOrderCount).toBe(1);
  });

  it('exports supplier report summaries to CSV content', () => {
    const summary = [{ supplier: 'Modern Hub', purchaseOrderAmount: 1200, receivingAmount: 800, purchaseOrderCount: 1, receivingCount: 1, receivingItems: 2 }];

    const csv = exportSupplierReportToCsv(summary);

    expect(csv).toContain('Supplier');
    expect(csv).toContain('Modern Hub');
    expect(csv).toContain('1200.00');
  });

  it('builds a purchase-order timeline for status changes', () => {
    const order = {
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-02T12:00:00.000Z',
      status: 'completed',
    };

    const timeline = buildPurchaseOrderTimeline(order);

    expect(timeline.map((entry) => entry.label)).toEqual(['Created', 'Approved', 'Completed']);
    expect(timeline[1].tone).toBe('approved');
  });

  it('builds a compact purchase-order audit summary', () => {
    const order = {
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-02T12:00:00.000Z',
      status: 'completed',
      totalAmount: 1200,
      itemsJson: '[{"name":"Bag","quantity":2}]',
    };

    const summary = buildPurchaseOrderAuditSummary(order);

    expect(summary.status).toBe('completed');
    expect(summary.totalAmount).toBe(1200);
    expect(summary.itemsCount).toBe(2);
    expect(summary.lastUpdatedLabel).toContain('2026');
  });

  it('filters receiving entries for a specific purchase order', () => {
    const history = [
      { id: 1, purchaseOrderId: 7, totalAmount: 500 },
      { id: 2, purchaseOrderId: 8, totalAmount: 300 },
    ];

    const matches = buildPurchaseOrderReceivingHistory(history, 7);

    expect(matches).toHaveLength(1);
    expect(matches[0].totalAmount).toBe(500);
  });

  it('builds purchase-order progress from received totals', () => {
    const order = { id: 7, totalAmount: 1000 };
    const history = [{ purchaseOrderId: 7, totalAmount: 400 }, { purchaseOrderId: 7, totalAmount: 100 }];

    const progress = buildPurchaseOrderProgress(order, history);

    expect(progress.receivedAmount).toBe(500);
    expect(progress.percent).toBe(50);
    expect(progress.isComplete).toBe(false);
  });

  it('builds a supplier contact summary from saved supplier data', () => {
    const suppliers = [{ name: 'Modern Hub', phone: '0771234567' }];

    const summary = buildSupplierContactSummary(suppliers, 'modern hub');

    expect(summary.name).toBe('Modern Hub');
    expect(summary.phone).toBe('0771234567');
  });

  it('builds a compact supplier order history from purchase orders and receipts', () => {
    const orders = [{ id: 1, supplier: 'Modern Hub', totalAmount: 500, status: 'approved', createdAt: '2026-08-02T10:00:00.000Z' }];
    const history = [{ id: 2, supplier: 'Modern Hub', totalAmount: 300, date: '2026-08-03T10:00:00.000Z' }];

    const summary = buildSupplierOrderHistory(orders, history, 'Modern Hub');

    expect(summary).toHaveLength(2);
    expect(summary[0].type).toBe('receiving');
  });

  it('builds supplier performance totals from recent orders and receipts', () => {
    const orders = [{ supplier: 'Modern Hub', totalAmount: 500, createdAt: '2026-08-02T10:00:00.000Z' }];
    const history = [{ supplier: 'Modern Hub', totalAmount: 300, date: '2026-08-03T10:00:00.000Z' }];

    const performance = buildSupplierPerformanceSummary(orders, history, 'Modern Hub');

    expect(performance.totalSpend).toBe(800);
    expect(performance.orderCount).toBe(1);
    expect(performance.receivingCount).toBe(1);
  });
});
