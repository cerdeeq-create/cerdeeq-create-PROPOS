export const calculateActualProfit = (sale) => {
  const items = sale?.items || [];
  return items.reduce((sum, item) => {
    const unitProfit = (Number(item.price) || 0) - (Number(item.costPrice || 0) || 0);
    return sum + unitProfit * (Number(item.quantity) || 0);
  }, 0);
};

export const filterSalesByDateRange = (sales, startDate, endDate) => {
  if (!startDate && !endDate) {
    return sales;
  }

  const normalizedStart = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const normalizedEnd = endDate ? new Date(`${endDate}T23:59:59`) : null;

  return sales.filter((sale) => {
    const saleTime = sale?.datetime ? new Date(sale.datetime) : null;
    if (!saleTime || Number.isNaN(saleTime.getTime())) {
      return false;
    }

    const afterStart = !normalizedStart || saleTime >= normalizedStart;
    const beforeEnd = !normalizedEnd || saleTime <= normalizedEnd;
    return afterStart && beforeEnd;
  });
};

export const filterReceivingHistory = (history, supplierQuery = '', startDate = '', endDate = '') => {
  const normalizedQuery = (supplierQuery || '').trim().toLowerCase();
  const normalizedStart = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const normalizedEnd = endDate ? new Date(`${endDate}T23:59:59`) : null;

  return history.filter((entry) => {
    const supplierMatch = !normalizedQuery || (entry?.supplier || '').toLowerCase().includes(normalizedQuery);
    const entryTime = entry?.date ? new Date(entry.date) : null;

    let dateMatch = !normalizedStart && !normalizedEnd;
    if (entryTime && !Number.isNaN(entryTime.getTime())) {
      const afterStart = !normalizedStart || entryTime >= normalizedStart;
      const beforeEnd = !normalizedEnd || entryTime <= normalizedEnd;
      dateMatch = afterStart && beforeEnd;
    }

    return supplierMatch && dateMatch;
  });
};

export const buildReceivingSupplierSummary = (history) => {
  const grouped = history.reduce((result, entry) => {
    const supplierName = entry?.supplier || 'Unknown Supplier';
    if (!result[supplierName]) {
      result[supplierName] = {
        supplier: supplierName,
        receiptsCount: 0,
        totalAmount: 0,
        totalItems: 0,
      };
    }

    const summary = result[supplierName];
    summary.receiptsCount += 1;
    summary.totalAmount += Number(entry?.totalAmount) || 0;

    try {
      const items = JSON.parse(entry?.itemsJson || '[]');
      summary.totalItems += items.reduce((count, item) => count + (Number(item?.quantity) || 0), 0);
    } catch (error) {
      summary.totalItems += 0;
    }

    return result;
  }, {});

  return Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
};

export const buildReceivingSpendTrend = (history) => {
  return buildReceivingSupplierSummary(history).map((entry) => ({
    ...entry,
    share: entry.totalAmount > 0 ? Math.round((entry.totalAmount / Math.max(1, history.reduce((sum, item) => sum + Number(item?.totalAmount || 0), 0))) * 100) : 0,
  }));
};

export const buildSupplierReportSummary = (purchaseOrders = [], receivingHistory = []) => {
  const grouped = [...purchaseOrders, ...receivingHistory].reduce((result, entry) => {
    const supplierName = entry?.supplier || 'Unknown Supplier';
    if (!result[supplierName]) {
      result[supplierName] = {
        supplier: supplierName,
        purchaseOrderAmount: 0,
        purchaseOrderCount: 0,
        receivingAmount: 0,
        receivingCount: 0,
        receivingItems: 0,
      };
    }

    const summary = result[supplierName];
    const isPurchaseOrder = Object.prototype.hasOwnProperty.call(entry, 'status') || Object.prototype.hasOwnProperty.call(entry, 'createdAt');
    if (isPurchaseOrder) {
      summary.purchaseOrderAmount += Number(entry?.totalAmount) || 0;
      summary.purchaseOrderCount += 1;
    } else {
      summary.receivingAmount += Number(entry?.totalAmount) || 0;
      summary.receivingCount += 1;
      try {
        const items = JSON.parse(entry?.itemsJson || '[]');
        summary.receivingItems += items.reduce((count, item) => count + (Number(item?.quantity) || 0), 0);
      } catch (error) {
        summary.receivingItems += 0;
      }
    }

    return result;
  }, {});

  return Object.values(grouped).sort((a, b) => (b.purchaseOrderAmount + b.receivingAmount) - (a.purchaseOrderAmount + a.receivingAmount));
};

