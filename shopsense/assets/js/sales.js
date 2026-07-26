/**
 * ShopSense Sales JavaScript Module
 * Handles Recording Sales, Sales Log Table, Live Price Calculation & Toast Feedback
 */

let salesData = [];
let productsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  productsList = await ShopSense.fetchData(ShopSense.KEYS.PRODUCTS, '/api/products') || [];

  initSalesForm();
  await loadSales();
});

async function loadSales() {
  const salesJson = await ShopSense.fetchData(ShopSense.KEYS.SALES, '/api/sales?page=1&pageSize=50');
  salesData = salesJson ? salesJson.sales : [];
  renderSalesTable();
}

function initSalesForm() {
  const productSelect = document.getElementById('sale-product-select');
  const qtyInput = document.getElementById('sale-qty');
  const priceInput = document.getElementById('sale-unit-price');
  const totalElem = document.getElementById('sale-total-display');
  const form = document.getElementById('record-sale-form');

  if (productSelect && productsList.length > 0) {
    productSelect.innerHTML = `<option value="">-- Select Product --</option>` +
      productsList.map(p => `<option value="${p.id}" data-price="${p.unitPrice}" data-name="${p.name}">${p.name} (${p.sku}) - Stock: ${p.stock}</option>`).join('');

    productSelect.addEventListener('change', () => {
      const selectedOpt = productSelect.options[productSelect.selectedIndex];
      const price = selectedOpt.getAttribute('data-price') || '0';
      if (priceInput) priceInput.value = price;
      calculateTotal();
    });
  } else if (productSelect) {
    productSelect.innerHTML = `<option value="">No products available</option>`;
  }

  if (qtyInput) {
    qtyInput.addEventListener('input', calculateTotal);
  }

  function calculateTotal() {
    const qty = parseInt(qtyInput ? qtyInput.value : 1) || 0;
    const price = parseFloat(priceInput ? priceInput.value : 0) || 0;
    const total = qty * price;
    if (totalElem) totalElem.textContent = ShopSense.formatCurrency(total);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const productId = productSelect.value;
      const qty = parseInt(qtyInput.value) || 1;
      const customerName = document.getElementById('sale-customer').value.trim() || 'Walk-in Customer';
      const paymentMethod = document.getElementById('sale-payment').value || 'Credit Card';

      if (!productId) {
        ShopSense.showToast('Validation Error', 'Please select a product to record sale.', 'danger');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await ShopSense.apiFetch('/api/sales', {
          method: 'POST',
          body: JSON.stringify({ productId, quantity: qty, customerName, paymentMethod })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Failed to record sale.');
        }

        // Re-fetch both sales and products so stock levels reflect the deduction server-side
        productsList = await ShopSense.fetchData(ShopSense.KEYS.PRODUCTS, '/api/products') || [];
        initSalesForm();
        await loadSales();

        form.reset();
        calculateTotal();

        ShopSense.showToast('Sale Recorded', `Invoice #${data.invoiceNo} for ${ShopSense.formatCurrency(data.totalAmount)} created!`, 'success');
      } catch (error) {
        ShopSense.showToast('Sale Failed', error.message || 'Could not record sale.', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

function renderSalesTable() {
  const tableBody = document.getElementById('sales-table-body');
  if (!tableBody) return;

  if (salesData.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No sales transactions logged yet.</td></tr>`;
    return;
  }

  tableBody.innerHTML = salesData.map(s => `
    <tr>
      <td class="fw-semibold text-primary">${s.invoiceNo || s.id}</td>
      <td>
        <div class="fw-medium text-dark">${s.productName}</div>
        <small class="text-muted">Qty: ${s.quantity} @ ${ShopSense.formatCurrency(s.unitPrice)}</small>
      </td>
      <td class="fw-bold text-dark">${ShopSense.formatCurrency(s.totalAmount)}</td>
      <td>${s.customerName}</td>
      <td><span class="badge bg-light text-dark border">${s.paymentMethod}</span></td>
      <td><span class="badge bg-secondary-subtle text-secondary">${s.week || ''}</span></td>
      <td class="text-muted small">${ShopSense.formatSaleDateTime(s.date, s.time)}</td>
      <td><span class="badge badge-soft-success">${s.status}</span></td>
    </tr>
  `).join('');
}
