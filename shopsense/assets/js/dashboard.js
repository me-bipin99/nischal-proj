/**
 * ShopSense Dashboard JavaScript Module
 * Handles Dashboard Analytics, Prediction Chart, Inventory Metrics & Recent Sales
 */

// Small fixed palette used to render category cards derived from live
// product data (the API does not expose a dedicated category-breakdown
// endpoint, so this is computed client-side from /api/products).
const CATEGORY_CARD_STYLE = [
  { icon: 'bi-cup-straw', badgeColor: 'primary' },
  { icon: 'bi-headphones', badgeColor: 'info' },
  { icon: 'bi-box-seam', badgeColor: 'success' },
  { icon: 'bi-heart-pulse', badgeColor: 'warning' },
  { icon: 'bi-house-heart', badgeColor: 'secondary' }
];

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  const summary = await ShopSense.fetchData(ShopSense.KEYS.DASHBOARD, '/api/dashboard/summary');
  if (!summary) return;

  renderDashboardKPIs(summary);
  renderInventoryStatusChart(summary);
  initPredictionChart();
  initQuickActions();

  // Category performance and recent sales aren't served by a dedicated
  // dashboard endpoint, so they are derived from live /api/products and
  // /api/sales calls.
  loadCategoryCards();
  loadRecentSales();
});

