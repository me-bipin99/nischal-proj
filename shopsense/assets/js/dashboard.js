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

  // Re-render all dynamic table content when the user changes currency
  // in Settings (same tab or another tab). Static [data-price-usd] elements
  // are handled automatically by ShopSense.refreshPrices(); re-generated
  // innerHTML rows need an explicit re-render pass.
  window.addEventListener('currencychange', () => {
    renderDashboardKPIs(summary);
    // Re-render category cards and sales from already-fetched data to avoid
    // extra network round-trips.
    const catContainer = document.getElementById('category-cards-container');
    if (catContainer && catContainer._categoriesData) {
      renderCategoryCards(catContainer._categoriesData);
    }
    const salesBody = document.getElementById('recent-sales-table-body');
    if (salesBody && salesBody._salesData) {
      renderRecentSales(salesBody._salesData);
    }
  });
});

// Render Top Summary KPI Cards
function renderDashboardKPIs(summary) {
  if (!summary) return;

  const todaysSalesElem = document.getElementById('kpi-todays-sales');
  const totalRevenueElem = document.getElementById('kpi-total-revenue');
  const totalProductsElem = document.getElementById('kpi-total-products');
  const lowStockElem = document.getElementById('kpi-low-stock');
  const predictionSummaryElem = document.getElementById('kpi-prediction-summary');

  if (todaysSalesElem) {
    todaysSalesElem.setAttribute('data-price-usd', summary.todaysSales);
    todaysSalesElem.textContent = ShopSense.formatCurrency(summary.todaysSales);
  }
  if (totalRevenueElem) {
    totalRevenueElem.setAttribute('data-price-usd', summary.totalRevenue);
    totalRevenueElem.textContent = ShopSense.formatCurrency(summary.totalRevenue);
  }
  if (totalProductsElem) totalProductsElem.textContent = summary.totalProducts;
  if (lowStockElem) lowStockElem.textContent = summary.lowStockCount;

  if (predictionSummaryElem && summary.predictionSummary) {
    predictionSummaryElem.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-1">
        <span class="text-muted small">7-Day Demand Projection</span>
        <span class="badge bg-primary-subtle text-primary fw-semibold">${summary.predictionSummary.projectedDemand7Days} Units</span>
      </div>
      <div class="fw-bold fs-5 text-dark" data-price-usd="${summary.predictionSummary.projectedRevenue7Days}">${ShopSense.formatCurrency(summary.predictionSummary.projectedRevenue7Days)}</div>
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

    // todayIndex from the API tells us which label slot is "today" —
    // everything to its left is history, everything to its right is forecast.
    const todayIndex = tf.todayIndex ?? 0;

    // Build a vertical "Today" annotation line using a Chart.js plugin that
    // draws directly on the canvas after each render. We inject it as a custom
    // inline plugin so we have no external dependency.
    const todayLinePlugin = {
      id: 'todayLine',
      afterDraw(chart) {
        const { ctx: c, scales } = chart;
        if (!scales.x) return;
        const xPos = scales.x.getPixelForValue(todayIndex);
        const yTop = scales.y.top;
        const yBottom = scales.y.bottom;

        c.save();
        c.beginPath();
        c.setLineDash([6, 4]);
        c.strokeStyle = '#64748B';
        c.lineWidth = 1.5;
        c.moveTo(xPos, yTop);
        c.lineTo(xPos, yBottom);
        c.stroke();

        // "Today" label tag
        c.setLineDash([]);
        c.fillStyle = '#64748B';
        c.font = '500 11px Poppins, sans-serif';
        c.textAlign = 'center';
        c.fillText('Today', xPos, yTop - 6);
        c.restore();
      }
    };

    predictionChartInstance = new Chart(ctx, {
      type: 'line',
      plugins: [todayLinePlugin],
      data: {
        labels: tf.labels,
        datasets: [
          {
            // Actual sales — solid blue line, only drawn over past history.
            // spanGaps: false stops the line at the last non-null point so it
            // doesn't extend into the forecast zone.
            label: 'Actual Sales',
            data: tf.actualSales,
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37, 99, 235, 0.07)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointBackgroundColor: '#2563EB',
            spanGaps: false
          },
          {
            // AI forecast — dashed purple line, only drawn over future dates.
            // spanGaps: false stops it from bridging back through the null
            // history slots.
            label: 'AI Forecast',
            data: tf.predictedSales,
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.06)',
            borderWidth: 2,
            fill: true,
            borderDash: [6, 4],
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#8B5CF6',
            spanGaps: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          // Show all dataset values at a given x-position in a single tooltip
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyleWidth: 16,
              font: { family: 'Poppins', size: 12 },
              color: '#374151'
            }
          },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 12,
            cornerRadius: 8,
            titleFont: { family: 'Poppins', size: 12, weight: '600' },
            bodyFont: { family: 'Poppins', size: 12 },
            callbacks: {
              title(items) {
                const label = items[0]?.label || '';
                const idx = items[0]?.dataIndex ?? -1;
                const zone = idx < todayIndex ? 'History' : idx === todayIndex ? 'Today' : 'Forecast';
                return `${label}  ·  ${zone}`;
              },
              label(context) {
                if (context.raw === null || context.raw === undefined) return null;
                return `  ${context.dataset.label}: ${ShopSense.formatCurrency(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: 'Poppins', size: 10 },
              color: '#64748B',
              // Thin out labels on wider ranges so they don't crowd
              maxTicksLimit: 16,
              maxRotation: 45,
              autoSkip: true
            }
          },
          y: {
            grid: { color: '#F1F5F9' },
            beginAtZero: true,
            ticks: {
              font: { family: 'Poppins', size: 11 },
              color: '#64748B',
              callback: value => ShopSense.formatCurrency(value)
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
  // Cache for currency re-render (avoids extra network round-trip)
  container._categoriesData = categories;
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
          <span class="fw-semibold text-dark" data-price-usd="${cat.stockValue}">${ShopSense.formatCurrency(cat.stockValue)}</span>
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
  const sales = salesResp ? salesResp.sales : [];
  // Cache for currency re-render (avoids extra network round-trip)
  tableBody._salesData = sales;
  renderRecentSales(sales);
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
      <td class="fw-semibold" data-price-usd="${sale.totalAmount}">${ShopSense.formatCurrency(sale.totalAmount)}</td>
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