export const exportSupplierReportToCsv = (summary) => {
  const rows = summary.map((entry) => [
    entry?.supplier || 'Unknown Supplier',
    Number(entry?.purchaseOrderAmount || 0).toFixed(2),
    Number(entry?.receivingAmount || 0).toFixed(2),
    Number(entry?.purchaseOrderCount || 0),
    Number(entry?.receivingCount || 0),
    Number(entry?.receivingItems || 0),
  ]);

  const header = ['Supplier', 'Purchase Order Amount', 'Receiving Amount', 'Purchase Order Count', 'Receiving Count', 'Receiving Items'];
  const csvRows = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return csvRows.join('\n');
};

export const parsePurchaseOrderItems = (order) => {
  const directItems = Array.isArray(order?.items) ? order.items : [];
  const parsedItems = [];

  try {
    const parsed = JSON.parse(order?.itemsJson || '[]');
    if (Array.isArray(parsed)) {
      parsedItems.push(...parsed);
    }
  } catch (error) {
    // Ignore invalid JSON and fall back to direct items.
  }

  if (directItems.length > 0) {
    return [...parsedItems, ...directItems];
  }

  return parsedItems;
};

export const buildReceivingItemsFromPurchaseOrder = (order) => {
  return parsePurchaseOrderItems(order).map((item) => ({
    id: `${order?.id || 'po'}-${item?.name || 'item'}`,
    name: item?.name || 'Item',
    sku: item?.sku || item?.name || 'N/A',
    quantity: Number(item?.quantity) || 0,
    unitCost: Number(item?.unitCost || item?.costPrice || 0) || 0,
    sellingPrice: Number(item?.sellingPrice || item?.price || 0) || 0,
    totalCost: (Number(item?.unitCost || item?.costPrice || 0) || 0) * (Number(item?.quantity) || 0),
  }));
};

export const buildPurchaseOrderCompletionPayload = (order, receivingItems = []) => {
  const expectedItems = parsePurchaseOrderItems(order);
  const matchedNames = new Set((receivingItems || []).map((item) => (item?.name || '').trim().toLowerCase()));
  const allItemsMatched = expectedItems.every((item) => {
    const itemName = (item?.name || '').trim().toLowerCase();
    return !itemName || matchedNames.has(itemName);
  });

  return {
    shouldComplete: Boolean(order?.id) && expectedItems.length > 0 && allItemsMatched && (order?.status || 'pending') === 'approved',
    status: 'completed',
  };
};

export const buildPurchaseOrderTimeline = (order) => {
  const timeline = [];
  const createdAt = order?.createdAt || order?.date;
  if (createdAt) {
    timeline.push({ label: 'Created', date: createdAt, tone: 'neutral' });
  }

  const status = order?.status || 'pending';
  if (status === 'approved' || status === 'completed') {
    timeline.push({ label: 'Approved', date: order?.updatedAt || createdAt || new Date().toISOString(), tone: 'approved' });
  }
  if (status === 'completed') {
    timeline.push({ label: 'Completed', date: order?.updatedAt || createdAt || new Date().toISOString(), tone: 'completed' });
  }

  return timeline;
};

export const buildPurchaseOrderAuditSummary = (order) => {
  const items = parsePurchaseOrderItems(order);
  const itemsCount = items.reduce((count, item) => count + (Number(item?.quantity) || 0), 0);
  const lastUpdated = order?.updatedAt || order?.createdAt || order?.date;

  return {
    status: order?.status || 'pending',
    totalAmount: Number(order?.totalAmount || 0),
    itemsCount,
    lastUpdatedLabel: lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Not available',
  };
};

export const buildPurchaseOrderReceivingHistory = (receivingHistory = [], orderId) => {
  if (!orderId) {
    return [];
  }

  return (receivingHistory || []).filter((entry) => Number(entry?.purchaseOrderId || entry?.orderId || 0) === Number(orderId));
};

