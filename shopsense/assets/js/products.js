/**
 * ShopSense Products Module
 * Handles Product Listing, Search, Filter, Pagination, Add/Edit & Delete Actions
 */

let productsList = [];
let currentPage = 1;
let itemsPerPage = 10;
let filteredProducts = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  // Initialize List View
  if (document.getElementById('products-table-body')) {
    await loadProducts();
    initProductsPage();

    // Re-render the table when the user switches currency so all displayed
    // prices update instantly without a page reload.
    window.addEventListener('currencychange', () => renderProductsTable());
  }

  // Initialize Add Product Form
  if (document.getElementById('add-product-form')) {
    initAddProductForm();
  }

  // Initialize Edit Product Form
  if (document.getElementById('edit-product-form') || document.getElementById('edit-loading')) {
    initEditProductForm();
  }
});

async function loadProducts() {
  productsList = await ShopSense.fetchData(ShopSense.KEYS.PRODUCTS, '/api/products') || [];
  filteredProducts = [...productsList];
}

function initProductsPage() {
  renderProductsTable();
  setupFilterAndSearch();
}

function setupFilterAndSearch() {
  const searchInput = document.getElementById('product-search');
  const categoryFilter = document.getElementById('category-filter');
  const statusFilter = document.getElementById('status-filter');
  const sortSelect = document.getElementById('sort-select');

  function applyFilters() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const category = categoryFilter ? categoryFilter.value : 'all';
    const status = statusFilter ? statusFilter.value : 'all';
    const sortBy = sortSelect ? sortSelect.value : 'name-asc';

    filteredProducts = productsList.filter(prod => {
      const matchesSearch = prod.name.toLowerCase().includes(searchTerm) ||
                            prod.sku.toLowerCase().includes(searchTerm) ||
                            prod.category.toLowerCase().includes(searchTerm);
      const matchesCategory = category === 'all' || prod.category === category;
      const matchesStatus = status === 'all' || prod.status === status;
      return matchesSearch && matchesCategory && matchesStatus;
    });

    // Sort logic
    if (sortBy === 'name-asc') {
      filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name-desc') {
      filteredProducts.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === 'stock-low') {
      filteredProducts.sort((a, b) => a.stock - b.stock);
    } else if (sortBy === 'stock-high') {
      filteredProducts.sort((a, b) => b.stock - a.stock);
    } else if (sortBy === 'price-high') {
      filteredProducts.sort((a, b) => b.unitPrice - a.unitPrice);
    } else if (sortBy === 'price-low') {
      filteredProducts.sort((a, b) => a.unitPrice - b.unitPrice);
    }

    currentPage = 1;
    renderProductsTable();
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);
  if (sortSelect) sortSelect.addEventListener('change', applyFilters);
}

function renderProductsTable() {
  const tableBody = document.getElementById('products-table-body');
  const paginationElem = document.getElementById('products-pagination');
  const recordInfoElem = document.getElementById('products-count-info');

  if (!tableBody) return;

  if (filteredProducts.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5">
          <div class="text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-2 text-secondary"></i>
            <h6 class="fw-semibold">No products found</h6>
            <p class="small mb-0">Try adjusting your search filters or add a new product.</p>
          </div>
        </td>
      </tr>
    `;
    if (recordInfoElem) recordInfoElem.textContent = 'Showing 0 products';
    if (paginationElem) paginationElem.innerHTML = '';
    return;
  }

  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filteredProducts.slice(startIdx, endIdx);

  tableBody.innerHTML = pageItems.map(p => {
    let statusBadgeClass = 'badge-soft-success';
    if (p.status === 'Low Stock') statusBadgeClass = 'badge-soft-warning';
    if (p.status === 'Out of Stock') statusBadgeClass = 'badge-soft-danger';

    return `
      <tr>
        <td>
          <img src="${p.image}" alt="${p.name}" class="rounded-3 shadow-sm" width="44" height="44" style="object-fit: cover;">
        </td>
        <td>
          <div class="fw-semibold text-dark">${p.name}</div>
          <small class="text-muted">${p.supplier || 'Standard Supplier'}</small>
        </td>
        <td><code class="text-muted fs-7">${p.sku}</code></td>
        <td><span class="badge bg-light text-dark border">${p.category}</span></td>
        <td>
          <span class="fw-bold ${p.stock <= p.reorderLevel ? 'text-danger' : 'text-dark'}">${p.stock}</span>
          <small class="text-muted">/ ${p.reorderLevel} min</small>
        </td>
        <td>${p.unit}</td>
        <td class="fw-semibold" data-price-usd="${p.unitPrice}">${ShopSense.formatCurrency(p.unitPrice)}</td>
        <td><span class="badge ${statusBadgeClass}">${p.status}</span></td>
        <td>
          <div class="dropdown">
            <button class="btn btn-sm btn-light border-0" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm rounded-3">
              <li><a class="dropdown-item d-flex align-items-center gap-2 view-product-btn" href="#" data-id="${p.id}"><i class="bi bi-eye"></i> View Details</a></li>
              <li><a class="dropdown-item d-flex align-items-center gap-2" href="/pages/edit-product.html?id=${p.id}"><i class="bi bi-pencil"></i> Edit Product</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item d-flex align-items-center gap-2 text-danger delete-product-btn" href="#" data-id="${p.id}"><i class="bi bi-trash"></i> Delete</a></li>
            </ul>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (recordInfoElem) {
    recordInfoElem.textContent = `Showing ${startIdx + 1} to ${Math.min(endIdx, filteredProducts.length)} of ${filteredProducts.length} products`;
  }

  // Render Pagination Buttons
  if (paginationElem) {
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    let navHtml = `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a></li>`;

    for (let i = 1; i <= totalPages; i++) {
      navHtml += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    }

    navHtml += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}">Next</a></li>`;
    paginationElem.innerHTML = navHtml;

    paginationElem.querySelectorAll('.page-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const p = parseInt(link.getAttribute('data-page'));
        if (p >= 1 && p <= totalPages) {
          currentPage = p;
          renderProductsTable();
        }
      });
    });
  }

  // Bind View & Delete Action Listeners
  document.querySelectorAll('.view-product-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      showProductDetailsModal(id);
    });
  });

  document.querySelectorAll('.delete-product-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      deleteProduct(id);
    });
  });
}