// Render Top Summary KPI Cards
function renderDashboardKPIs(summary) {
  if (!summary) return;

  const todaysSalesElem = document.getElementById('kpi-todays-sales');
  const totalRevenueElem = document.getElementById('kpi-total-revenue');
  const totalProductsElem = document.getElementById('kpi-total-products');
  const lowStockElem = document.getElementById('kpi-low-stock');
  const predictionSummaryElem = document.getElementById('kpi-prediction-summary');

  if (todaysSalesElem) todaysSalesElem.textContent = ShopSense.formatCurrency(summary.todaysSales);
  if (totalRevenueElem) totalRevenueElem.textContent = ShopSense.formatCurrency(summary.totalRevenue);
  if (totalProductsElem) totalProductsElem.textContent = summary.totalProducts;
  if (lowStockElem) lowStockElem.textContent = summary.lowStockCount;

  if (predictionSummaryElem && summary.predictionSummary) {
    predictionSummaryElem.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-1">
        <span class="text-muted small">7-Day Demand Projection</span>
        <span class="badge bg-primary-subtle text-primary fw-semibold">${summary.predictionSummary.projectedDemand7Days} Units</span>
      </div>
      <div class="fw-bold fs-5 text-dark">${ShopSense.formatCurrency(summary.predictionSummary.projectedRevenue7Days)}</div>
      <div class="text-muted small mt-1">
        <i class="bi bi-graph-up text-success me-1"></i> Top: <strong>${summary.predictionSummary.topTrendingCategory}</strong>
      </div>
    `;
  }
}

// Render Prediction Line Chart with Dropdown Range Selection
let predictionChartInstance = null;

async function loadPredictionRange(range) {
  return ShopSense.fetchData(ShopSense.KEYS.DASHBOARD, `/api/dashboard/prediction?range=${encodeURIComponent(range)}`);
}

function initPredictionChart() {
  const canvas = document.getElementById('predictionChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  async function updateChart(rangeKey) {
    const tf = await loadPredictionRange(rangeKey);

    if (predictionChartInstance) {
      predictionChartInstance.destroy();
      predictionChartInstance = null;
    }

    if (!tf || tf.insufficientData) {
      const parent = canvas.parentElement;
      if (parent) {
        parent.querySelectorAll('.prediction-empty-state').forEach(el => el.remove());
        const emptyState = document.createElement('div');
        emptyState.className = 'prediction-empty-state text-center text-muted py-5';
        emptyState.innerHTML = '<i class="bi bi-graph-up fs-1 d-block mb-2 text-secondary"></i>Not enough sales history yet to generate a forecast.';
        parent.appendChild(emptyState);
      }
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = '';
    const parent = canvas.parentElement;
    if (parent) parent.querySelectorAll('.prediction-empty-state').forEach(el => el.remove());

    predictionChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: tf.labels,
        datasets: [
          {
            label: 'Actual Sales ($)',
            data: tf.actualSales,
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#2563EB'
          },
          {
            label: 'AI Forecasted Sales ($)',
            data: tf.predictedSales,
            borderColor: '#8B5CF6',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: '#8B5CF6'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              font: { family: 'Poppins', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 12,
            titleFont: { family: 'Poppins', size: 13 },
            bodyFont: { family: 'Poppins', size: 12 },
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: $${context.raw || 0}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Poppins', size: 11 }, color: '#64748B' }
          },
          y: {
            grid: { color: '#F1F5F9' },
            ticks: {
              font: { family: 'Poppins', size: 11 },
              color: '#64748B',
              callback: value => '$' + value
            }
          }
        }
      }
    });
  }

  // Initial load
  updateChart('7days');

  // Range selector event
  const dropdown = document.getElementById('prediction-range-select');
  if (dropdown) {
    dropdown.addEventListener('change', (e) => {
      updateChart(e.target.value);
    });
  }
}

// Render Inventory Status Donut Chart, derived from dashboard summary counts
function renderInventoryStatusChart(summary) {
  const canvas = document.getElementById('inventoryStatusChart');
  if (!canvas || !summary) return;

  const outOfStock = summary.outOfStockCount || 0;
  const lowStock = summary.lowStockCount || 0;
  const inStock = Math.max(0, (summary.totalProducts || 0) - lowStock - outOfStock);

  const ctx = canvas.getContext('2d');

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['In Stock', 'Low Stock', 'Out of Stock'],
      datasets: [{
        data: [inStock, lowStock, outOfStock],
        backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, font: { family: 'Poppins', size: 12 } }
        }
      }
    }
  });
}

// Derive Category Performance Cards from live product data
async function loadCategoryCards() {
  const container = document.getElementById('category-cards-container');
  if (!container) return;

  const products = await ShopSense.fetchData(ShopSense.KEYS.PRODUCTS, '/api/products') || [];

  const byCategory = new Map();
  products.forEach(p => {
    if (!byCategory.has(p.category)) {
      byCategory.set(p.category, { name: p.category, itemCount: 0, healthyCount: 0, stockValue: 0 });
    }
    const entry = byCategory.get(p.category);
    entry.itemCount += 1;
    entry.stockValue += (p.stock || 0) * (p.unitPrice || 0);
    if (p.status === 'In Stock') entry.healthyCount += 1;
  });

  const categories = Array.from(byCategory.values()).map((cat, idx) => ({
    ...cat,
    stockHealthPercentage: cat.itemCount ? Math.round((cat.healthyCount / cat.itemCount) * 100) : 0,
    ...CATEGORY_CARD_STYLE[idx % CATEGORY_CARD_STYLE.length]
  }));

  renderCategoryCards(categories);
}

// Render Category Cards
function renderCategoryCards(categories) {
  const container = document.getElementById('category-cards-container');
  if (!container || !categories) return;

  if (categories.length === 0) {
    container.innerHTML = `<div class="col-12 text-muted small">No products yet — add products to see category performance.</div>`;
    return;
  }

  container.innerHTML = categories.map(cat => `
    <div class="col-12 col-sm-6 col-xl-4 mb-3">
      <div class="card card-hover h-100 p-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <div class="d-flex align-items-center gap-2">
            <div class="rounded-3 p-2 bg-${cat.badgeColor}-subtle text-${cat.badgeColor}">
              <i class="bi ${cat.icon} fs-5"></i>
            </div>
            <h6 class="fw-semibold mb-0 text-dark">${cat.name}</h6>
          </div>
          <span class="badge bg-light text-muted border">${cat.itemCount} Items</span>
        </div>
        <div class="d-flex align-items-center justify-content-between text-muted small mb-1">
          <span>Stock Value:</span>
          <span class="fw-semibold text-dark">${ShopSense.formatCurrency(cat.stockValue)}</span>
        </div>
        <div class="progress" style="height: 6px;">
          <div class="progress-bar bg-${cat.badgeColor}" role="progressbar" style="width: ${cat.stockHealthPercentage}%;" aria-valuenow="${cat.stockHealthPercentage}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <div class="d-flex justify-content-between small text-muted mt-1" style="font-size: 0.75rem;">
          <span>Stock Health</span>
          <span>${cat.stockHealthPercentage}% Healthy</span>
        </div>
      </div>
    </div>
  `).join('');
}

// Load Recent Sales from the live sales log (first page, most recent)
async function loadRecentSales() {
  const tableBody = document.getElementById('recent-sales-table-body');
  if (!tableBody) return;

  const salesResp = await ShopSense.fetchData(ShopSense.KEYS.SALES, '/api/sales?page=1&pageSize=5');
  renderRecentSales(salesResp ? salesResp.sales : []);
}

// Render Recent Sales Table
function renderRecentSales(recentSales) {
  const tableBody = document.getElementById('recent-sales-table-body');
  if (!tableBody || !recentSales) return;

  if (recentSales.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No sales transactions logged yet.</td></tr>`;
    return;
  }

  tableBody.innerHTML = recentSales.map(sale => `
    <tr>
      <td class="fw-semibold text-primary">${sale.invoiceNo}</td>
      <td>${sale.customerName}</td>
      <td>${sale.productName} <span class="badge bg-light text-muted ms-1">x${sale.quantity}</span></td>
      <td class="fw-semibold">${ShopSense.formatCurrency(sale.totalAmount)}</td>
      <td><span class="badge badge-soft-primary">${sale.paymentMethod}</span></td>
      <td class="text-muted small">${ShopSense.formatSaleDateTime(sale.date, sale.time)}</td>
      <td><span class="badge badge-soft-success">${sale.status}</span></td>
    </tr>
  `).join('');
}

// Quick Actions Handler
function initQuickActions() {
  const recordSaleBtn = document.getElementById('quick-record-sale-btn');
  if (recordSaleBtn) {
    recordSaleBtn.addEventListener('click', () => {
      window.location.href = '/pages/sales.html';
    });
  }

  const addProductBtn = document.getElementById('quick-add-product-btn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
      window.location.href = '/pages/add-product.html';
    });
  }
}
