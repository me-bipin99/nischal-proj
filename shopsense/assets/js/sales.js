/**
 * ShopSense Sales Module
 * - Fuzzy product search with dropdown
 * - Multi-item cart with qty controls
 * - Checkout: sequential POST per cart item
 * - Bill modal with line items + Done button
 * - Sales history table with real-time refresh
 */

let productsList = [];   // full product catalogue from API
let salesData    = [];   // sales history rows

// cart is an array of { product, qty } objects
let cart = [];

// ── Bootstrap modal reference (set after DOM ready) ───────────────────────
let billModalInstance = null;

// ── Entry point ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  productsList = await ShopSense.fetchData(ShopSense.KEYS.PRODUCTS, '/api/products') || [];

  initProductSearch();
  initCheckout();
  updateCartUI();

  await loadSales();

  // Re-render table when currency changes
  window.addEventListener('currencychange', () => renderSalesTable());
});

// ── Sales history ─────────────────────────────────────────────────────────
async function loadSales() {
  const json = await ShopSense.fetchData(ShopSense.KEYS.SALES, '/api/sales?page=1&pageSize=50');
  salesData = json ? json.sales : [];
  renderSalesTable();
}

function renderSalesTable() {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  if (salesData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">
      <i class="bi bi-receipt fs-2 d-block mb-2 text-secondary"></i>No sales transactions yet.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = salesData.map(s => `
    <tr>
      <td class="fw-semibold text-primary">${s.invoiceNo || s.id}</td>
      <td>
        <div class="fw-medium text-dark">${s.productName}</div>
        <small class="text-muted">Qty: ${s.quantity} @ <span data-price-usd="${s.unitPrice}">${ShopSense.formatCurrency(s.unitPrice)}</span></small>
      </td>
      <td class="fw-bold text-dark" data-price-usd="${s.totalAmount}">${ShopSense.formatCurrency(s.totalAmount)}</td>
      <td>${s.customerName || '—'}</td>
      <td><span class="badge bg-light text-dark border">${s.paymentMethod}</span></td>
      <td class="text-muted small">${ShopSense.formatSaleDateTime(s.date, s.time)}</td>
      <td><span class="badge badge-soft-success">${s.status}</span></td>
    </tr>
  `).join('');
}

// ── Fuzzy search helpers ──────────────────────────────────────────────────

/**
 * Simple fuzzy match: returns a score > 0 if all characters of `needle`
 * appear in order within `haystack`, with bonus for consecutive runs and
 * prefix matches.  Returns 0 for no match.
 */
function fuzzyScore(needle, haystack) {
  needle    = needle.toLowerCase().trim();
  haystack  = haystack.toLowerCase();
  if (!needle) return 1;
  if (haystack.includes(needle)) return 100 + (haystack.startsWith(needle) ? 50 : 0);

  let score = 0, hi = 0, consecutive = 0;
  for (let ni = 0; ni < needle.length; ni++) {
    let found = false;
    for (; hi < haystack.length; hi++) {
      if (haystack[hi] === needle[ni]) {
        score += 1 + consecutive;
        consecutive++;
        hi++;
        found = true;
        break;
      } else {
        consecutive = 0;
      }
    }
    if (!found) return 0;
  }
  return score;
}

function searchProducts(query) {
  if (!query.trim()) return productsList.slice(0, 8);
  return productsList
    .map(p => ({
      product: p,
      score: Math.max(
        fuzzyScore(query, p.name),
        fuzzyScore(query, p.sku),
        fuzzyScore(query, p.category)
      )
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(r => r.product);
}

// ── Product search UI ─────────────────────────────────────────────────────
function initProductSearch() {
  const input    = document.getElementById('product-search-input');
  const dropdown = document.getElementById('product-search-dropdown');
  if (!input || !dropdown) return;

  let activeIdx = -1;

  function renderDropdown(results) {
    if (results.length === 0) {
      dropdown.innerHTML = `<div class="product-search-empty">No products found</div>`;
      dropdown.style.display = 'block';
      return;
    }
    dropdown.innerHTML = results.map((p, i) => {
      const inCart   = cart.find(c => c.product.id === p.id);
      const outStock = p.stock === 0;
      return `
        <div class="product-search-item ${outStock ? 'disabled' : ''} ${inCart ? 'in-cart' : ''}"
             data-idx="${i}" tabindex="-1">
          <div class="d-flex align-items-center justify-content-between gap-2 w-100">
            <div class="overflow-hidden">
              <div class="fw-semibold text-dark text-truncate">${p.name}</div>
              <div class="text-muted small">${p.sku} · ${ShopSense.formatCurrency(p.unitPrice)}</div>
            </div>
            <div class="text-end flex-shrink-0">
              ${outStock
                ? `<span class="badge badge-soft-danger">Out of Stock</span>`
                : inCart
                  ? `<span class="badge badge-soft-primary">In Cart</span>`
                  : `<span class="badge bg-light text-muted border">Stock: ${p.stock}</span>`}
            </div>
          </div>
        </div>
      `;
    }).join('');
    dropdown.style.display = 'block';
    activeIdx = -1;
    // Store results for keyboard nav
    dropdown._results = results;
  }

  function hideDropdown() {
    dropdown.style.display = 'none';
    dropdown._results = [];
    activeIdx = -1;
  }

  function selectProduct(product) {
    if (product.stock === 0) return;
    addToCart(product);
    input.value = '';
    hideDropdown();
    input.focus();
  }

  // Show top 8 on focus
  input.addEventListener('focus', () => {
    renderDropdown(searchProducts(input.value));
  });

  input.addEventListener('input', () => {
    renderDropdown(searchProducts(input.value));
  });

  // Click a dropdown item
  dropdown.addEventListener('mousedown', e => {
    const item = e.target.closest('.product-search-item');
    if (!item || item.classList.contains('disabled')) return;
    e.preventDefault();
    const idx = parseInt(item.getAttribute('data-idx'));
    const results = dropdown._results || [];
    if (results[idx]) selectProduct(results[idx]);
  });

  // Keyboard nav: arrows + enter + escape
  input.addEventListener('keydown', e => {
    const results = dropdown._results || [];
    if (dropdown.style.display === 'none' || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, results.length - 1);
      highlightItem(activeIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
      highlightItem(activeIdx);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) selectProduct(results[activeIdx]);
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  function highlightItem(idx) {
    dropdown.querySelectorAll('.product-search-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', e => {
    if (!document.getElementById('product-search-wrapper')?.contains(e.target)) {
      hideDropdown();
    }
  });
}

// ── Cart management ───────────────────────────────────────────────────────
function addToCart(product) {
  const existing = cart.find(c => c.product.id === product.id);
  if (existing) {
    if (existing.qty < product.stock) existing.qty++;
  } else {
    cart.push({ product, qty: 1 });
  }
  updateCartUI();
}

function removeFromCart(productId) {
  cart = cart.filter(c => c.product.id !== productId);
  updateCartUI();
}

function setCartQty(productId, qty) {
  const item = cart.find(c => c.product.id === productId);
  if (!item) return;
  qty = Math.max(1, Math.min(qty, item.product.stock));
  item.qty = qty;
  updateCartUI();
}

function cartTotal() {
  return cart.reduce((sum, c) => sum + c.product.unitPrice * c.qty, 0);
}

function updateCartUI() {
  const section    = document.getElementById('cart-section');
  const listElem   = document.getElementById('cart-items-list');
  const totalElem  = document.getElementById('sale-total-display');
  const checkoutBtn = document.getElementById('checkout-btn');

  if (!listElem) return;

  const hasItems = cart.length > 0;
  if (section) section.style.display = hasItems ? 'block' : 'none';

  if (hasItems) {
    listElem.innerHTML = cart.map(({ product, qty }) => `
      <div class="cart-item" data-product-id="${product.id}">
        <div class="cart-item-info">
          <div class="fw-semibold text-dark text-truncate">${product.name}</div>
          <div class="text-muted small">
            ${ShopSense.formatCurrency(product.unitPrice)} each
            <span class="ms-1 ${qty >= product.stock ? 'text-danger fw-semibold' : 'text-muted'}">
              · ${product.stock} in stock${qty >= product.stock ? ' (max)' : ''}
            </span>
          </div>
        </div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn" data-action="dec" data-id="${product.id}" ${qty <= 1 ? 'disabled' : ''}>
            <i class="bi bi-dash"></i>
          </button>
          <input
            type="number"
            class="cart-qty-input ${qty >= product.stock ? 'at-stock-limit' : ''}"
            value="${qty}"
            min="1"
            max="${product.stock}"
            data-id="${product.id}"
            data-max="${product.stock}"
          >
          <button class="cart-qty-btn" data-action="inc" data-id="${product.id}" ${qty >= product.stock ? 'disabled' : ''}>
            <i class="bi bi-plus"></i>
          </button>
          <button class="cart-remove-btn" data-id="${product.id}" title="Remove">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="cart-item-subtotal" data-price-usd="${product.unitPrice * qty}">
          ${ShopSense.formatCurrency(product.unitPrice * qty)}
        </div>
      </div>
    `).join('');

    // Bind cart controls
    listElem.querySelectorAll('.cart-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id     = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const item   = cart.find(c => c.product.id === id);
        if (!item) return;
        setCartQty(id, action === 'inc' ? item.qty + 1 : item.qty - 1);
      });
    });

    listElem.querySelectorAll('.cart-qty-input').forEach(inp => {
      // Clamp on every keystroke so you can never type beyond stock
      inp.addEventListener('input', () => {
        const max = parseInt(inp.getAttribute('data-max')) || 1;
        let val = parseInt(inp.value) || 1;
        if (val > max) {
          val = max;
          inp.value = max;
          ShopSense.showToast('Stock Limit', `Only ${max} unit${max === 1 ? '' : 's'} available.`, 'warning');
        }
        if (val < 1) val = 1;
        setCartQty(inp.getAttribute('data-id'), val);
      });
      inp.addEventListener('change', () => {
        const max = parseInt(inp.getAttribute('data-max')) || 1;
        const val = Math.max(1, Math.min(parseInt(inp.value) || 1, max));
        inp.value = val;
        setCartQty(inp.getAttribute('data-id'), val);
      });
    });

    listElem.querySelectorAll('.cart-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => removeFromCart(btn.getAttribute('data-id')));
    });
  }

  const total = cartTotal();
  if (totalElem) {
    totalElem.setAttribute('data-price-usd', total);
    totalElem.textContent = ShopSense.formatCurrency(total);
  }

  if (checkoutBtn) checkoutBtn.disabled = !hasItems;

  // Clear button
  const clearBtn = document.getElementById('cart-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => { cart = []; updateCartUI(); };
  }
}

// ── Checkout ──────────────────────────────────────────────────────────────
function initCheckout() {
  const checkoutBtn = document.getElementById('checkout-btn');
  if (!checkoutBtn) return;

  checkoutBtn.addEventListener('click', async () => {
    if (cart.length === 0) return;

    const customerName  = (document.getElementById('sale-customer')?.value.trim()) || 'Walk-in Customer';
    const paymentMethod = document.getElementById('sale-payment')?.value || 'Cash';

    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing…';

    const receipts = [];
    const errors   = [];

    // POST each cart item sequentially
    for (const { product, qty } of cart) {
      try {
        const resp = await ShopSense.apiFetch('/api/sales', {
          method: 'POST',
          body: JSON.stringify({
            productId:     product.id,
            quantity:      qty,
            customerName,
            paymentMethod
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || `Failed for ${product.name}`);
        receipts.push(data);
      } catch (err) {
        errors.push(`${product.name}: ${err.message}`);
      }
    }

    checkoutBtn.innerHTML = '<i class="bi bi-receipt me-1"></i> Checkout & View Bill';
    checkoutBtn.disabled  = false;

    if (errors.length > 0 && receipts.length === 0) {
      ShopSense.showToast('Checkout Failed', errors[0], 'danger');
      return;
    }

    // Partial success
    if (errors.length > 0) {
      ShopSense.showToast('Partial Success', `${receipts.length} item(s) recorded. Errors: ${errors.join('; ')}`, 'warning');
    }

    // Show bill modal for all successful receipts
    showBillModal(receipts, customerName, paymentMethod);

    // Reset cart
    cart = [];
    updateCartUI();
    if (document.getElementById('sale-customer')) document.getElementById('sale-customer').value = '';

    // Re-fetch products (stock updated) and sales table
    productsList = await ShopSense.fetchData(ShopSense.KEYS.PRODUCTS, '/api/products') || [];
    await loadSales();
  });
}

// ── Bill modal ────────────────────────────────────────────────────────────
function showBillModal(receipts, customerName, paymentMethod) {
  if (receipts.length === 0) return;

  const now       = new Date();
  const dateStr   = now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const invoiceNos = receipts.map(r => r.invoiceNo).join(', ');
  const grandTotal = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

  // Populate modal fields
  const meta = document.getElementById('bill-invoice-meta');
  if (meta) meta.textContent = receipts.length === 1
    ? `Invoice: ${receipts[0].invoiceNo}`
    : `Invoices: ${invoiceNos}`;

  const custElem = document.getElementById('bill-customer-name');
  if (custElem) custElem.textContent = customerName;

  const dtElem = document.getElementById('bill-datetime');
  if (dtElem) dtElem.textContent = dateStr;

  const payElem = document.getElementById('bill-payment-method');
  if (payElem) payElem.textContent = paymentMethod;

  // Line items
  const itemsList = document.getElementById('bill-items-list');
  if (itemsList) {
    itemsList.innerHTML = receipts.map(r => `
      <div class="bill-line-item">
        <div class="bill-line-name">${r.productName || '—'}</div>
        <div class="bill-line-meta text-muted small">
          ${r.quantity} × ${ShopSense.formatCurrency(r.unitPrice)}
        </div>
        <div class="bill-line-total fw-semibold" data-price-usd="${r.totalAmount}">
          ${ShopSense.formatCurrency(r.totalAmount)}
        </div>
      </div>
    `).join('');
  }

  const totalElem = document.getElementById('bill-total');
  if (totalElem) {
    totalElem.setAttribute('data-price-usd', grandTotal);
    totalElem.textContent = ShopSense.formatCurrency(grandTotal);
  }

  // Show modal
  const modalEl = document.getElementById('bill-modal');
  if (!modalEl) return;
  if (!billModalInstance) billModalInstance = new bootstrap.Modal(modalEl);
  billModalInstance.show();

  // Done button closes modal
  const doneBtn = document.getElementById('bill-done-btn');
  if (doneBtn) {
    // Remove old listener each time to avoid stacking
    const newDone = doneBtn.cloneNode(true);
    doneBtn.parentNode.replaceChild(newDone, doneBtn);
    newDone.addEventListener('click', () => billModalInstance.hide());
  }
}