// Show Product Details Modal
function showProductDetailsModal(productId) {
  const prod = productsList.find(p => p.id === productId);
  if (!prod) return;

  const modalHtml = `
    <div class="modal fade" id="productDetailModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-bottom">
            <h5 class="modal-title fw-bold">Product Details</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4">
            <div class="d-flex align-items-center gap-3 mb-4">
              <img src="${prod.image}" alt="${prod.name}" class="rounded-3 shadow-sm" width="80" height="80" style="object-fit: cover;">
              <div>
                <h6 class="fw-bold mb-1 fs-5">${prod.name}</h6>
                <div class="text-muted small">SKU: <code>${prod.sku}</code></div>
                <span class="badge bg-primary-subtle text-primary mt-1">${prod.category}</span>
              </div>
            </div>
            <div class="row g-3">
              <div class="col-6">
                <div class="p-3 bg-light rounded-3">
                  <div class="text-muted small">Unit Selling Price</div>
                  <div class="fw-bold fs-5 text-dark" data-price-usd="${prod.unitPrice}">${ShopSense.formatCurrency(prod.unitPrice)}</div>
                </div>
              </div>
              <div class="col-6">
                <div class="p-3 bg-light rounded-3">
                  <div class="text-muted small">Unit Cost Price</div>
                  <div class="fw-bold fs-5 text-dark" data-price-usd="${prod.costPrice}">${ShopSense.formatCurrency(prod.costPrice)}</div>
                </div>
              </div>
              <div class="col-6">
                <div class="p-3 bg-light rounded-3">
                  <div class="text-muted small">Current Stock Level</div>
                  <div class="fw-bold fs-5 text-dark">${prod.stock} ${prod.unit}</div>
                </div>
              </div>
              <div class="col-6">
                <div class="p-3 bg-light rounded-3">
                  <div class="text-muted small">Reorder Threshold</div>
                  <div class="fw-bold fs-5 text-dark">${prod.reorderLevel} ${prod.unit}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer border-top">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Close</button>
            <a href="/pages/edit-product.html?id=${prod.id}" class="btn btn-primary">Edit Product</a>
          </div>
        </div>
      </div>
    </div>
  `;

  let existingModal = document.getElementById('productDetailModal');
  if (existingModal) existingModal.remove();

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const bsModal = new window.bootstrap.Modal(document.getElementById('productDetailModal'));
  bsModal.show();
}

// Delete Product Handler
async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product?')) return;

  try {
    const response = await ShopSense.apiFetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || 'Failed to delete product.');
    }

    await loadProducts();
    renderProductsTable();
    ShopSense.showToast('Product Deleted', 'The product has been removed from inventory.', 'danger');
  } catch (error) {
    ShopSense.showToast('Delete Failed', error.message || 'Could not delete product.', 'danger');
  }
}