export const buildPurchaseOrderProgress = (order, receivingHistory = []) => {
  const orderedAmount = Number(order?.totalAmount || 0);
  const receivedAmount = (buildPurchaseOrderReceivingHistory(receivingHistory, order?.id) || []).reduce((sum, entry) => sum + Number(entry?.totalAmount || 0), 0);
  const percent = orderedAmount > 0 ? Math.min(100, Math.round((receivedAmount / orderedAmount) * 100)) : 0;

  return {
    orderedAmount,
    receivedAmount,
    percent,
    isComplete: orderedAmount > 0 && receivedAmount >= orderedAmount,
  };
};

export const buildSupplierContactSummary = (suppliers = [], supplierName = '') => {
  const normalizedName = (supplierName || '').trim().toLowerCase();
  const match = (suppliers || []).find((supplier) => (supplier?.name || '').trim().toLowerCase() === normalizedName);

  if (!match) {
    return null;
  }

  return {
    name: match?.name || supplierName,
    phone: match?.phone || '',
  };
};

export const buildSupplierOrderHistory = (orders = [], receivingHistory = [], supplierName = '') => {
  const normalizedName = (supplierName || '').trim().toLowerCase();
  const purchaseOrders = (orders || []).filter((order) => (order?.supplier || '').trim().toLowerCase() === normalizedName);
  const receipts = (receivingHistory || []).filter((entry) => (entry?.supplier || '').trim().toLowerCase() === normalizedName);

  return [
    ...purchaseOrders.map((order) => ({
      id: `po-${order?.id || Math.random()}`,
      type: 'purchase-order',
      date: order?.createdAt || order?.date || '',
      amount: Number(order?.totalAmount || 0),
      status: order?.status || 'pending',
    })),
    ...receipts.map((entry) => ({
      id: `rc-${entry?.id || Math.random()}`,
      type: 'receiving',
      date: entry?.date || '',
      amount: Number(entry?.totalAmount || 0),
      status: 'received',
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 4);
};

export const buildSupplierPerformanceSummary = (orders = [], receivingHistory = [], supplierName = '') => {
  const normalizedName = (supplierName || '').trim().toLowerCase();
  const purchaseOrders = (orders || []).filter((order) => (order?.supplier || '').trim().toLowerCase() === normalizedName);
  const receipts = (receivingHistory || []).filter((entry) => (entry?.supplier || '').trim().toLowerCase() === normalizedName);
  const totalSpend = purchaseOrders.reduce((sum, order) => sum + Number(order?.totalAmount || 0), 0) + receipts.reduce((sum, entry) => sum + Number(entry?.totalAmount || 0), 0);
  const orderCount = purchaseOrders.length;
  const receivingCount = receipts.length;
  const lastActivity = [...purchaseOrders, ...receipts].sort((a, b) => new Date(b?.createdAt || b?.date || 0) - new Date(a?.createdAt || a?.date || 0))[0];

  return {
    supplier: supplierName || 'Supplier',
    totalSpend,
    orderCount,
    receivingCount,
    lastActivityDate: lastActivity?.createdAt || lastActivity?.date || '',
  };
};

export const buildPurchaseOrderSummary = (orders) => {
  const grouped = orders.reduce((result, order) => {
    const supplierName = order?.supplier || 'Unknown Supplier';
    if (!result[supplierName]) {
      result[supplierName] = {
        supplier: supplierName,
        ordersCount: 0,
        totalAmount: 0,
        itemCount: 0,
        pendingCount: 0,
        approvedCount: 0,
        completedCount: 0,
      };
    }

    const summary = result[supplierName];
    summary.ordersCount += 1;
    summary.totalAmount += Number(order?.totalAmount) || 0;

    const status = order?.status || 'pending';
    if (status === 'approved') {
      summary.approvedCount += 1;
    } else if (status === 'completed') {
      summary.completedCount += 1;
    } else {
      summary.pendingCount += 1;
    }

    const items = parsePurchaseOrderItems(order);
    summary.itemCount += items.reduce((count, item) => count + (Number(item?.quantity) || 0), 0);

    return result;
  }, {});

  return Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
};

export const exportPurchaseOrdersToCsv = (orders) => {
  const rows = orders.map((order) => {
    const items = parsePurchaseOrderItems(order);
    const itemsSummary = items.map((item) => `${item?.name || 'Item'} x${item?.quantity || 0}`).join(' | ');

    return [
      order?.supplier || 'Unknown Supplier',
      order?.storeAccount || '',
      order?.status || 'pending',
      order?.createdAt || order?.date ? new Date(order?.createdAt || order?.date).toLocaleString() : '',
      Number(order?.totalAmount || 0).toFixed(2),
      itemsSummary,
    ];
  });

  const header = ['Supplier', 'Store Account', 'Status', 'Date', 'Total Amount', 'Items'];
  const csvRows = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return csvRows.join('\n');
};

export const exportReceivingHistoryToCsv = (history) => {
  const rows = history.map((entry) => {
    let itemsSummary = '';
    try {
      const items = JSON.parse(entry?.itemsJson || '[]');
      itemsSummary = items.map((item) => `${item?.name || 'Item'} x${item?.quantity || 0}`).join(' | ');
    } catch (error) {
      itemsSummary = '';
    }

    return [
      entry?.supplier || 'Unknown Supplier',
      entry?.storeAccount || '',
      entry?.date ? new Date(entry.date).toLocaleString() : '',
      Number(entry?.totalAmount || 0).toFixed(2),
      itemsSummary,
    ];
  });

  const header = ['Supplier', 'Store Account', 'Date', 'Total Amount', 'Items'];
  const csvRows = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return csvRows.join('\n');
};

export const exportSalesToCsv = (sales) => {
  const rows = sales.map((sale) => {
    const itemsSold = (sale.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const revenue = Number(sale.total) || 0;
    const profit = calculateActualProfit(sale);
    return [
      new Date(sale.datetime).toLocaleString(),
      sale.paymentMethod || 'Unknown',
      itemsSold,
      revenue.toFixed(2),
      profit.toFixed(2),
    ];
  });

  const header = ['Date', 'Payment Method', 'Items Sold', 'Revenue', 'Profit'];
  const csvRows = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return csvRows.join('\n');
};

export const buildCashierPerformance = (sales) => {
  const grouped = sales.reduce((result, sale) => {
    const cashierName = sale.cashierName || 'Unknown';
    if (!result[cashierName]) {
      result[cashierName] = {
        cashierName,
        salesCount: 0,
        totalRevenue: 0,
        totalProfit: 0,
        totalItems: 0,
        productTotals: {},
        salesHistory: [],
      };
    }

    const entry = result[cashierName];
    entry.salesCount += 1;
    entry.totalRevenue += Number(sale.total) || 0;
    entry.totalProfit += calculateActualProfit(sale);
    entry.totalItems += (sale.items || []).reduce((count, item) => count + (Number(item.quantity) || 0), 0);
    entry.salesHistory.push({
      id: sale.id,
      datetime: sale.datetime,
      paymentMethod: sale.paymentMethod || 'Unknown',
      total: Number(sale.total) || 0,
      profit: calculateActualProfit(sale),
      items: sale.items || [],
    });
    (sale.items || []).forEach((item) => {
      entry.productTotals[item.name] = (entry.productTotals[item.name] || 0) + (Number(item.quantity) || 0);
    });

    return result;
  }, {});

  return Object.values(grouped)
    .map((entry) => ({
      ...entry,
      topProducts: Object.entries(entry.productTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, quantity]) => ({ name, quantity })),
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
};

export const buildSalesSummary = (sales) => {
  return sales.reduce(
    (summary, sale) => {
      const orderItems = (sale.items || []).reduce((count, item) => count + (Number(item.quantity) || 0), 0);
      summary.totalRevenue += Number(sale.total) || 0;
      summary.totalProfit += calculateActualProfit(sale);
      summary.totalItems += orderItems;
      summary.salesCount += 1;
      summary.paymentMethods[sale.paymentMethod] = (summary.paymentMethods[sale.paymentMethod] || 0) + 1;
      (sale.items || []).forEach((item) => {
        summary.productTotals[item.name] = (summary.productTotals[item.name] || 0) + (Number(item.quantity) || 0);
      });
      return summary;
    },
    {
      totalRevenue: 0,
      totalProfit: 0,
      totalItems: 0,
      salesCount: 0,
      paymentMethods: {},
      productTotals: {},
    }
  );
};
