import React, { useEffect, useRef, useState } from 'react';
import { buildStaffUpdatePayload } from './staffUtils';
import { buildCashierPerformance, buildPurchaseOrderAuditSummary, buildPurchaseOrderCompletionPayload, buildPurchaseOrderProgress, buildPurchaseOrderReceivingHistory, buildPurchaseOrderSummary, buildPurchaseOrderTimeline, buildReceivingItemsFromPurchaseOrder, buildReceivingSpendTrend, buildReceivingSupplierSummary, buildSalesSummary, buildSupplierContactSummary, buildSupplierOrderHistory, buildSupplierPerformanceSummary, buildSupplierReportSummary, calculateActualProfit, exportPurchaseOrdersToCsv, exportReceivingHistoryToCsv, exportSalesToCsv, exportSupplierReportToCsv, filterReceivingHistory, filterSalesByDateRange, parsePurchaseOrderItems } from './reportUtils';
import { createAuthenticatedFetch } from './apiClient';
import { calculateSaleTotals, validateCartAgainstStock } from './posUtils';
import { validateProductForm } from './formValidation';
import { loadStarterShopData } from './initialData';

const API_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  const skuInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [discountType, setDiscountType] = useState('none');
  const [discountValue, setDiscountValue] = useState('');
  const [showCheckoutReview, setShowCheckoutReview] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [reportSales, setReportSales] = useState([]);
  const [form, setForm] = useState({ sku: '', name: '', price: '', costPrice: '', stock: '' });
  const [editingProductId, setEditingProductId] = useState(null);
  const [skuInput, setSkuInput] = useState('');
  const [tenderAmount, setTenderAmount] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userList, setUserList] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [newUserForm, setNewUserForm] = useState({ fullName: '', username: '', password: '', role: 'cashier' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserForm, setEditingUserForm] = useState({ fullName: '', username: '', password: '', role: 'cashier' });
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' });
  const [newSupplierForm, setNewSupplierForm] = useState({ name: '', phone: '' });
  const [productFilter, setProductFilter] = useState('');
  const [productSort, setProductSort] = useState('name');
  const [productStatusFilter, setProductStatusFilter] = useState('all');
  const [reorderQuantity, setReorderQuantity] = useState({});
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [receivingSearch, setReceivingSearch] = useState('');
  const [receivingHistoryFilter, setReceivingHistoryFilter] = useState('');
  const [receivingHistoryStartDate, setReceivingHistoryStartDate] = useState('');
  const [receivingHistoryEndDate, setReceivingHistoryEndDate] = useState('');
  const [purchaseOrderStatusFilter, setPurchaseOrderStatusFilter] = useState('all');
  const [purchaseOrderSupplierFilter, setPurchaseOrderSupplierFilter] = useState('');
  const [purchaseOrderStartDate, setPurchaseOrderStartDate] = useState('');
  const [purchaseOrderEndDate, setPurchaseOrderEndDate] = useState('');
  const [supplierReportSupplierFilter, setSupplierReportSupplierFilter] = useState('');
  const [supplierReportStartDate, setSupplierReportStartDate] = useState('');
  const [supplierReportEndDate, setSupplierReportEndDate] = useState('');
  const [showReceivingForm, setShowReceivingForm] = useState(false);

  const clearPurchaseOrderFilters = () => {
    setPurchaseOrderStatusFilter('all');
    setPurchaseOrderSupplierFilter('');
    setPurchaseOrderStartDate('');
    setPurchaseOrderEndDate('');
  };
  const [stockMovements, setStockMovements] = useState([]);
  const [receivingHistory, setReceivingHistory] = useState([]);
  const [receivingItems, setReceivingItems] = useState([]);
  const [supplierName, setSupplierName] = useState('');
  const [storeAccount, setStoreAccount] = useState('Main Store');
  const [receivingReceipt, setReceivingReceipt] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState(null);
  const [activePurchaseOrderId, setActivePurchaseOrderId] = useState(null);
  const [settings, setSettings] = useState({
    shopName: 'A NOOR INVESTMENT',
    currencySymbol: '₦',
    defaultStoreAccount: 'Main Store',
    receiptFooter: 'Thank you for shopping with us!',
    autoPrintReceipts: false,
  });
  const [settingsMessage, setSettingsMessage] = useState('');
  const [productFormMessage, setProductFormMessage] = useState('');
  const lowStockThreshold = 5;

  useEffect(() => {
    const storedUser = localStorage.getItem('posUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    fetchProducts();
    fetchReports();
    fetchStockMovements();
    fetchReceivingHistory();
    fetchPurchaseOrders();
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    } else {
      setUserList([]);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'admin') {
      setActiveView('dashboard');
    } else if (user) {
      setActiveView('sales');
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const { customers: starterCustomers, suppliers: starterSuppliers, settings: starterSettings } = loadStarterShopData(localStorage);
    setCustomers(starterCustomers);
    setSuppliers(starterSuppliers);
    const nextSettings = {
      shopName: 'A NOOR INVESTMENT',
      currencySymbol: '₦',
      defaultStoreAccount: 'Main Store',
      receiptFooter: 'Thank you for shopping with us!',
      autoPrintReceipts: false,
      ...starterSettings,
    };
    setSettings(nextSettings);
    setStoreAccount(nextSettings.defaultStoreAccount || 'Main Store');
  }, []);

  const formatMoney = (value = 0) => `${settings.currencySymbol}${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const escapeHtml = (value = '') => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const exportAsPdf = (title, headers, rows) => {
    const headersHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
    const rowsHtml = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    const printableHtml = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          h1 { font-size: 20px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 7px; text-align: left; }
          th { background: #f5efe2; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <table>
          <thead>
            <tr>${headersHtml}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      window.alert('Please allow pop-ups to export the PDF.');
      return;
    }

    printWindow.document.write(printableHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    }, 500);
  };

  const authHeaders = () => {
    return user?.token
      ? { Authorization: `Bearer ${user.token}` }
      : {};
  };

  const saveUser = (userData) => {
    setUser(userData);
    localStorage.setItem('posUser', JSON.stringify(userData));
  };

  const updateSetting = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = (event) => {
    event.preventDefault();
    const cleanedSettings = {
      ...settings,
      shopName: (settings.shopName || '').trim() || 'A NOOR INVESTMENT',
      currencySymbol: (settings.currencySymbol || '').trim() || '₦',
      defaultStoreAccount: (settings.defaultStoreAccount || '').trim() || 'Main Store',
      receiptFooter: (settings.receiptFooter || '').trim() || 'Thank you for shopping with us!',
    };
    setSettings(cleanedSettings);
    localStorage.setItem('posSettings', JSON.stringify(cleanedSettings));
    setStoreAccount(cleanedSettings.defaultStoreAccount || 'Main Store');
    setSettingsMessage('Settings saved successfully.');
    window.setTimeout(() => setSettingsMessage(''), 2200);
  };

  const refreshAuthToken = async () => {
    if (!user?.refreshToken) {
      return false;
    }
    const response = await fetch(`${API_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: user.refreshToken }),
    });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    const updatedUser = { ...user, token: data.token, refreshToken: data.refreshToken };
    saveUser(updatedUser);
    return true;
  };

  const authenticatedFetch = createAuthenticatedFetch({
    user,
    refreshTokenHandler: refreshAuthToken,
    logoutHandler: () => logout(),
  });

  const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...authHeaders(),
      },
    });
    if (response.status === 401 && user?.refreshToken) {
      const refreshed = await refreshAuthToken();
      if (!refreshed) {
        logout();
        return response;
      }
      const secondResponse = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...authHeaders(),
        },
      });
      return secondResponse;
    }
    return response;
  };

  const fetchProducts = async () => {
    const response = await authenticatedFetch(`${API_URL}/products`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      setProducts(await response.json());
    } else {
      setProducts([]);
    }
  };

  const fetchReports = async () => {
    const response = await authenticatedFetch(`${API_URL}/reports/sales`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      setReportSales(await response.json());
    } else {
      setReportSales([]);
    }
  };

  const fetchStockMovements = async () => {
    const response = await authenticatedFetch(`${API_URL}/stock-movements`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      setStockMovements(await response.json());
    } else {
      setStockMovements([]);
    }
  };

  const fetchReceivingHistory = async () => {
    const response = await authenticatedFetch(`${API_URL}/receiving-history`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      setReceivingHistory(await response.json());
    } else {
      setReceivingHistory([]);
    }
  };

  const fetchPurchaseOrders = async () => {
    const response = await apiFetch(`${API_URL}/purchase-orders`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      setPurchaseOrders(await response.json());
    } else {
      setPurchaseOrders([]);
    }
  };

  const fetchUsers = async () => {
    if (user?.role !== 'admin') {
      setUserList([]);
      return;
    }
    const response = await apiFetch(`${API_URL}/users`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      setUserList(await response.json());
    } else {
      setUserList([]);
    }
  };

  const addToCart = (product) => {
    if (!product || Number(product.stock) <= 0) {
      window.alert('This item is out of stock.');
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        const nextQuantity = Math.min(existing.quantity + 1, Number(product.stock));
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: nextQuantity }
            : item
        );
      }
      return [...current, { productId: product.id, name: product.name, price: product.price, costPrice: product.costPrice || 0, quantity: 1 }];
    });
  };

  const scanBySku = () => {
    const sku = skuInput.trim();
    if (!sku) return;
    const product = products.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
    if (!product) {
      window.alert(`No product found with SKU "${sku}".`);
      return;
    }
    addToCart(product);
    setSkuInput('');
  };

  const updateQuantity = (productId, quantity) => {
    setCart((current) =>
      current
        .map((item) => {
          if (item.productId !== productId) {
            return item;
          }
          const normalized = Number(quantity) || 0;
          const product = products.find((entry) => entry.id === productId);
          const maxAllowed = product ? Number(product.stock) || 0 : normalized;
          return { ...item, quantity: Math.min(Math.max(normalized, 0), maxAllowed || 1) };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removeCartItem = (productId) => {
    setCart((current) => current.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setTenderAmount('');
    setDiscountType('none');
    setDiscountValue('');
    setShowCheckoutReview(false);
  };

  const startEditProduct = (product) => {
    setEditingProductId(product.id);
    setForm({
      sku: product.sku,
      name: product.name,
      price: product.price.toString(),
      costPrice: product.costPrice ? product.costPrice.toString() : '',
      stock: product.stock.toString(),
    });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setForm({ sku: '', name: '', price: '', costPrice: '', stock: '' });
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    if (!user || user.role !== 'admin') {
      setProductFormMessage('Only admin can manage products.');
      return;
    }

    const validation = validateProductForm({
      name: form.name,
      price: form.price,
      costPrice: form.costPrice,
      stock: form.stock,
    });

    if (!validation.ok) {
      setProductFormMessage(validation.error);
      return;
    }

    const payload = {
      sku: form.sku,
      name: form.name,
      price: parseFloat(form.price),
      costPrice: parseFloat(form.costPrice || 0),
      stock: parseInt(form.stock, 10),
    };

    const url = editingProductId ? `${API_URL}/products/${editingProductId}` : `${API_URL}/products`;
    const method = editingProductId ? 'PUT' : 'POST';

    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      setProductFormMessage(errorData.error || (editingProductId ? 'Failed to update product.' : 'Failed to add product.'));
      return;
    }

    setProductFormMessage('Product saved successfully.');
    setEditingProductId(null);
    setForm({ sku: '', name: '', price: '', costPrice: '', stock: '' });
    fetchProducts();
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('Delete this product?')) {
      return;
    }
    const response = await apiFetch(`${API_URL}/products/${productId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      window.alert('Failed to delete product.');
      return;
    }
    fetchProducts();
  };

  const addReceivingItem = () => {
    if (!form.name.trim() || !form.stock || Number(form.stock) <= 0) {
      window.alert('Enter an item name and valid quantity before adding to the receiving list.');
      return;
    }

    const quantity = Number(form.stock);
    const unitCost = Number(form.costPrice || 0);
    const sellingPrice = Number(form.price || 0);

    setReceivingItems((current) => [
      ...current,
      {
        id: Date.now(),
        name: form.name.trim(),
        sku: form.sku.trim() || 'N/A',
        quantity,
        unitCost,
        sellingPrice,
        totalCost: unitCost * quantity,
      },
    ]);

    setForm({ sku: '', name: '', price: '', costPrice: '', stock: '' });
  };

  const updateReceivingItem = (itemId, field, value) => {
    setReceivingItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const nextValue = field === 'quantity' ? Number(value) || 0 : Number(value) || 0;
        const updatedItem = { ...item, [field]: nextValue };
        return {
          ...updatedItem,
          totalCost: updatedItem.unitCost * updatedItem.quantity,
        };
      })
    );
  };

  const removeReceivingItem = (itemId) => {
    setReceivingItems((current) => current.filter((item) => item.id !== itemId));
  };

  const printReceivingReceipt = (receipt) => {
    if (!receipt) return;

    const receiptWindow = window.open('', '_blank', 'width=420,height=700');
    if (!receiptWindow) {
      window.alert('Popup blocked. Please allow popups to print the receiving receipt.');
      return;
    }

    const itemsHtml = receipt.items
      .map(
        (item) => `
          <tr>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${formatMoney(item.unitCost)}</td>
            <td>${formatMoney(item.totalCost)}</td>
          </tr>
        `
      )
      .join('');

    const html = `
      <html>
        <head>
          <title>${settings.shopName} Receiving Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 18px; color: #111; background: #fff; }
            .header { text-align: center; border-bottom: 1px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
            .title { font-size: 20px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
            .meta { font-size: 11px; line-height: 1.6; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { padding: 5px 0; text-align: left; border-bottom: 1px solid #eee; }
            th:nth-child(2), td:nth-child(2), th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { text-align: right; }
            .totals { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #111; font-size: 12px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .grand { font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${settings.shopName}</div>
            <div>Receiving Report</div>
          </div>
          <div class="meta">
            <div>Supplier: ${receipt.supplier}</div>
            <div>Store Account: ${receipt.storeAccount}</div>
            <div>Date: ${new Date(receipt.date).toLocaleString()}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Amt</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="totals">
            <div class="row grand">
              <span>Total</span>
              <span>${formatMoney(receipt.totalAmount)}</span>
            </div>
          </div>
        </body>
      </html>
    `;

    receiptWindow.document.write(html);
    receiptWindow.document.close();
    setTimeout(() => {
      receiptWindow.focus();
      receiptWindow.print();
      receiptWindow.close();
    }, 300);
  };

  const completeReceiving = async () => {
    if (receivingItems.length === 0) {
      window.alert('There are no items in the receiving receipt yet.');
      return;
    }

    const totalAmount = receivingItems.reduce((sum, item) => sum + item.totalCost, 0);
    const receipt = {
      id: Date.now(),
      supplier: supplierName || 'Supplier not specified',
      storeAccount: storeAccount || settings.defaultStoreAccount || 'Main Store',
      date: new Date().toISOString(),
      items: receivingItems,
      totalAmount,
    };

    try {
      const receivingResponse = await apiFetch(`${API_URL}/receiving-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: supplierName || 'Supplier not specified',
          storeAccount: storeAccount || settings.defaultStoreAccount || 'Main Store',
          date: new Date().toISOString(),
          items: receivingItems,
          totalAmount,
          purchaseOrderId: activePurchaseOrderId || null,
        }),
      });

      if (!receivingResponse.ok) {
        throw new Error('Failed to save receiving history');
      }

      for (const item of receivingItems) {
        const normalizedSku = (item.sku || item.name || '').toString().trim() || item.name.trim();
        const existingProduct = products.find((product) =>
          (product.sku && product.sku.toLowerCase() === normalizedSku.toLowerCase()) ||
          product.name.toLowerCase() === item.name.toLowerCase()
        );

        if (existingProduct) {
          const nextStock = Number(existingProduct.stock || 0) + Number(item.quantity || 0);
          const response = await apiFetch(`${API_URL}/products/${existingProduct.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: existingProduct.sku || normalizedSku,
              name: existingProduct.name,
              price: Number(existingProduct.price) || Number(item.sellingPrice) || 0,
              costPrice: Number(item.unitCost) || Number(existingProduct.costPrice) || 0,
              stock: nextStock,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to update stock for ${item.name}`);
          }
        } else {
          const response = await apiFetch(`${API_URL}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: normalizedSku,
              name: item.name,
              price: Number(item.sellingPrice) || 0,
              costPrice: Number(item.unitCost) || 0,
              stock: Number(item.quantity) || 0,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to create product ${item.name}`);
          }
        }
      }

      printReceivingReceipt(receipt);
      const completionPayload = buildPurchaseOrderCompletionPayload(
        purchaseOrders.find((order) => order.id === activePurchaseOrderId) || null,
        receivingItems
      );
      if (completionPayload.shouldComplete) {
        await apiFetch(`${API_URL}/purchase-orders/${activePurchaseOrderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: completionPayload.status }),
        });
        await fetchPurchaseOrders();
      }
      setReceivingItems([]);
      setSupplierName('');
      setStoreAccount('Main Store');
      setActivePurchaseOrderId(null);
      await fetchProducts();
      await fetchStockMovements();
      await fetchReceivingHistory();
      window.alert('Receiving completed and stock updated.');
    } catch (error) {
      window.alert(error.message || 'Unable to complete receiving.');
    }
  };

  const createUser = async (event) => {
    event.preventDefault();
    const response = await apiFetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUserForm),
    });
    if (!response.ok) {
      window.alert('Only admin can create cashier accounts.');
      return;
    }
    setNewUserForm({ fullName: '', username: '', password: '', role: 'cashier' });
    fetchUsers();
  };

  const startEditingUser = (user) => {
    setEditingUserId(user.id);
    setEditingUserForm({
      fullName: user.fullName || user.username || '',
      username: user.username || '',
      password: '',
      role: user.role || 'cashier',
    });
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setEditingUserForm({ fullName: '', username: '', password: '', role: 'cashier' });
  };

  const saveEditedUser = async (event) => {
    event.preventDefault();
    if (!editingUserId) {
      return;
    }

    const payload = buildStaffUpdatePayload(editingUserForm);
    if (!payload.fullName || !payload.username) {
      window.alert('Full name and username are required.');
      return;
    }

    const response = await updateUser(editingUserId, payload);
    if (!response || response.ok === false) {
      return;
    }

    cancelEditingUser();
  };

  const updateUser = async (userId, updates) => {
    const response = await apiFetch(`${API_URL}/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      window.alert('Failed to update staff account.');
      return false;
    }
    fetchUsers();
    return response;
  };

  const deleteUser = async (userId) => {
    const confirmed = window.confirm('Delete this staff account?');
    if (!confirmed) return;
    const response = await apiFetch(`${API_URL}/users/${userId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      window.alert('Failed to delete staff account.');
      return;
    }
    fetchUsers();
  };

  const handleCreateCustomer = (event) => {
    event.preventDefault();
    if (!newCustomerForm.name.trim() || !newCustomerForm.phone.trim()) {
      window.alert('Customer name and phone number are required.');
      return;
    }
    const nextCustomer = {
      id: Date.now(),
      name: newCustomerForm.name.trim(),
      phone: newCustomerForm.phone.trim(),
    };
    const nextCustomers = [...customers, nextCustomer];
    setCustomers(nextCustomers);
    localStorage.setItem('posCustomers', JSON.stringify(nextCustomers));
    setNewCustomerForm({ name: '', phone: '' });
  };

  const handleCreateSupplier = (event) => {
    event.preventDefault();
    if (!newSupplierForm.name.trim() || !newSupplierForm.phone.trim()) {
      window.alert('Supplier name and phone number are required.');
      return;
    }
    const nextSupplier = {
      id: Date.now(),
      name: newSupplierForm.name.trim(),
      phone: newSupplierForm.phone.trim(),
    };
    const nextSuppliers = [...suppliers, nextSupplier];
    setSuppliers(nextSuppliers);
    localStorage.setItem('posSuppliers', JSON.stringify(nextSuppliers));
    setNewSupplierForm({ name: '', phone: '' });
  };

  const login = async (event) => {
    event.preventDefault();
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm),
    });
    if (!response.ok) {
      setLoginError('Invalid username or password');
      return;
    }
    const userData = await response.json();
    saveUser(userData);
    setLoginError('');
    fetchUsers();
  };

  const logout = async () => {
    if (user?.refreshToken) {
      await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: user.refreshToken }),
      });
    }
    setUser(null);
    localStorage.removeItem('posUser');
    setReceipt(null);
    setCart([]);
    setTenderAmount('');
  };

  const placeSale = async () => {
    if (!cart.length) return;
    const stockIssues = validateCartAgainstStock(cart, products);
    if (stockIssues.length > 0) {
      const issueText = stockIssues.map((issue) => `${issue.name}: requested ${issue.requested}, available ${issue.available}`).join('\n');
      window.alert(`Some items exceed current stock:\n${issueText}`);
      return;
    }

    const { subtotal, discountAmount, total } = calculateSaleTotals({ cart, discountType, discountValue });
    const saleItems = cart.map((item) => ({ ...item, price: Number(item.price) || 0, costPrice: Number(item.costPrice) || 0 }));
    const costTotal = cart.reduce((sum, item) => sum + (item.costPrice || 0) * item.quantity, 0);
    const profit = total - costTotal;
    const tenderValue = parseFloat(tenderAmount) || 0;
    if (paymentMethod === 'Cash' && tenderValue < total) {
      window.alert('Enter a cash amount equal to or greater than the total.');
      return;
    }
    const response = await authenticatedFetch(`${API_URL}/sales`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: saleItems,
        paymentMethod,
        cashierName: user?.username || 'Unknown',
        discountType,
        discountValue,
      }),
    });
    if (!response.ok) {
      window.alert('Failed to complete sale. Please try again.');
      return;
    }
    const sale = await response.json();
    const nextReceipt = {
      saleId: sale.saleId || Date.now(),
      datetime: new Date().toISOString(),
      items: saleItems,
      subtotal: sale?.subtotal || saleTotals.subtotal,
      discountAmount: sale?.discountAmount || saleTotals.discountAmount,
      total,
      profit,
      paymentMethod,
      tender: tenderValue,
      change: Math.max(0, tenderValue - total),
    };
    setReceipt(nextReceipt);
    setCart([]);
    setTenderAmount('');
    setDiscountType('none');
    setDiscountValue('');
    setShowCheckoutReview(false);
    setShowReceiptPreview(false);
    setShowReceiptPreview(false);
    fetchProducts();
    fetchReports();
    fetchStockMovements();
    if (settings.autoPrintReceipts) {
      setTimeout(() => printReceipt(nextReceipt), 200);
    }
    setReceipt(nextReceipt);
    setShowReceiptPreview(false);
    window.alert('Sale completed!');
  };

  const saleTotals = calculateSaleTotals({ cart, discountType, discountValue });
  const total = saleTotals.total;
  const printReceipt = (receiptData = receipt) => {
    if (!receiptData) {
      return;
    }
    setShowReceiptPreview(false);
    window.setTimeout(() => window.print(), 150);
  };

  const displayedProducts = products
    .filter((product) => {
      const query = `${product.sku} ${product.name}`.toLowerCase();
      const matchesQuery = query.includes(productFilter.toLowerCase());
      const matchesStatus =
        productStatusFilter === 'all' ||
        (productStatusFilter === 'low' && product.stock <= lowStockThreshold && product.stock > 0) ||
        (productStatusFilter === 'out' && product.stock === 0) ||
        (productStatusFilter === 'in' && product.stock > lowStockThreshold);
      return matchesQuery && matchesStatus;
    })
    .sort((a, b) => {
      if (productSort === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (productSort === 'price') {
        return a.price - b.price;
      }
      if (productSort === 'stock') {
        return a.stock - b.stock;
      }
      return 0;
    });

  const lowStockProducts = products.filter((product) => product.stock <= lowStockThreshold);
  const inventorySummary = {
    lowStockCount: products.filter((product) => product.stock > 0 && product.stock <= lowStockThreshold).length,
    outOfStockCount: products.filter((product) => product.stock === 0).length,
    healthyCount: products.filter((product) => product.stock > lowStockThreshold).length,
  };
  const filteredReceivingProducts = products.filter((product) =>
    `${product.sku} ${product.name}`.toLowerCase().includes(receivingSearch.toLowerCase())
  );
  const filteredReceivingHistory = filterReceivingHistory(
    receivingHistory,
    receivingHistoryFilter,
    receivingHistoryStartDate,
    receivingHistoryEndDate
  );
  const filteredPurchaseOrders = purchaseOrders.filter((order) => {
    const statusMatch = purchaseOrderStatusFilter === 'all' || (order.status || 'pending') === purchaseOrderStatusFilter;
    const supplierQuery = purchaseOrderSupplierFilter.trim().toLowerCase();
    const supplierMatch = !supplierQuery || (order.supplier || '').toLowerCase().includes(supplierQuery);

    const normalizedStart = purchaseOrderStartDate ? new Date(`${purchaseOrderStartDate}T00:00:00`) : null;
    const normalizedEnd = purchaseOrderEndDate ? new Date(`${purchaseOrderEndDate}T23:59:59`) : null;
    const orderTime = order?.createdAt || order?.date ? new Date(order?.createdAt || order?.date) : null;
    let dateMatch = !normalizedStart && !normalizedEnd;
    if (orderTime && !Number.isNaN(orderTime.getTime())) {
      const afterStart = !normalizedStart || orderTime >= normalizedStart;
      const beforeEnd = !normalizedEnd || orderTime <= normalizedEnd;
      dateMatch = afterStart && beforeEnd;
    }

    return statusMatch && supplierMatch && dateMatch;
  });
  const receivingSupplierSummary = buildReceivingSupplierSummary(filteredReceivingHistory);
  const receivingSpendTrend = buildReceivingSpendTrend(filteredReceivingHistory);
  const purchaseOrderSummary = buildPurchaseOrderSummary(purchaseOrders);
  const filteredSupplierReportPurchaseOrders = purchaseOrders.filter((order) => {
    const supplierQuery = supplierReportSupplierFilter.trim().toLowerCase();
    const supplierMatch = !supplierQuery || (order.supplier || '').toLowerCase().includes(supplierQuery);
    const normalizedStart = supplierReportStartDate ? new Date(`${supplierReportStartDate}T00:00:00`) : null;
    const normalizedEnd = supplierReportEndDate ? new Date(`${supplierReportEndDate}T23:59:59`) : null;
    const orderTime = order?.createdAt || order?.date ? new Date(order?.createdAt || order?.date) : null;
    let dateMatch = !normalizedStart && !normalizedEnd;
    if (orderTime && !Number.isNaN(orderTime.getTime())) {
      const afterStart = !normalizedStart || orderTime >= normalizedStart;
      const beforeEnd = !normalizedEnd || orderTime <= normalizedEnd;
      dateMatch = afterStart && beforeEnd;
    }
    return supplierMatch && dateMatch;
  });
  const filteredSupplierReportHistory = filterReceivingHistory(receivingHistory, supplierReportSupplierFilter, supplierReportStartDate, supplierReportEndDate);
  const supplierReportSummary = buildSupplierReportSummary(filteredSupplierReportPurchaseOrders, filteredSupplierReportHistory);
  const salesSearchResults = products.filter((product) => {
    const searchText = (skuInput || '').trim().toLowerCase();
    if (!searchText) return true;
    return `${product.sku} ${product.name}`.toLowerCase().includes(searchText);
  }).slice(0, 8);
  const filteredReportSales = filterSalesByDateRange(reportSales, reportStartDate, reportEndDate);
  const salesSummary = buildSalesSummary(filteredReportSales);
  const cashierPerformance = buildCashierPerformance(filteredReportSales);

  const topProducts = Object.entries(salesSummary.productTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const paymentMethodEntries = Object.entries(salesSummary.paymentMethods);

  const handleExportReport = () => {
    const headers = ['Receipt #', 'Date', 'Customer', 'Payment', 'Items', 'Total', 'Profit'];
    const rows = filteredReportSales.map((sale) => [
      sale.saleId,
      new Date(sale.datetime).toLocaleString(),
      sale.customerName || 'Walk-in',
      sale.paymentMethod || 'Cash',
      (sale.items || []).map((item) => `${item.name} x${item.quantity}`).join(', '),
      formatMoney(sale.total),
      formatMoney(calculateActualProfit(sale) || 0),
    ]);
    exportAsPdf('Sales Report', headers, rows);
  };

  const handleExportReceivingHistory = () => {
    const headers = ['Receipt #', 'Date', 'Supplier', 'Items', 'Amount'];
    const rows = filteredReceivingHistory.map((entry) => [
      entry.receiptNumber || entry.id,
      new Date(entry.createdAt || entry.date).toLocaleString(),
      entry.supplier || 'Unknown',
      (entry.items || []).map((item) => `${item.name} x${item.quantity}`).join(', '),
      formatMoney(entry.totalAmount || entry.amount || 0),
    ]);
    exportAsPdf('Receiving History', headers, rows);
  };

  const handleExportPurchaseOrders = () => {
    const headers = ['Order #', 'Date', 'Supplier', 'Status', 'Items', 'Amount'];
    const rows = filteredPurchaseOrders.map((order) => [
      order.orderNumber || order.id,
      new Date(order.createdAt || order.date).toLocaleString(),
      order.supplier || 'Unknown',
      order.status || 'pending',
      (order.items || []).map((item) => `${item.name} x${item.quantity}`).join(', '),
      formatMoney(order.totalAmount || order.amount || 0),
    ]);
    exportAsPdf('Purchase Orders', headers, rows);
  };

  const handleExportSupplierReport = () => {
    const headers = ['Supplier', 'Purchase Orders', 'Receiving', 'Total'];
    const rows = supplierReportSummary.map((entry) => [
      entry.supplier,
      formatMoney(entry.purchaseOrderAmount || 0),
      formatMoney(entry.receivingAmount || 0),
      formatMoney((entry.purchaseOrderAmount || 0) + (entry.receivingAmount || 0)),
    ]);
    exportAsPdf('Supplier Report', headers, rows);
  };

  const updatePurchaseOrderStatus = async (orderId, status) => {
    try {
      const response = await apiFetch(`${API_URL}/purchase-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Unable to update purchase order status');
      }

      const updatedOrder = await response.json();
      setPurchaseOrders((current) => current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
    } catch (error) {
      window.alert(error.message || 'Unable to update purchase order status');
    }
  };

  const addPurchaseOrder = async () => {
    if (!supplierName.trim()) {
      window.alert('Enter a supplier before creating a purchase order.');
      return;
    }
    if (receivingItems.length === 0) {
      window.alert('Add at least one item to the purchase order.');
      return;
    }

    const totalAmount = receivingItems.reduce((sum, item) => sum + item.totalCost, 0);

    try {
      const response = await apiFetch(`${API_URL}/purchase-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: supplierName.trim(),
          storeAccount: storeAccount || 'Main Store',
          date: new Date().toISOString(),
          items: receivingItems,
          totalAmount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Unable to save purchase order');
      }

      const createdOrder = await response.json();
      setPurchaseOrders((current) => [createdOrder, ...current]);
      setReceivingItems([]);
      setSupplierName('');
      setStoreAccount('Main Store');
      window.alert('Purchase order created successfully.');
    } catch (error) {
      window.alert(error.message || 'Unable to save purchase order');
    }
  };

  const handleReceivePurchaseOrder = async (order) => {
    if (!order) {
      return;
    }

    const nextItems = buildReceivingItemsFromPurchaseOrder(order);
    if (nextItems.length === 0) {
      window.alert('This purchase order has no items to receive.');
      return;
    }

    setReceivingItems(nextItems);
    setSupplierName(order?.supplier || '');
    setStoreAccount(order?.storeAccount || 'Main Store');
    setSelectedPurchaseOrderId(null);
    setActivePurchaseOrderId(order?.id || null);
    setShowReceivingForm(true);
    window.alert('Purchase order loaded into receiving draft.');
  };

  const handleReorder = async (product) => {
    if (!user || user.role !== 'admin') {
      window.alert('Only admin can place stock orders.');
      return;
    }

    const quantityToAdd = Number(reorderQuantity[product.id] || 0);
    if (!quantityToAdd || quantityToAdd <= 0) {
      window.alert('Enter a valid reorder quantity.');
      return;
    }

    try {
      const response = await apiFetch(`${API_URL}/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: product.sku,
          name: product.name,
          price: product.price,
          costPrice: product.costPrice || 0,
          stock: (Number(product.stock) || 0) + quantityToAdd,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to update stock');
      }

      setReorderQuantity((current) => ({ ...current, [product.id]: '' }));
      fetchProducts();
      fetchStockMovements();
      window.alert(`Stock updated for ${product.name}.`);
    } catch (error) {
      window.alert(error.message || 'Unable to update stock');
    }
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #f8f2e7 0%, #efe5d2 100%)', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 440, background: '#fffdf9', border: '1px solid #d9c9a9', borderRadius: 24, boxShadow: '0 24px 60px rgba(29, 27, 24, 0.12)', padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 24, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>A NOOR INVESTMENT</div>
          </div>

          <form onSubmit={login} style={{ display: 'grid', gap: 16 }}>
            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
              Username
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #d4c3a0', background: '#fff', color: '#1d1b18', fontSize: 15 }}
                placeholder="Enter username"
              />
            </label>

            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
              Password
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #d4c3a0', background: '#fff', color: '#1d1b18', fontSize: 15 }}
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  style={{ padding: '11px 12px', minWidth: 74, border: '1px solid #d4c3a0', borderRadius: 10, background: '#f3eadc', color: '#2a241d', fontWeight: 700, cursor: 'pointer' }}
                >
                  {showLoginPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {loginError && <div style={{ color: '#b42318', background: '#fff1f2', border: '1px solid #fbcfe0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{loginError}</div>}

            <button
              type="submit"
              style={{ marginTop: 4, background: 'linear-gradient(180deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdfb', border: 'none', borderRadius: 12, padding: '14px 16px', fontWeight: 700, fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Login
            </button>
            <div style={{ marginTop: 6, textAlign: 'center', fontSize: 11, letterSpacing: '0.08em', color: '#8a6a2f', fontWeight: 700, textTransform: 'uppercase' }}>
              CREATED BY AB CREATIVES | 08147621844
            </div>
          </form>
        </div>
      </div>
    );
  }

  const navItems = user.role === 'admin'
    ? [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'inventory', label: 'Inventory' },
        { key: 'receiving', label: 'Receiving' },
        { key: 'sales', label: 'Sales' },
        { key: 'reports', label: 'Reports' },
        { key: 'supplierReports', label: 'Supplier Reports' },
        { key: 'staffs', label: 'Staffs' },
        { key: 'customers', label: 'Customers' },
        { key: 'suppliers', label: 'Suppliers' },
        { key: 'settings', label: 'Settings' },
      ]
    : [
        { key: 'sales', label: 'Sales' },
      ];

  const printReceiptCss = `
    @media print {
      @page {
        size: 80mm auto;
        margin: 6mm;
      }
      .no-print {
        display: none !important;
      }
      body {
        background: #fff !important;
      }
      .receipt-print {
        display: block !important;
        position: static !important;
        width: 100% !important;
        max-width: 80mm !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
        background: #fff !important;
      }
      .receipt-print * {
        visibility: visible !important;
      }
    }
  `;

  return (
    <>
      <style>{printReceiptCss}</style>
      <div className="no-print" style={{ display: 'flex', minHeight: '100vh', background: '#f4f6fb' }}>
        <aside style={{ width: 250, background: 'linear-gradient(180deg, #1d1b18 0%, #2c261f 100%)', color: '#fff', padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '4px 0 20px rgba(17, 19, 24, 0.16)' }}>
          <div style={{ marginBottom: 22, padding: '16px 12px', borderRadius: 16, background: 'rgba(245, 239, 231, 0.12)', border: '1px solid rgba(244, 232, 205, 0.18)', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 92, height: 92, borderRadius: 28, background: 'linear-gradient(135deg, #f9f3e7 0%, #caa24a 48%, #8b6a2c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(0, 0, 0, 0.22)', border: '2px solid rgba(255, 255, 255, 0.24)' }}>
              <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="7" y="7" width="50" height="50" rx="18" fill="#1d1b18" />
                <path d="M20 18H29L40 32L29 46H20L31 32L20 18Z" fill="#fffdf9" />
                <path d="M33 18H42L31 32L42 46H33L24 32L33 18Z" fill="#f1c96b" />
              </svg>
            </div>
          </div>
          {navItems.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => item.key === 'logout' ? logout() : setActiveView(item.key)}
                style={{
                  background: isActive ? 'rgba(245, 239, 231, 0.16)' : 'transparent',
                  color: '#fff',
                  border: isActive ? '1px solid rgba(244, 232, 205, 0.38)' : '1px solid transparent',
                  borderRadius: 12,
                  padding: '12px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 14,
                  boxShadow: isActive ? '0 4px 10px rgba(0, 0, 0, 0.16)' : 'none',
                }}
              >
                {item.label}
              </button>
            );
          })}
          <button
            onClick={logout}
            style={{
              marginTop: 'auto',
              background: 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '12px 14px',
              textAlign: 'left',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
            }}
          >
            Logout
          </button>
        </aside>
        <div style={{ flex: 1, padding: 20, maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24, padding: '18px 22px', background: 'linear-gradient(135deg, #1d1b18 0%, #2c261f 100%)', border: '1px solid #d9c9a9', borderRadius: 14, boxShadow: '0 8px 18px rgba(17, 19, 24, 0.18), inset 0 -2px 0 rgba(244, 232, 205, 0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 4, height: 34, borderRadius: 999, background: 'linear-gradient(180deg, #f4e8cd 0%, #b8944d 100%)', boxShadow: '0 0 10px rgba(244, 232, 205, 0.35)' }} />
              <div style={{ padding: '12px 18px', borderRadius: 999, background: '#f5efe7', color: '#1d1b18', fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 800, boxShadow: '0 4px 10px rgba(0, 0, 0, 0.16)', border: '1px solid rgba(184, 148, 77, 0.35)' }}>{settings.shopName}</div>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ minWidth: 220, padding: '12px 18px', borderRadius: 999, background: 'rgba(245, 239, 231, 0.12)', color: '#fffdf9', border: '1px solid rgba(244, 232, 205, 0.24)', textAlign: 'center', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 4 }}>Welcome</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Courier New, monospace', letterSpacing: '0.08em' }}>
                  {currentTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 999, background: '#f5efe7', color: '#1d1b18', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800, boxShadow: '0 4px 10px rgba(0, 0, 0, 0.16)', border: '1px solid rgba(184, 148, 77, 0.35)', minWidth: 0 }}>
              <span style={{ fontSize: 16 }}>👤</span>
              {user?.fullName || user?.username || 'Account holder'}
            </div>
          </div>
      {activeView === 'settings' && (
        <section style={{ marginBottom: 20, background: '#fffdf9', border: '1px solid #d9c9a9', borderRadius: 16, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 18, borderBottom: '1px solid #e7dcc2', paddingBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 30 }}>Settings</h2>
            <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>System preferences</div>
          </div>

          <form onSubmit={saveSettings} style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Shop name
                <input
                  value={settings.shopName}
                  onChange={(e) => updateSetting('shopName', e.target.value)}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #cdbd99', background: '#fffdfb', color: '#1d1b18' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Currency symbol
                <input
                  value={settings.currencySymbol}
                  onChange={(e) => updateSetting('currencySymbol', e.target.value)}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #cdbd99', background: '#fffdfb', color: '#1d1b18' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Default store account
                <input
                  value={settings.defaultStoreAccount}
                  onChange={(e) => updateSetting('defaultStoreAccount', e.target.value)}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #cdbd99', background: '#fffdfb', color: '#1d1b18' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Receipt footer
                <input
                  value={settings.receiptFooter}
                  onChange={(e) => updateSetting('receiptFooter', e.target.value)}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #cdbd99', background: '#fffdfb', color: '#1d1b18' }}
                />
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: '14px 16px', color: '#433d36', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={settings.autoPrintReceipts}
                onChange={(e) => updateSetting('autoPrintReceipts', e.target.checked)}
              />
              Auto print receipts after completed sales
            </label>

            {settingsMessage && <div style={{ color: '#1d6438', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{settingsMessage}</div>}

            <button type="submit" style={{ justifySelf: 'start', background: 'linear-gradient(180deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdfb', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 700, cursor: 'pointer' }}>
              Save settings
            </button>
          </form>
        </section>
      )}

      {user.role === 'admin' && activeView === 'staffs' && (
        <section style={{ marginBottom: 20, background: '#fffdf9', border: '1px solid #d9c9a9', borderRadius: 16, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 18, borderBottom: '1px solid #e7dcc2', paddingBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 30 }}>Cashier Management</h2>
            <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Staff Register</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 20 }}>
            <form onSubmit={createUser} style={{ display: 'grid', gap: 14, background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Cashier full name
                <input
                  type="text"
                  value={newUserForm.fullName}
                  onChange={(e) => setNewUserForm({ ...newUserForm, fullName: e.target.value })}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                  placeholder="e.g. Sarah Johnson"
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Username
                <input
                  type="text"
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                  placeholder="cashier username"
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Password
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                    placeholder="Create password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((prev) => !prev)}
                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cdbd99', background: '#f3eadc', color: '#2a241d', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showCreatePassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Role
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                >
                  <option value="cashier">Cashier</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <button type="submit" style={{ marginTop: 6, background: 'linear-gradient(180deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdfb', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Create Cashier
              </button>
            </form>

            <div style={{ background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: '0 0 14px', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 24 }}>Cashier accounts</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {userList.map((u) => {
                  const isEditing = editingUserId === u.id;
                  return (
                    <li key={u.id} style={{ background: '#fffdfb', border: '1px solid #e0d0a9', borderRadius: 10, padding: '12px 14px', color: '#2d2924', display: 'grid', gap: 10 }}>
                      {isEditing ? (
                        <form onSubmit={saveEditedUser} style={{ display: 'grid', gap: 10 }}>
                          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#433d36', fontWeight: 600 }}>
                            Full name
                            <input
                              type="text"
                              value={editingUserForm.fullName}
                              onChange={(e) => setEditingUserForm({ ...editingUserForm, fullName: e.target.value })}
                              style={{ width: '100%', padding: '9px 10px', border: '1px solid #cdbd99', borderRadius: 8, background: '#fffdfb', color: '#1d1b18' }}
                              required
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#433d36', fontWeight: 600 }}>
                            Username
                            <input
                              type="text"
                              value={editingUserForm.username}
                              onChange={(e) => setEditingUserForm({ ...editingUserForm, username: e.target.value })}
                              style={{ width: '100%', padding: '9px 10px', border: '1px solid #cdbd99', borderRadius: 8, background: '#fffdfb', color: '#1d1b18' }}
                              required
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#433d36', fontWeight: 600 }}>
                            New password
                            <input
                              type="password"
                              value={editingUserForm.password}
                              onChange={(e) => setEditingUserForm({ ...editingUserForm, password: e.target.value })}
                              style={{ width: '100%', padding: '9px 10px', border: '1px solid #cdbd99', borderRadius: 8, background: '#fffdfb', color: '#1d1b18' }}
                              placeholder="Leave blank to keep current"
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#433d36', fontWeight: 600 }}>
                            Role
                            <select
                              value={editingUserForm.role}
                              onChange={(e) => setEditingUserForm({ ...editingUserForm, role: e.target.value })}
                              style={{ width: '100%', padding: '9px 10px', border: '1px solid #cdbd99', borderRadius: 8, background: '#fffdfb', color: '#1d1b18' }}
                            >
                              <option value="cashier">Cashier</option>
                              <option value="admin">Admin</option>
                            </select>
                          </label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="submit" style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #b8944d', background: '#b8944d', color: '#fffdfb', fontWeight: 700, cursor: 'pointer' }}>
                              Save
                            </button>
                            <button type="button" onClick={cancelEditingUser} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cdbd99', background: '#f3eadc', color: '#2a241d', fontWeight: 700, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{u.fullName || u.username}</div>
                              <div style={{ color: '#6b6259', fontSize: 12, marginTop: 2 }}>{u.username}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', background: u.role === 'admin' ? '#1d1b18' : '#b8944d', color: '#fffdfb', borderRadius: 999, padding: '5px 8px', fontWeight: 700 }}>
                                {u.role}
                              </span>
                              <button type="button" onClick={() => startEditingUser(u)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cdbd99', background: '#f3eadc', color: '#2a241d', fontWeight: 700, cursor: 'pointer' }}>
                                Edit
                              </button>
                              <button type="button" onClick={() => deleteUser(u.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ef4444', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>
                                Delete
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      {user.role === 'admin' && activeView === 'customers' && (
        <section style={{ background: '#fffdf9', border: '1px solid #d9c9a9', borderRadius: 16, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 18, borderBottom: '1px solid #e7dcc2', paddingBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 30 }}>Customers</h2>
            <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Register</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 20 }}>
            <form onSubmit={handleCreateCustomer} style={{ display: 'grid', gap: 14, background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Customer name
                <input
                  type="text"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                  placeholder="e.g. Grace Okafor"
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Phone number
                <input
                  type="tel"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                  placeholder="e.g. +234 812 345 6789"
                  required
                />
              </label>
              <button type="submit" style={{ marginTop: 6, background: 'linear-gradient(180deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdfb', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Save Customer
              </button>
            </form>

            <div style={{ background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: '0 0 14px', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 24 }}>Customer list</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {customers.length === 0 ? (
                  <li style={{ color: '#6b6259' }}>No customer registered yet.</li>
                ) : (
                  customers.map((customer) => (
                    <li key={customer.id} style={{ background: '#fffdfb', border: '1px solid #e0d0a9', borderRadius: 10, padding: '12px 14px', color: '#2d2924' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{customer.name}</div>
                      <div style={{ color: '#6b6259', fontSize: 12, marginTop: 2 }}>{customer.phone}</div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>
      )}

      {user.role === 'admin' && activeView === 'suppliers' && (
        <section style={{ background: '#fffdf9', border: '1px solid #d9c9a9', borderRadius: 16, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 18, borderBottom: '1px solid #e7dcc2', paddingBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 30 }}>Suppliers</h2>
            <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Register</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 20 }}>
            <form onSubmit={handleCreateSupplier} style={{ display: 'grid', gap: 14, background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Supplier name
                <input
                  type="text"
                  value={newSupplierForm.name}
                  onChange={(e) => setNewSupplierForm({ ...newSupplierForm, name: e.target.value })}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                  placeholder="e.g. Modern Textile Hub"
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                Phone number
                <input
                  type="tel"
                  value={newSupplierForm.phone}
                  onChange={(e) => setNewSupplierForm({ ...newSupplierForm, phone: e.target.value })}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #cdbd99', borderRadius: 10, background: '#fffdfb', color: '#1d1b18', fontSize: 14 }}
                  placeholder="e.g. +234 803 456 7890"
                  required
                />
              </label>
              <button type="submit" style={{ marginTop: 6, background: 'linear-gradient(180deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdfb', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Save Supplier
              </button>
            </form>

            <div style={{ background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: '0 0 14px', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 24 }}>Supplier list</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {suppliers.length === 0 ? (
                  <li style={{ color: '#6b6259' }}>No supplier registered yet.</li>
                ) : (
                  suppliers.map((supplier) => (
                    <li key={supplier.id} style={{ background: '#fffdfb', border: '1px solid #e0d0a9', borderRadius: 10, padding: '12px 14px', color: '#2d2924' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{supplier.name}</div>
                      <div style={{ color: '#6b6259', fontSize: 12, marginTop: 2 }}>{supplier.phone}</div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>
      )}
      {activeView === 'dashboard' && (
      <div style={{ display: 'grid', gap: 20 }}>
        <section style={{ background: 'linear-gradient(135deg, #fffdf9 0%, #f7f1e7 100%)', border: '1px solid #d9c9a9', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Inventory Alerts</div>
              <h2 style={{ margin: '6px 0 0', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 28 }}>Low stock watch</h2>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 999, background: lowStockProducts.length > 0 ? '#fef2f2' : '#f0fdf4', color: lowStockProducts.length > 0 ? '#b42318' : '#15803d', fontSize: 12, fontWeight: 700 }}>
              {lowStockProducts.length > 0 ? `${lowStockProducts.length} item${lowStockProducts.length === 1 ? '' : 's'} needs attention` : 'All stocked well'}
            </div>
          </div>
          {lowStockProducts.length === 0 ? (
            <div style={{ color: '#4b7d4b', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: 14 }}>All products have healthy stock levels.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {lowStockProducts.map((product) => (
                <div key={product.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #f0dbab', borderRadius: 12, padding: '12px 14px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1d1b18' }}>{product.name}</div>
                    <div style={{ color: '#6b6259', fontSize: 12, marginTop: 2 }}>{product.sku}</div>
                  </div>
                  <div style={{ color: '#b42318', fontWeight: 700 }}>{product.stock} left</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ background: '#fffdf9', border: '1px solid #d9c9a9', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Sales Dashboard</div>
              <h2 style={{ margin: '6px 0 0', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 28 }}>Performance overview</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#6b6259', gap: 4 }}>
                <span>From</span>
                <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 10px', minWidth: 140 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#6b6259', gap: 4 }}>
                <span>To</span>
                <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 10px', minWidth: 140 }} />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ background: 'linear-gradient(135deg, #1d1b18 0%, #342d22 100%)', color: '#fffdf9', borderRadius: 14, padding: 16, border: '1px solid #4a3f2c' }}>
              <div style={{ color: 'rgba(255,255,255,0.76)', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Revenue</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(salesSummary.totalRevenue)}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdf9', borderRadius: 14, padding: 16, border: '1px solid #9d7b37' }}>
              <div style={{ color: 'rgba(255,255,255,0.82)', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Profit</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(salesSummary.totalProfit)}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #f7f1e7 0%, #efe2c7 100%)', borderRadius: 14, padding: 16, border: '1px solid #e3d7be' }}>
              <div style={{ color: '#6b6259', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sales</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1d1b18' }}>{salesSummary.salesCount}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #f7f1e7 0%, #efe2c7 100%)', borderRadius: 14, padding: 16, border: '1px solid #e3d7be' }}>
              <div style={{ color: '#6b6259', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Items Sold</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1d1b18' }}>{salesSummary.totalItems}</div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <div style={{ background: '#fff', border: '1px solid #e3d7be', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 18, color: '#1d1b18' }}>Payment Methods</h3>
              {paymentMethodEntries.length === 0 ? (
                <div style={{ color: '#666' }}>No payment data yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {paymentMethodEntries.map(([method, count]) => (
                    <div key={method}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#433d36', fontSize: 13 }}>
                        <span>{method}</span>
                        <span style={{ fontWeight: 700 }}>{count} sale{count === 1 ? '' : 's'}</span>
                      </div>
                      <div style={{ height: 10, background: '#f0e6d3', borderRadius: 999 }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, (count / Math.max(1, salesSummary.salesCount)) * 100)}%`,
                            background: 'linear-gradient(90deg, #b8944d 0%, #8b6a2c 100%)',
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e3d7be', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 18, color: '#1d1b18' }}>Top Products</h3>
              {topProducts.length === 0 ? (
                <div style={{ color: '#666' }}>No product sales yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {topProducts.map(([name, quantity]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: '#f7f1e7' }}>
                      <span style={{ fontWeight: 700, color: '#1d1b18' }}>{name}</span>
                      <span style={{ color: '#8a6a2f', fontWeight: 700 }}>×{quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e3d7be', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, color: '#1d1b18' }}>Supplier activity</h3>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Procurement</div>
              </div>
              {purchaseOrderSummary.length === 0 && receivingSupplierSummary.length === 0 ? (
                <div style={{ color: '#666' }}>No supplier activity yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {[...purchaseOrderSummary, ...receivingSupplierSummary].slice(0, 5).map((entry, index) => (
                    <div key={`${entry.supplier}-${index}`} style={{ padding: '10px 12px', borderRadius: 10, background: '#f7f1e7' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#1d1b18' }}>{entry.supplier}</span>
                        <span style={{ fontWeight: 700, color: '#8a6a2f' }}>{formatMoney(entry.totalAmount || 0)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b6259', marginTop: 4 }}>
                        {entry.ordersCount ? `${entry.ordersCount} purchase order${entry.ordersCount === 1 ? '' : 's'}` : `${entry.receiptsCount || 0} receipt${entry.receiptsCount === 1 ? '' : 's'}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      )}
      {activeView === 'inventory' && (
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr' }}>
          <section style={{ background: '#fffdf9', border: '1px solid #dcc9a3', borderRadius: 16, padding: 22, boxShadow: '0 8px 20px rgba(27, 22, 18, 0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, borderBottom: '1px solid #e7dcc2', paddingBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 30, color: '#201d1a' }}>Inventory</h2>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Stock & receiving</div>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 18 }}>
              <div style={{ background: '#fff', border: '1px solid #e3d7be', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Low stock</div>
                <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, color: '#b42318' }}>{inventorySummary.lowStockCount}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e3d7be', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Out of stock</div>
                <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, color: '#111827' }}>{inventorySummary.outOfStockCount}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e3d7be', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Healthy stock</div>
                <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, color: '#15803d' }}>{inventorySummary.healthyCount}</div>
              </div>
            </div>

            <div style={{ marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#433d36', fontWeight: 600 }}>
                Search products:
                <input
                  type="text"
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  placeholder="Search by SKU or name"
                  style={{ padding: '10px 12px', minWidth: 220, borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#433d36', fontWeight: 600 }}>
                Sort by:
                <select value={productSort} onChange={(e) => setProductSort(e.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}>
                  <option value="name">Name</option>
                  <option value="price">Price</option>
                  <option value="stock">Stock</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {['all', 'low', 'out', 'in'].map((status) => {
                const labels = { all: 'All', low: 'Low stock', out: 'Out of stock', in: 'Healthy' };
                const selected = productStatusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setProductStatusFilter(status)}
                    style={{
                      borderRadius: 999,
                      border: selected ? '1px solid #8b6a2c' : '1px solid #d7c39a',
                      background: selected ? '#1d1b18' : '#fff',
                      color: selected ? '#fffdfb' : '#1d1b18',
                      padding: '8px 12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {labels[status]}
                  </button>
                );
              })}
            </div>

            {user.role === 'admin' && (
              <div style={{ marginBottom: 20, background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 24, color: '#1d1b18' }}>
                    {editingProductId ? 'Edit Product' : 'Add New Product'}
                  </h3>
                  {editingProductId && (
                    <button
                      type="button"
                      onClick={cancelEditProduct}
                      style={{ background: 'transparent', color: '#1d1b18', border: '1px solid #d7c39a', borderRadius: 999, padding: '8px 12px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <form onSubmit={saveProduct} style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                      Product name
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                      Category / SKU
                      <input
                        required
                        value={form.sku}
                        onChange={(e) => setForm({ ...form, sku: e.target.value })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                      Selling price
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                      Cost price
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={form.costPrice}
                        onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                      Stock
                      <input
                        required
                        type="number"
                        value={form.stock}
                        onChange={(e) => setForm({ ...form, stock: e.target.value })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                      />
                    </label>
                  </div>

                  {productFormMessage && (
                    <div style={{ color: '#b42318', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{productFormMessage}</div>
                  )}

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="submit"
                      style={{ background: '#1d1b18', color: '#fffdfb', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {editingProductId ? 'Update Product' : 'Save Product'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditProduct}
                      style={{ background: 'transparent', color: '#1d1b18', border: '1px solid #d7c39a', borderRadius: 999, padding: '10px 14px', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </div>
            )}

                    <div style={{ display: 'grid', gap: 20, marginBottom: 20 }}>
              <div style={{ background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 24, color: '#1d1b18' }}>Stock movement</h3>
                  <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Recent activity</div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {stockMovements.length === 0 ? (
                    <div style={{ color: '#6b6259' }}>No stock movements recorded yet.</div>
                  ) : (
                    stockMovements.map((movement) => (
                      <div key={movement.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: '#fffdfb', border: '1px solid #e3d7be' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1d1b18' }}>{movement.productName}</div>
                          <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{movement.note}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: movement.quantity > 0 ? '#15803d' : '#b42318' }}>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</div>
                          <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{new Date(movement.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ background: '#f7f1e7', border: '1px solid #e3d7be', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 24, color: '#1d1b18' }}>Receiving history</h3>
                  <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Supplier records</div>
                </div>
                <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleExportReceivingHistory}
                      style={{ background: '#1d1b18', color: '#fffdfb', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Export PDF
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    {receivingSupplierSummary.map((summary) => (
                      <div key={summary.supplier} style={{ padding: '10px 12px', borderRadius: 10, background: '#fffdfb', border: '1px solid #e3d7be' }}>
                        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>{summary.supplier}</div>
                        <div style={{ marginTop: 6, fontWeight: 700, color: '#1d1b18' }}>{formatMoney(summary.totalAmount)}</div>
                        <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{summary.receiptsCount} receipt{summary.receiptsCount === 1 ? '' : 's'} • {summary.totalItems} item{summary.totalItems === 1 ? '' : 's'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {receivingSpendTrend.map((entry) => (
                      <div key={entry.supplier}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#433d36', fontSize: 13 }}>
                          <span>{entry.supplier}</span>
                          <span style={{ fontWeight: 700 }}>{entry.share}%</span>
                        </div>
                        <div style={{ height: 10, background: '#efe7d7', borderRadius: 999 }}>
                          <div style={{ height: '100%', width: `${Math.max(8, entry.share)}%`, background: 'linear-gradient(90deg, #b8944d 0%, #8b6a2c 100%)', borderRadius: 999 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={receivingHistoryFilter}
                      onChange={(e) => setReceivingHistoryFilter(e.target.value)}
                      placeholder="Filter by supplier"
                      style={{ minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                    />
                    <input
                      type="date"
                      value={receivingHistoryStartDate}
                      onChange={(e) => setReceivingHistoryStartDate(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                    />
                    <input
                      type="date"
                      value={receivingHistoryEndDate}
                      onChange={(e) => setReceivingHistoryEndDate(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {filteredReceivingHistory.length === 0 ? (
                    <div style={{ color: '#6b6259' }}>No receiving history yet.</div>
                  ) : (
                    filteredReceivingHistory.map((entry) => {
                      const items = JSON.parse(entry.itemsJson || '[]');
                      return (
                        <div key={entry.id} style={{ padding: '12px 14px', borderRadius: 10, background: '#fffdfb', border: '1px solid #e3d7be' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1d1b18' }}>{entry.supplier}</div>
                              <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{entry.storeAccount}</div>
                            </div>
                            <div style={{ textAlign: 'right', color: '#6b6259', fontSize: 12 }}>
                              <div>{new Date(entry.date).toLocaleString()}</div>
                              <div style={{ marginTop: 2, fontWeight: 700, color: '#1d1b18' }}>{formatMoney(entry.totalAmount)}</div>
                            </div>
                          </div>
                          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                            {items.slice(0, 4).map((item) => (
                              <div key={`${entry.id}-${item.name}`} style={{ fontSize: 12, color: '#433d36' }}>
                                • {item.name} ×{item.quantity}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div style={{ overflow: 'hidden', border: '1px solid #e3d7be', borderRadius: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#efe2c8' }}>
                    <th style={{ textAlign: 'left', padding: '12px 14px', color: '#312d28', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ textAlign: 'left', padding: '12px 14px', color: '#312d28', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '12px 14px', color: '#312d28', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Price</th>
                    <th style={{ textAlign: 'left', padding: '12px 14px', color: '#312d28', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Stock</th>
                    <th style={{ textAlign: 'left', padding: '12px 14px', color: '#312d28', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProducts.map((product) => (
                    <tr key={product.id} style={{ background: product.stock <= 5 ? '#fff6ea' : '#fffdfb', borderTop: '1px solid #efe7d9' }}>
                      <td style={{ padding: '12px 14px', color: '#433d36' }}>{product.sku}</td>
                      <td style={{ padding: '12px 14px', color: '#1d1b18', fontWeight: 700 }}>{product.name}</td>
                      <td style={{ padding: '12px 14px', color: '#3b342f', fontWeight: 600 }}>{formatMoney(product.price)}</td>
                      <td style={{ padding: '12px 14px', color: '#3b342f' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{product.stock}</span>
                          {product.stock === 0 ? (
                            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: '#fef2f2', color: '#b42318', fontWeight: 700 }}>Out</span>
                          ) : product.stock <= lowStockThreshold ? (
                            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', fontWeight: 700 }}>Low</span>
                          ) : (
                            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: '#f0fdf4', color: '#15803d', fontWeight: 700 }}>OK</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => addToCart(product)} disabled={product.stock === 0} style={{ background: '#1d1b18', color: '#fffdfb', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: product.stock === 0 ? 'not-allowed' : 'pointer', opacity: product.stock === 0 ? 0.6 : 1 }}>
                            Add
                          </button>
                          {user.role === 'admin' && (
                            <>
                              {product.stock <= lowStockThreshold && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input
                                    type="number"
                                    min="1"
                                    value={reorderQuantity[product.id] || ''}
                                    onChange={(e) => setReorderQuantity((current) => ({ ...current, [product.id]: e.target.value }))}
                                    placeholder="Qty"
                                    style={{ width: 70, padding: '7px 8px', borderRadius: 8, border: '1px solid #d7c39a', color: '#1d1b18' }}
                                  />
                                  <button onClick={() => handleReorder(product)} style={{ background: '#e8f7ee', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
                                    Reorder
                                  </button>
                                </div>
                              )}
                              <button onClick={() => startEditProduct(product)} style={{ background: '#f3eadc', color: '#2d261f', border: '1px solid #d7c39a', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
                                Edit
                              </button>
                              <button onClick={() => deleteProduct(product.id)} style={{ background: '#f7dede', color: '#660000', border: '1px solid #e3b1b1', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </section>
        </div>
      )}

      {activeView === 'receiving' && (
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr', alignItems: 'start' }}>
          <section
            style={{
              background: '#fff',
              color: '#111827',
              padding: 24,
              borderRadius: 16,
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid #e5e7eb',
              fontFamily: 'Segoe UI, sans-serif',
            }}
          >
            <div style={{ marginTop: 18, background: 'linear-gradient(135deg, #fffdf9 0%, #f7f1e7 100%)', border: '1px solid #e3d7be', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Inventory Setup</div>
                  <h3 style={{ margin: '6px 0 0', fontSize: 24, color: '#1d1b18', fontFamily: 'Georgia, "Times New Roman", serif' }}>Register New Item</h3>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 999, background: '#fff', color: '#8a6a2f', border: '1px solid #e3d7be', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Product Details
                </div>
              </div>
              <form onSubmit={saveProduct} style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1.3fr 1fr', alignItems: 'start' }}>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                    Item name
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid #d9c9a9', background: '#fffdfb', color: '#1d1b18' }} placeholder="e.g. Premium Soap" />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                    Category / SKU
                    <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid #d9c9a9', background: '#fffdfb', color: '#1d1b18' }} placeholder="e.g. Household" />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                    Selling price
                    <input required type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid #d9c9a9', background: '#fffdfb', color: '#1d1b18' }} placeholder="0.00" />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                    Cost price
                    <input required type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid #d9c9a9', background: '#fffdfb', color: '#1d1b18' }} placeholder="0.00" />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                    Stock
                    <input required type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid #d9c9a9', background: '#fffdfb', color: '#1d1b18' }} placeholder="0" />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                  <button type="button" onClick={addReceivingItem} style={{ background: 'linear-gradient(135deg, #1d1b18 0%, #2c261f 100%)', color: '#fffdfb', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>
                    Add to Receipt
                  </button>
                  <button type="submit" style={{ background: 'linear-gradient(135deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdfb', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>
                    Save Item
                  </button>
                  <button type="button" onClick={() => { setEditingProductId(null); setForm({ sku: '', name: '', price: '', costPrice: '', stock: '' }); }} style={{ background: '#fff', color: '#1d1b18', border: '1px solid #d9c9a9', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                    Clear
                  </button>
                </div>
              </form>
            </div>

            <div style={{ marginTop: 24, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', maxWidth: 700 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                  Supplier account
                  <input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Supplier name"
                    list="supplier-options"
                    style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid #d9c9a9', background: '#fffdfb', color: '#1d1b18' }}
                  />
                  <datalist id="supplier-options">
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.name} />
                    ))}
                  </datalist>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36', fontWeight: 600 }}>
                  Store account
                  <input
                    value={storeAccount}
                    onChange={(e) => setStoreAccount(e.target.value)}
                    placeholder="Main Store"
                    style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid #d9c9a9', background: '#fffdfb', color: '#1d1b18' }}
                  />
                </label>
              </div>

              {receivingItems.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg, #fffdf7 0%, #f8efd9 100%)', border: '1px solid #e6d2a2', borderRadius: 18, padding: 18, boxShadow: '0 8px 18px rgba(17, 24, 39, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 20, color: '#1d1b18' }}>Receiving Receipt</h3>
                    <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700, padding: '6px 10px', borderRadius: 999, background: '#fff', border: '1px solid #e6d2a2' }}>Draft</div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '12px 14px', borderRadius: 12, background: '#fffdfb', border: '1px solid #e6d2a2' }}>
                    <div>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', fontWeight: 700 }}>Draft summary</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginTop: 4 }}>{receivingItems.length} item{receivingItems.length === 1 ? '' : 's'} • {receivingItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)} unit{receivingItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Expected total</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{formatMoney(receivingItems.reduce((sum, item) => sum + item.totalCost, 0))}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 4, marginBottom: 12, fontSize: 13, color: '#374151' }}>
                    <div><strong>Supplier:</strong> {supplierName || 'Supplier not specified'}</div>
                    <div><strong>Store Account:</strong> {storeAccount || 'Main Store'}</div>
                    <div><strong>Date:</strong> {new Date().toLocaleString()}</div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                    <thead>
                      <tr style={{ background: '#f3e0b5' }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: '#111827' }}>Item</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: '#111827' }}>SKU</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', color: '#111827' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', color: '#111827' }}>Unit Cost</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', color: '#111827' }}>Amount</th>
                        <th style={{ textAlign: 'center', padding: '10px 12px', color: '#111827' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivingItems.map((item) => (
                        <tr key={item.id} style={{ borderTop: '1px solid #f0dbab' }}>
                          <td style={{ padding: '10px 12px', color: '#111827' }}>{item.name}</td>
                          <td style={{ padding: '10px 12px', color: '#374151' }}>{item.sku}</td>
                          <td style={{ padding: '10px 12px', color: '#374151' }}>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateReceivingItem(item.id, 'quantity', e.target.value)}
                              style={{ width: 70, padding: '7px 8px', borderRadius: 8, border: '1px solid #d7c39a', color: '#111827', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px', color: '#374151' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateReceivingItem(item.id, 'unitCost', e.target.value)}
                              style={{ width: 90, padding: '7px 8px', borderRadius: 8, border: '1px solid #d7c39a', color: '#111827', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 12px', color: '#111827', fontWeight: 700 }}>{formatMoney(item.totalCost)}</td>
                          <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                            <button
                              type="button"
                              onClick={() => removeReceivingItem(item.id)}
                              style={{ background: '#f7dede', color: '#660000', border: '1px solid #e3b1b1', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffdfb', border: '1px solid #e6d2a2', borderRadius: 12, padding: '12px 14px' }}>
                    <strong style={{ color: '#1d1b18' }}>Total</strong>
                    <span style={{ color: '#1d1b18', fontSize: 22, fontWeight: 700 }}>{formatMoney(receivingItems.reduce((sum, item) => sum + item.totalCost, 0))}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                    <button type="button" onClick={completeReceiving} style={{ background: 'linear-gradient(135deg, #1d1b18 0%, #2c261f 100%)', color: '#fffdfb', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>
                      Complete Receiving
                    </button>
                    <button type="button" onClick={addPurchaseOrder} style={{ background: 'linear-gradient(135deg, #b8944d 0%, #8b6a2c 100%)', color: '#fffdfb', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>
                      Save Purchase Order
                    </button>
                    <button type="button" onClick={() => setReceivingItems([])} style={{ background: '#fff', color: '#1d1b18', border: '1px solid #d9c9a9', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                      Clear Receipt
                    </button>
                  </div>
                </div>
              )}

              {purchaseOrders.length > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>Purchase Orders</h3>
                    <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Draft summary</div>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {purchaseOrderSummary.map((entry) => (
                      <div key={entry.supplier} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{entry.supplier}</div>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{formatMoney(entry.totalAmount)}</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{entry.ordersCount} order{entry.ordersCount === 1 ? '' : 's'} • {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                          <span style={{ fontSize: 11, padding: '3px 7px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>Pending {entry.pendingCount}</span>
                          <span style={{ fontSize: 11, padding: '3px 7px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontWeight: 700 }}>Approved {entry.approvedCount}</span>
                          <span style={{ fontSize: 11, padding: '3px 7px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>Completed {entry.completedCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleExportPurchaseOrders}
                      style={{ background: '#1d1b18', color: '#fffdfb', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Export PDF
                    </button>
                    <input
                      type="text"
                      value={purchaseOrderSupplierFilter}
                      onChange={(e) => setPurchaseOrderSupplierFilter(e.target.value)}
                      placeholder="Search supplier"
                      style={{ minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}
                    />
                    <select
                      value={purchaseOrderStatusFilter}
                      onChange={(e) => setPurchaseOrderStatusFilter(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="completed">Completed</option>
                    </select>
                    <input
                      type="date"
                      value={purchaseOrderStartDate}
                      onChange={(e) => setPurchaseOrderStartDate(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}
                    />
                    <input
                      type="date"
                      value={purchaseOrderEndDate}
                      onChange={(e) => setPurchaseOrderEndDate(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}
                    />
                    <button
                      type="button"
                      onClick={clearPurchaseOrderFilters}
                      style={{ background: 'transparent', color: '#111827', border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontWeight: 700 }}
                    >
                      Clear filters
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {filteredPurchaseOrders.map((order) => {
                      const items = parsePurchaseOrderItems(order);
                      const timeline = buildPurchaseOrderTimeline(order);
                      const auditSummary = buildPurchaseOrderAuditSummary(order);
                      const relatedReceivingHistory = buildPurchaseOrderReceivingHistory(receivingHistory, order.id);
                      const progress = buildPurchaseOrderProgress(order, receivingHistory);
                      const supplierContact = buildSupplierContactSummary(suppliers, order?.supplier);
                      const supplierOrderHistory = buildSupplierOrderHistory(purchaseOrders, receivingHistory, order?.supplier);
                      const supplierPerformance = buildSupplierPerformanceSummary(purchaseOrders, receivingHistory, order?.supplier);
                      const isExpanded = selectedPurchaseOrderId === order.id;
                      return (
                        <div key={order.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedPurchaseOrderId(isExpanded ? null : order.id)}
                            style={{ width: '100%', textAlign: 'left', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#111827' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontWeight: 700 }}>{order.supplier || 'Supplier not specified'}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{new Date(order.createdAt || order.date).toLocaleString()}</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, textTransform: 'capitalize', background: order.status === 'completed' ? '#dcfce7' : order.status === 'approved' ? '#dbeafe' : '#fef3c7', color: order.status === 'completed' ? '#166534' : order.status === 'approved' ? '#1d4ed8' : '#92400e', fontWeight: 700 }}>
                                  {order.status || 'pending'}
                                </span>
                                <div style={{ fontWeight: 700 }}>{formatMoney(order.totalAmount || 0)}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#64748b' }}>
                              <span>Items: {auditSummary.itemsCount}</span>
                              <span>Last update: {auditSummary.lastUpdatedLabel}</span>
                              <span>Total: {formatMoney(auditSummary.totalAmount)}</span>
                            </div>
                            {supplierContact && (
                              <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                                {supplierContact.phone ? `Phone: ${supplierContact.phone}` : 'Supplier contact saved'}
                              </div>
                            )}
                          </button>
                          {isExpanded && (
                            <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 14px', display: 'grid', gap: 6 }}>
                              <div style={{ fontSize: 12, color: '#64748b' }}>Store account: {order.storeAccount || 'Main Store'}</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => updatePurchaseOrderStatus(order.id, 'approved')} style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>Approve</button>
                                <button type="button" onClick={() => updatePurchaseOrderStatus(order.id, 'completed')} style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>Complete</button>
                                {order.status === 'approved' && (
                                  <button type="button" onClick={() => handleReceivePurchaseOrder(order)} style={{ background: '#111827', color: '#fff', border: '1px solid #111827', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>Receive</button>
                                )}
                              </div>
                              {timeline.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {timeline.map((entry) => (
                                    <span key={`${order.id}-${entry.label}`} style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, background: entry.tone === 'completed' ? '#dcfce7' : entry.tone === 'approved' ? '#dbeafe' : '#f3f4f6', color: entry.tone === 'completed' ? '#166534' : entry.tone === 'approved' ? '#1d4ed8' : '#4b5563', fontWeight: 700 }}>
                                      {entry.label} • {new Date(entry.date).toLocaleString()}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Receive progress</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{progress.percent}%</span>
                                </div>
                                <div style={{ height: 8, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${progress.percent}%`, background: progress.isComplete ? '#166534' : '#2563eb', borderRadius: 999 }} />
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>{formatMoney(progress.receivedAmount)} received of {formatMoney(progress.orderedAmount)}</div>
                              </div>
                              {relatedReceivingHistory.length > 0 && (
                                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                  <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Receiving updates</div>
                                  {relatedReceivingHistory.slice(0, 3).map((entry) => (
                                    <div key={`${order.id}-${entry.id}`} style={{ padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 13, color: '#111827' }}>{new Date(entry.date).toLocaleString()}</span>
                                      <span style={{ fontWeight: 700, color: '#111827' }}>{formatMoney(entry.totalAmount || 0)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {supplierPerformance && (
                                <div style={{ display: 'grid', gap: 6, marginTop: 8, padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Supplier performance</div>
                                  <div style={{ fontSize: 13, color: '#111827' }}>Spend: {formatMoney(supplierPerformance.totalSpend)}</div>
                                  <div style={{ fontSize: 13, color: '#111827' }}>Orders: {supplierPerformance.orderCount} • Receipts: {supplierPerformance.receivingCount}</div>
                                  {supplierPerformance.lastActivityDate && (
                                    <div style={{ fontSize: 12, color: '#64748b' }}>Last activity: {new Date(supplierPerformance.lastActivityDate).toLocaleString()}</div>
                                  )}
                                </div>
                              )}
                              {supplierOrderHistory.length > 0 && (
                                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                  <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Supplier history</div>
                                  {supplierOrderHistory.map((entry) => (
                                    <div key={entry.id} style={{ padding: '8px 10px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 13, color: '#111827' }}>{entry.type === 'receiving' ? 'Receiving' : 'Purchase order'} • {new Date(entry.date).toLocaleString()}</span>
                                      <span style={{ fontWeight: 700, color: '#111827' }}>{formatMoney(entry.amount || 0)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {items.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#64748b' }}>No items recorded.</div>
                              ) : (
                                items.map((item, index) => (
                                  <div key={`${order.id}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: '#111827' }}>
                                    <span>{item.name} ×{item.quantity}</span>
                                    <span>{formatMoney((Number(item.totalCost) || 0) || (Number(item.unitCost) || 0) * (Number(item.quantity) || 0))}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </section>
        </div>
      )}

      {activeView === 'sales' && (
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1.1fr 0.9fr', alignItems: 'start' }}>
          <section style={{ background: '#fff', padding: 24, borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.04)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: '0', color: '#111827' }}>Quick sales</h2>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                Search item / scan barcode
                <input
                  ref={skuInputRef}
                  type="text"
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && scanBySku()}
                  style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #f3d7a0', fontSize: 14, background: '#fffdf7', boxShadow: 'inset 0 0 0 1px rgba(244, 183, 68, 0.2)' }}
                  placeholder="Type item name or scan SKU"
                />
              </label>
              <button type="button" onClick={scanBySku} style={{ width: 140, background: '#111827', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 12px', cursor: 'pointer', fontWeight: 700 }}>
                Add to cart
              </button>
            </div>

            <div style={{ marginBottom: 16, background: '#fffdf7', border: '1px solid #f1d499', borderRadius: 14, padding: 12 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700, marginBottom: 8 }}>Available items</div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {salesSearchResults.length === 0 ? (
                  <div style={{ color: '#7a6b58', padding: 8 }}>No item matches your search.</div>
                ) : (
                  salesSearchResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => { addToCart(product); setSkuInput(''); }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        background: '#fff',
                        border: '1px solid #f0dbab',
                        borderRadius: 10,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: '#111827',
                        width: '100%',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{product.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{product.sku}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: '#8a6a2f' }}>{formatMoney(product.price)}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
            {cart.length === 0 ? (
              <div style={{ padding: 16, background: '#fff7ed', borderRadius: 12, color: '#9a2c00' }}>No items in cart yet. Search and add products to begin checkout.</div>
            ) : (
              <div style={{ border: '1px solid #f3d7a0', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#fef3c7', borderBottom: '1px solid #f5e7c4' }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Cart</div>
                  <button type="button" onClick={clearCart} style={{ background: 'transparent', color: '#111827', border: '1px solid #d1d5db', borderRadius: 999, padding: '7px 10px', cursor: 'pointer', fontWeight: 700 }}>
                    Clear cart
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#fef3c7' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 12 }}>Item</th>
                      <th style={{ textAlign: 'center', padding: 12 }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: 12 }}>Subtotal</th>
                      <th style={{ textAlign: 'center', padding: 12 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.productId} style={{ borderTop: '1px solid #f5e7c4' }}>
                        <td style={{ padding: 12 }}>{item.name}</td>
                        <td style={{ textAlign: 'center', padding: 12 }}>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                            style={{ width: 60, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', padding: 12 }}>{formatMoney(item.price * item.quantity)}</td>
                        <td style={{ textAlign: 'center', padding: 12 }}>
                          <button type="button" onClick={() => removeCartItem(item.productId)} style={{ background: '#f7dede', color: '#660000', border: '1px solid #e3b1b1', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section style={{ background: '#fff', color: '#111827', padding: 24, borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.04)', border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 20 }}>Payment</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Payment method
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}>
                  <option>Cash</option>
                  <option>POS</option>
                </select>
              </label>
            </div>
            <div style={{ marginBottom: 14, display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Discount
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}>
                  <option value="none">No discount</option>
                  <option value="amount">Fixed amount</option>
                  <option value="percent">Percent</option>
                </select>
              </label>
              {discountType !== 'none' && (
                <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                  {discountType === 'percent' ? 'Percent (%)' : 'Amount'}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}
                    placeholder={discountType === 'percent' ? '10' : '20.00'}
                  />
                </label>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Tender amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tenderAmount}
                  onChange={(e) => setTenderAmount(e.target.value)}
                  style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#111827' }}
                  placeholder="0.00"
                />
              </label>
            </div>
            {paymentMethod === 'Cash' && (
              <div style={{ background: '#f9fafb', padding: 12, borderRadius: 12, marginBottom: 16, border: '1px solid #e5e7eb' }}>
                Change: {formatMoney((parseFloat(tenderAmount) || 0) - total)}
              </div>
            )}
            <div style={{ background: '#f9fafb', padding: 14, borderRadius: 14, marginBottom: 16, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginBottom: 6 }}>
                <span>Subtotal</span>
                <strong>{formatMoney(saleTotals.subtotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280', marginBottom: 6 }}>
                <span>Discount</span>
                <span>{formatMoney(saleTotals.discountAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                <span>Total</span>
                <strong>{formatMoney(total)}</strong>
              </div>
            </div>
            <div style={{ marginBottom: 16, background: '#fffdf7', border: '1px solid #f1d499', borderRadius: 14, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Checkout review</strong>
                <button type="button" onClick={() => setShowCheckoutReview((current) => !current)} style={{ background: 'transparent', border: 'none', color: '#8a6a2f', cursor: 'pointer', fontWeight: 700 }}>
                  {showCheckoutReview ? 'Hide' : 'Preview'}
                </button>
              </div>
              {showCheckoutReview && (
                <div style={{ display: 'grid', gap: 6, fontSize: 13, color: '#433d36' }}>
                  {cart.map((item) => (
                    <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{item.quantity} × {item.name}</span>
                      <span>{formatMoney((Number(item.price) || 0) * (Number(item.quantity) || 0))}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #f0dbab', paddingTop: 6, marginTop: 2, fontWeight: 700 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Payable</span>
                      <span>{formatMoney(total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={placeSale} disabled={cart.length === 0} style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>
                Complete Sale
              </button>
              <button type="button" onClick={() => skuInputRef.current?.focus()} style={{ background: 'transparent', color: '#111827', border: '1px solid #d1d5db', borderRadius: 999, padding: '10px 14px', cursor: 'pointer' }}>
                Focus Scanner
              </button>
              {receipt && (
                <button onClick={() => printReceipt(receipt)} type="button" style={{ background: 'transparent', color: '#111827', border: '1px solid #d1d5db', borderRadius: 999, padding: '10px 14px', cursor: 'pointer' }}>
                  Print Receipt
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {activeView === 'reports' && (
        <section style={{ marginTop: 24, background: 'linear-gradient(135deg, #fffdf9 0%, #f8efe2 100%)', border: '1px solid #e0cfa2', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Sales History</div>
              <h2 style={{ margin: '6px 0 0', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 28 }}>Sales reports</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b6259' }}>
                <span>From</span>
                <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 10px', minWidth: 140 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b6259' }}>
                <span>To</span>
                <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 10px', minWidth: 140 }} />
              </label>
              <button type="button" onClick={() => { setReportStartDate(''); setReportEndDate(''); }} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 12px', background: '#fffdf9', color: '#6b6259', cursor: 'pointer' }}>
                Reset
              </button>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => setShowSalesHistory((current) => !current)} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 12px', background: '#fffdf9', color: '#8a6a2f', cursor: 'pointer', fontWeight: 700 }}>
                  {showSalesHistory ? 'Hide Sales History' : 'Show Sales History'}
                </button>
                <button type="button" onClick={handleExportReport} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 12px', background: '#fffdf9', color: '#8a6a2f', cursor: 'pointer', fontWeight: 700 }}>
                  Export PDF
                </button>
                <div style={{ padding: '8px 12px', borderRadius: 999, background: '#fdf7e8', border: '1px solid #edd7a8', color: '#8a6a2f', fontWeight: 700, fontSize: 13 }}>
                  {filteredReportSales.length} transaction{filteredReportSales.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </div>

          {filteredReportSales.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 18, color: '#6b6259' }}>No sales yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 6 }}>Revenue</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1d1b18' }}>{formatMoney(salesSummary.totalRevenue)}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 6 }}>Net profit</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1d1b18' }}>{formatMoney(salesSummary.totalProfit)}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 6 }}>Items sold</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1d1b18' }}>{salesSummary.totalItems}</div>
                </div>
              </div>

              {Object.entries(salesSummary.paymentMethods).length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 8 }}>Payment methods</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(salesSummary.paymentMethods).map(([method, count]) => (
                      <span key={method} style={{ padding: '6px 10px', borderRadius: 999, background: '#f5efe2', color: '#8a6a2f', fontSize: 12, fontWeight: 700 }}>
                        {method}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {topProducts.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 8 }}>Top products</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {topProducts.map(([name, quantity]) => (
                      <span key={name} style={{ padding: '6px 10px', borderRadius: 999, background: '#e8f7ee', color: '#15803d', fontSize: 12, fontWeight: 700 }}>
                        {name} ×{quantity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {showSalesHistory && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 8 }}>Stock movement</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {stockMovements.length === 0 ? (
                        <div style={{ color: '#6b6259' }}>No stock movements recorded yet.</div>
                      ) : (
                        stockMovements.map((movement) => (
                          <div key={movement.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: '#fcf8f0', border: '1px solid #efe1c1' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1d1b18' }}>{movement.productName}</div>
                              <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{movement.note}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: movement.quantity > 0 ? '#15803d' : '#b42318' }}>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</div>
                              <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{new Date(movement.createdAt).toLocaleString()}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 8 }}>Receiving history</div>
                    <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleExportReceivingHistory}
                          style={{ background: '#1d1b18', color: '#fffdfb', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Export PDF
                        </button>
                      </div>
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        {receivingSupplierSummary.map((summary) => (
                          <div key={summary.supplier} style={{ padding: '10px 12px', borderRadius: 10, background: '#fcf8f0', border: '1px solid #efe1c1' }}>
                            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>{summary.supplier}</div>
                            <div style={{ marginTop: 6, fontWeight: 700, color: '#1d1b18' }}>{formatMoney(summary.totalAmount)}</div>
                            <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{summary.receiptsCount} receipt{summary.receiptsCount === 1 ? '' : 's'} • {summary.totalItems} item{summary.totalItems === 1 ? '' : 's'}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={receivingHistoryFilter}
                          onChange={(e) => setReceivingHistoryFilter(e.target.value)}
                          placeholder="Filter by supplier"
                          style={{ minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                        />
                        <input
                          type="date"
                          value={receivingHistoryStartDate}
                          onChange={(e) => setReceivingHistoryStartDate(e.target.value)}
                          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                        />
                        <input
                          type="date"
                          value={receivingHistoryEndDate}
                          onChange={(e) => setReceivingHistoryEndDate(e.target.value)}
                          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d7c39a', background: '#fff', color: '#1d1b18' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {filteredReceivingHistory.length === 0 ? (
                        <div style={{ color: '#6b6259' }}>No receiving history yet.</div>
                      ) : (
                        filteredReceivingHistory.map((entry) => {
                          const items = JSON.parse(entry.itemsJson || '[]');
                          return (
                            <div key={entry.id} style={{ padding: '12px 14px', borderRadius: 10, background: '#fffdfb', border: '1px solid #e3d7be' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#1d1b18' }}>{entry.supplier}</div>
                                  <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{entry.storeAccount}</div>
                                </div>
                                <div style={{ textAlign: 'right', color: '#6b6259', fontSize: 12 }}>
                                  <div>{new Date(entry.date).toLocaleString()}</div>
                                  <div style={{ marginTop: 2, fontWeight: 700, color: '#1d1b18' }}>{formatMoney(entry.totalAmount)}</div>
                                </div>
                              </div>
                              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                                {items.slice(0, 4).map((item) => (
                                  <div key={`${entry.id}-${item.name}`} style={{ fontSize: 12, color: '#433d36' }}>
                                    • {item.name} ×{item.quantity}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {cashierPerformance.length > 0 && (
                    <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 14 }}>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 8 }}>Cashier performance</div>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {cashierPerformance.map((staff) => (
                          <div key={staff.cashierName} style={{ padding: 12, borderRadius: 12, border: '1px solid #efe1c1', background: '#fcf8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontWeight: 700, color: '#1d1b18' }}>{staff.cashierName}</div>
                                <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{staff.salesCount} sale{staff.salesCount === 1 ? '' : 's'}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ padding: '6px 10px', borderRadius: 999, background: '#f5efe2', color: '#8a6a2f', fontSize: 12, fontWeight: 700 }}>Revenue {formatMoney(staff.totalRevenue)}</span>
                                <span style={{ padding: '6px 10px', borderRadius: 999, background: '#e8f7ee', color: '#15803d', fontSize: 12, fontWeight: 700 }}>Profit {formatMoney(staff.totalProfit)}</span>
                              </div>
                            </div>
                            {staff.topProducts.length > 0 && (
                              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {staff.topProducts.map((product) => (
                                  <span key={`${staff.cashierName}-${product.name}`} style={{ padding: '6px 10px', borderRadius: 999, background: '#fff', border: '1px solid #e3d7be', color: '#433d36', fontSize: 12, fontWeight: 700 }}>
                                    {product.name} ×{product.quantity}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div style={{ marginTop: 10, borderTop: '1px solid #e9ddc0', paddingTop: 10 }}>
                              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 8 }}>Sales history</div>
                              <div style={{ display: 'grid', gap: 8 }}>
                                {staff.salesHistory.map((sale) => (
                                  <div key={`${staff.cashierName}-${sale.id}`} style={{ background: '#fff', border: '1px solid #e9ddc0', borderRadius: 10, padding: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                      <div style={{ fontWeight: 700, color: '#1d1b18' }}>{new Date(sale.datetime).toLocaleString()}</div>
                                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ padding: '4px 8px', borderRadius: 999, background: '#f5efe2', color: '#8a6a2f', fontSize: 11, fontWeight: 700 }}>{sale.paymentMethod}</span>
                                        <span style={{ padding: '4px 8px', borderRadius: 999, background: '#e8f7ee', color: '#15803d', fontSize: 11, fontWeight: 700 }}>Profit {formatMoney(sale.profit)}</span>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, color: '#433d36' }}>
                                      <span>Total sale {formatMoney(sale.total)}</span>
                                      <span>{(sale.items || []).reduce((count, item) => count + (Number(item.quantity) || 0), 0)} item{(sale.items || []).reduce((count, item) => count + (Number(item.quantity) || 0), 0) === 1 ? '' : 's'}</span>
                                    </div>
                                    {(sale.items || []).length > 0 && (
                                      <ul style={{ margin: '8px 0 0 16px', padding: 0, display: 'grid', gap: 4 }}>
                                        {(sale.items || []).map((item) => (
                                          <li key={`${staff.cashierName}-${sale.id}-${item.name}`} style={{ color: '#6b6259', fontSize: 12 }}>
                                            {item.quantity} × {item.name}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredReportSales.map((sale) => {
                    const actualProfit = calculateActualProfit(sale);
                    return (
                      <div key={sale.id} style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 4 }}>Sale</div>
                            <div style={{ fontWeight: 700, color: '#1d1b18' }}>{new Date(sale.datetime).toLocaleString()}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ padding: '6px 10px', borderRadius: 999, background: '#f5efe2', color: '#8a6a2f', fontSize: 12, fontWeight: 700 }}>{sale.paymentMethod}</span>
                            <span style={{ padding: '6px 10px', borderRadius: 999, background: '#e8f7ee', color: '#15803d', fontSize: 12, fontWeight: 700 }}>Profit {formatMoney(actualProfit)}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #efe1c1', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ color: '#6b6259', fontSize: 14 }}>Total sale</div>
                          <div style={{ color: '#111827', fontSize: 20, fontWeight: 700 }}>{formatMoney(sale.total)}</div>
                        </div>

                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f', marginBottom: 8 }}>Items</div>
                          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
                            {sale.items.map((item) => {
                              const itemProfit = ((Number(item.price) || 0) - (Number(item.costPrice) || 0)) * (Number(item.quantity) || 0);
                              return (
                                <li key={item.id} style={{ color: '#433d36' }}>
                                  <span style={{ fontWeight: 700 }}>{item.quantity} × {item.name}</span>
                                  <span style={{ color: '#8a6a2f' }}> • {formatMoney(itemProfit)} profit</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeView === 'supplierReports' && (
        <section style={{ marginTop: 24, background: 'linear-gradient(135deg, #fffdf9 0%, #f8efe2 100%)', border: '1px solid #e0cfa2', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a6a2f', fontWeight: 700 }}>Procurement</div>
              <h2 style={{ margin: '6px 0 0', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1d1b18', fontSize: 28 }}>Supplier reports</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b6259' }}>
                <span>Supplier</span>
                <input type="text" value={supplierReportSupplierFilter} onChange={(e) => setSupplierReportSupplierFilter(e.target.value)} placeholder="Search supplier" style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 10px', minWidth: 180 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b6259' }}>
                <span>From</span>
                <input type="date" value={supplierReportStartDate} onChange={(e) => setSupplierReportStartDate(e.target.value)} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 10px', minWidth: 140 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b6259' }}>
                <span>To</span>
                <input type="date" value={supplierReportEndDate} onChange={(e) => setSupplierReportEndDate(e.target.value)} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 10px', minWidth: 140 }} />
              </label>
              <button type="button" onClick={() => { setSupplierReportSupplierFilter(''); setSupplierReportStartDate(''); setSupplierReportEndDate(''); }} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 12px', background: '#fffdf9', color: '#6b6259', cursor: 'pointer' }}>
                Reset
              </button>
              <button type="button" onClick={handleExportSupplierReport} style={{ border: '1px solid #d9c9a9', borderRadius: 8, padding: '8px 12px', background: '#fffdf9', color: '#8a6a2f', cursor: 'pointer', fontWeight: 700 }}>
                Export PDF
              </button>
            </div>
          </div>

          {supplierReportSummary.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 18, color: '#6b6259' }}>No supplier activity yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {supplierReportSummary.map((entry) => (
                <div key={entry.supplier} style={{ background: '#fff', border: '1px solid #e8d9b5', borderRadius: 16, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1d1b18' }}>{entry.supplier}</div>
                      <div style={{ fontSize: 12, color: '#6b6259', marginTop: 4 }}>Purchase orders and receiving activity</div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#8a6a2f' }}>{formatMoney(entry.purchaseOrderAmount + entry.receivingAmount)}</div>
                  </div>
                  <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div style={{ padding: '10px 12px', borderRadius: 12, background: '#f7f1e7' }}>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f' }}>Purchase orders</div>
                      <div style={{ fontWeight: 700, color: '#1d1b18', marginTop: 4 }}>{entry.purchaseOrderCount} order{entry.purchaseOrderCount === 1 ? '' : 's'}</div>
                      <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{formatMoney(entry.purchaseOrderAmount)}</div>
                    </div>
                    <div style={{ padding: '10px 12px', borderRadius: 12, background: '#f7f1e7' }}>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a6a2f' }}>Receiving</div>
                      <div style={{ fontWeight: 700, color: '#1d1b18', marginTop: 4 }}>{entry.receivingCount} receipt{entry.receivingCount === 1 ? '' : 's'}</div>
                      <div style={{ fontSize: 12, color: '#6b6259', marginTop: 2 }}>{formatMoney(entry.receivingAmount)} • {entry.receivingItems} item{entry.receivingItems === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      </div>
    </div>

    {receipt && (
      <div className="receipt-print" style={{ display: 'none' }}>
        <section style={{ marginTop: 20, background: '#fff', color: '#111', padding: 18, border: '1px solid #e7dcc2', borderRadius: 16, boxShadow: '0 10px 24px rgba(17, 19, 24, 0.05)', display: 'flex', flexDirection: 'column', minHeight: 320 }}>
          <div style={{ textAlign: 'center', borderBottom: '1px solid #111', paddingBottom: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{settings.shopName}</div>
          </div>

          <div style={{ display: 'grid', gap: 4, fontSize: 11, marginBottom: 10 }}>
            <div>Receipt #: {receipt.saleId}</div>
            <div>Date: {new Date(receipt.datetime).toLocaleString()}</div>
            <div>Cashier: {user?.username || 'Unknown'}</div>
            <div>Payment: {receipt.paymentMethod || 'Cash'}</div>
          </div>

          <div style={{ borderTop: '1px solid #111', marginBottom: 8 }} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #111' }}>
                <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 700 }}>Item</th>
                <th style={{ textAlign: 'center', padding: '6px 0', fontWeight: 700 }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700 }}>Price</th>
                <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700 }}>Amt</th>
              </tr>
            </thead>
            <tbody>
              {(receipt.items || []).map((item) => (
                <tr key={item.productId || `${item.name}-${item.quantity}`}>
                  <td style={{ padding: '5px 0', verticalAlign: 'top' }}>{item.name}</td>
                  <td style={{ textAlign: 'center', padding: '5px 0' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right', padding: '5px 0' }}>{formatMoney(item.price)}</td>
                  <td style={{ textAlign: 'right', padding: '5px 0' }}>{formatMoney((Number(item.price) || 0) * (Number(item.quantity) || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ borderTop: '1px dashed #111', marginTop: 10, paddingTop: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Subtotal</span>
              <span>{formatMoney((receipt.items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0))}</span>
            </div>
            {receipt.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Discount</span>
                <span>{formatMoney(receipt.discountAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 4 }}>
              <span>Total</span>
              <span>{formatMoney(receipt.total)}</span>
            </div>
            {receipt.tender >= 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Tender</span>
                <span>{formatMoney(receipt.tender)}</span>
              </div>
            )}
            {receipt.change >= 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Change</span>
                <span>{formatMoney(receipt.change)}</span>
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto', textAlign: 'center', borderTop: '1px dashed #111', paddingTop: 10, fontSize: 10, color: '#555' }}>
            <div>{settings.receiptFooter || 'Thank you for shopping with us!'}</div>
            <div style={{ marginTop: 6, whiteSpace: 'pre-line' }}>SHOP NO 7 & 8 UPSTAIRS LAYIN JALLABA GIDAN IDI BAGWANJE @ KANTIN KWARI MARKET KANO STATE NIGERIA.</div>
            <div style={{ marginTop: 6 }}>CUSTOMER SERVICE NO :- 09048054904 08091212946</div>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

export default App;