// Add Product Form Handler
function initAddProductForm() {
  const form = document.getElementById('add-product-form');
  const imgInput = document.getElementById('prod-image');
  const imgPreview = document.getElementById('prod-img-preview');

  if (imgInput && imgPreview) {
    imgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          imgPreview.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const stockVal = parseInt(document.getElementById('prod-stock').value) || 0;
      const payload = {
        name: document.getElementById('prod-name').value.trim(),
        sku: document.getElementById('prod-sku').value.trim(),
        category: document.getElementById('prod-category').value,
        stock: stockVal,
        unit: document.getElementById('prod-unit').value,
        unitPrice: parseFloat(document.getElementById('prod-price').value) || 0,
        costPrice: parseFloat(document.getElementById('prod-cost').value) || 0,
        reorderLevel: parseInt(document.getElementById('prod-reorder').value) || 10,
        image: imgPreview ? imgPreview.src : 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=200&q=80',
        supplier: document.getElementById('prod-supplier').value.trim() || 'General Supplier'
      };

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await ShopSense.apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Failed to add product.');
        }

        ShopSense.showToast('Product Added', `${data.name} has been added successfully!`, 'success');
        setTimeout(() => {
          window.location.href = '/pages/products.html';
        }, 800);
      } catch (error) {
        ShopSense.showToast('Add Failed', error.message || 'Could not add product.', 'danger');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

// Edit Product Form Handler
async function initEditProductForm() {
  const urlParams   = new URLSearchParams(window.location.search);
  const productId   = urlParams.get('id');
  const loadingElem = document.getElementById('edit-loading');
  const notFoundElem = document.getElementById('edit-not-found');
  const formElem    = document.getElementById('edit-product-form');

  if (!productId) {
    if (loadingElem)  loadingElem.style.display  = 'none';
    if (notFoundElem) notFoundElem.style.display = '';
    return;
  }

  // Fetch this product directly from the API so we always have fresh data.
  // Falls back to the already-loaded productsList if the direct fetch fails
  // (e.g. navigated here from the products table which already has the data).
  let prod = null;
  console.log('[EditProduct] productId from URL:', productId);
  console.log('[EditProduct] token present:', !!localStorage.getItem('shopsense_auth_token'));
  try {
    const resp = await ShopSense.apiFetch(`/api/products/${productId}`);
    console.log('[EditProduct] fetch status:', resp.status);
    if (resp.ok) {
      prod = await resp.json();
      console.log('[EditProduct] prod loaded:', prod?.name);
    } else if (resp.status !== 401) {
      const body = await resp.text().catch(() => '');
      console.error(`[EditProduct] fetch failed: HTTP ${resp.status}`, body);
    }
  } catch (err) {
    console.warn('[EditProduct] fetch threw:', err?.message);
  }

  // Fallback: check productsList (populated if user came from products.html)
  if (!prod && productsList.length > 0) {
    prod = productsList.find(p => p.id === productId) || null;
    if (prod) console.log('[EditProduct] found in productsList cache');
  }

  // Last resort: fetch the full list and search within it
  if (!prod) {
    console.log('[EditProduct] trying full list fallback');
    try {
      const allProds = await ShopSense.fetchData(ShopSense.KEYS.PRODUCTS, '/api/products') || [];
      prod = allProds.find(p => p.id === productId) || null;
      if (prod) console.log('[EditProduct] found via full list');
    } catch (err) {
      console.error('[EditProduct] full list fallback failed:', err?.message);
    }
  }

  console.log('[EditProduct] final prod:', prod ? prod.name : 'NULL — will show not-found');

  if (loadingElem) loadingElem.style.display = 'none';

  if (!prod) {
    if (notFoundElem) notFoundElem.style.display = '';
    return;
  }

  // Show form, update breadcrumb
  if (formElem) formElem.style.display = '';
  const titleElem = document.getElementById('edit-page-title');
  if (titleElem) titleElem.textContent = `Edit: ${prod.name}`;
  const crumbElem = document.getElementById('edit-breadcrumb');
  if (crumbElem) crumbElem.textContent = prod.name;

  // ── Populate all fields ──────────────────────────────────────────────────
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };

  set('prod-name',     prod.name);
  set('prod-sku',      prod.sku);
  set('prod-category', prod.category);
  set('prod-supplier', prod.supplier || '');
  set('prod-price',    prod.unitPrice);
  set('prod-cost',     prod.costPrice || '');
  set('prod-stock',    prod.stock);
  set('prod-unit',     prod.unit);
  set('prod-reorder',  prod.reorderLevel);

  // Image preview
  const preview = document.getElementById('prod-img-preview');
  if (preview && prod.image) preview.src = prod.image;

  // Image URL field
  const urlInput = document.getElementById('prod-image-url');
  if (urlInput && prod.image) urlInput.value = prod.image;

  // Sync unit label on stock input group
  syncUnitLabel();

  // Initial margin calculation
  updateMargin();

  // ── Image: file upload ───────────────────────────────────────────────────
  const fileInput = document.getElementById('prod-image');
  if (fileInput && preview) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        preview.src = evt.target.result;
        if (urlInput) urlInput.value = ''; // clear URL field when file chosen
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Image: URL input ─────────────────────────────────────────────────────
  if (urlInput && preview) {
    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      if (url) {
        preview.src = url;
        if (fileInput) fileInput.value = ''; // clear file input when URL typed
      }
    });
  }

  // ── Image overlay hover effect ───────────────────────────────────────────
  const overlay = preview?.parentElement?.querySelector('.prod-img-overlay');
  const overlayIcon = overlay?.querySelector('.prod-img-overlay-icon');
  if (overlay && overlayIcon) {
    overlay.addEventListener('mouseenter', () => {
      overlay.style.background = 'rgba(0,0,0,0.45)';
      overlayIcon.style.opacity = '1';
    });
    overlay.addEventListener('mouseleave', () => {
      overlay.style.background = 'rgba(0,0,0,0)';
      overlayIcon.style.opacity = '0';
    });
  }

  // ── Unit label sync ──────────────────────────────────────────────────────
  const unitSelect = document.getElementById('prod-unit');
  if (unitSelect) unitSelect.addEventListener('change', syncUnitLabel);

  function syncUnitLabel() {
    const label = document.getElementById('prod-unit-label');
    if (label && unitSelect) label.textContent = unitSelect.value || 'pcs';
  }

  // ── Live margin calculator ───────────────────────────────────────────────
  const priceInput = document.getElementById('prod-price');
  const costInput  = document.getElementById('prod-cost');
  const stockInput = document.getElementById('prod-stock');

  if (priceInput) priceInput.addEventListener('input', updateMargin);
  if (costInput)  costInput.addEventListener('input',  updateMargin);
  if (stockInput) stockInput.addEventListener('input',  updateMargin);

  function updateMargin() {
    const price = parseFloat(document.getElementById('prod-price')?.value) || 0;
    const cost  = parseFloat(document.getElementById('prod-cost')?.value)  || 0;
    const stock = parseInt(document.getElementById('prod-stock')?.value)   || 0;

    const marginPct   = document.getElementById('margin-value');
    const profitUnit  = document.getElementById('profit-per-unit');
    const stockVal    = document.getElementById('stock-value-preview');

    if (!marginPct) return;

    if (price > 0 && cost > 0) {
      const pct   = ((price - cost) / price) * 100;
      const profit = price - cost;
      marginPct.textContent  = pct.toFixed(1) + '%';
      marginPct.className    = `fw-bold ${pct >= 20 ? 'text-success' : pct >= 0 ? 'text-warning' : 'text-danger'}`;
      if (profitUnit) profitUnit.textContent = ShopSense.formatCurrency(profit);
    } else {
      marginPct.textContent = '—';
      marginPct.className   = 'fw-bold text-muted';
      if (profitUnit) profitUnit.textContent = '—';
    }

    if (stockVal) {
      stockVal.textContent = price > 0 && stock > 0
        ? ShopSense.formatCurrency(price * stock)
        : '—';
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  if (formElem) {
    formElem.addEventListener('submit', async e => {
      e.preventDefault();

      // Resolve image: file upload wins over URL field, URL wins over original
      let imageValue = prod.image; // default: keep existing
      const fileInput = document.getElementById('prod-image');
      const urlInput  = document.getElementById('prod-image-url');
      const previewEl = document.getElementById('prod-img-preview');

      if (fileInput?.files?.[0] && previewEl?.src?.startsWith('data:')) {
        // File was picked — use the base64 data URI
        imageValue = previewEl.src;
      } else if (urlInput?.value.trim()) {
        imageValue = urlInput.value.trim();
      }

      const payload = {
        name:         document.getElementById('prod-name')?.value.trim(),
        sku:          document.getElementById('prod-sku')?.value.trim(),
        category:     document.getElementById('prod-category')?.value.trim(),
        supplier:     document.getElementById('prod-supplier')?.value.trim() || undefined,
        unitPrice:    parseFloat(document.getElementById('prod-price')?.value)  || 0,
        costPrice:    parseFloat(document.getElementById('prod-cost')?.value)   || 0,
        stock:        parseInt(document.getElementById('prod-stock')?.value)    || 0,
        unit:         document.getElementById('prod-unit')?.value,
        reorderLevel: parseInt(document.getElementById('prod-reorder')?.value)  || 0,
        image:        imageValue,
      };

      const submitBtn = document.getElementById('edit-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving…';
      }

      try {
        const resp = await ShopSense.apiFetch(`/api/products/${productId}`, {
          method: 'PUT',
          body:   JSON.stringify(payload)
        });
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) throw new Error(data.error || 'Failed to update product.');

        ShopSense.showToast('Product Updated', `${data.name} saved successfully.`, 'success');
        setTimeout(() => { window.location.href = '/pages/products.html'; }, 800);
      } catch (err) {
        ShopSense.showToast('Save Failed', err.message || 'Could not save changes.', 'danger');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-save me-1"></i> Save Changes';
        }
      }
    });
  }
}
