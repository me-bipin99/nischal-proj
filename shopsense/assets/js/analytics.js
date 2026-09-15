/**
 * ShopSense Analytics JavaScript Module
 * Handles Product Velocity/Margin Clustering (Fast Moving / Seasonal / Slow
 * Moving), the scatter plot visualization, and the segmented product cards.
 *
 * NOTE: This file did not exist in the mock-data build (pages/analytics.html
 * referenced /assets/js/analytics.js but it had never been created) — it is
 * added here to wire the page up to GET /api/analytics/clusters.
 */

// Presentation metadata for each cluster segment. The API only returns the
// numeric cluster stats (count, avgTurnoverDays, totalRevenueShare) — colors,
// labels, and action-plan copy are stable UI constants kept client-side.
const CLUSTER_META = {
  fastMoving: {
    name: 'Fast Moving',
    color: '#2563EB',
    badge: 'bg-primary-subtle text-primary',
    description: 'High sales velocity & predictable demand. Requires consistent safety stock.',
    tip: 'Maintain high safety stock level.'
  },
  seasonal: {
    name: 'Seasonal',
    color: '#8B5CF6',
    badge: 'bg-purple-subtle text-purple',
    description: 'Spikes in demand during specific periods or weather changes. Flexible reordering required.',
    tip: 'Plan seasonal reorder before peak.'
  },
  slowMoving: {
    name: 'Slow Moving',
    color: '#F59E0B',
    badge: 'bg-warning-subtle text-warning',
    description: 'Low turnover rate & high storage cost. Consider promotional discounts or bundle deals.',
    tip: 'Consider a 15% discount promo deal.'
  }
};

// The page's <select> uses labels from the original mock build; map them
// onto the timeframe values the live API accepts (month|3months|year). The
// API has no distinct "Last Month" bucket, so it falls back to "month".
const TIMEFRAME_PARAM_MAP = {
  'Month': 'month',
  'Last Month': 'month',
  '3 Months': '3months',
  'Year': 'year'
};

let scatterChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  await loadClusters('Month');

  const timeframeFilter = document.getElementById('analytics-timeframe-filter');
  if (timeframeFilter) {
    timeframeFilter.addEventListener('change', (e) => {
      loadClusters(e.target.value);
    });
  }

  // Re-run the last cluster load when currency changes so all revenue figures
  // in product cards update instantly without a page reload.
  window.addEventListener('currencychange', () => {
    const filter = document.getElementById('analytics-timeframe-filter');
    loadClusters(filter ? filter.value : 'Month');
  });
});

async function loadClusters(timeframeLabel) {
  const apiTimeframe = TIMEFRAME_PARAM_MAP[timeframeLabel] || 'month';
  const data = await ShopSense.fetchData(ShopSense.KEYS.ANALYTICS, `/api/analytics/clusters?timeframe=${encodeURIComponent(apiTimeframe)}`);

  if (!data || data.unclustered) {
    renderUnclustered(data ? data.products : []);
    return;
  }

  renderClusterSummaryCards(data.clusters);
  renderScatterChart(data.scatterData);
  renderProductCards(data.scatterData);
}

function clearScatterEmptyState(canvas) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (parent) parent.querySelectorAll('.analytics-empty-state').forEach(el => el.remove());
  canvas.style.display = '';
}

function renderUnclustered(products) {
  const summaryContainer = document.getElementById('cluster-summary-cards');
  const productCardsContainer = document.getElementById('analytics-product-cards');
  const canvas = document.getElementById('clusteringScatterChart');

  if (scatterChartInstance) {
    scatterChartInstance.destroy();
    scatterChartInstance = null;
  }

  if (canvas) {
    const parent = canvas.parentElement;
    if (parent) {
      parent.querySelectorAll('.analytics-empty-state').forEach(el => el.remove());
      canvas.style.display = 'none';
      const emptyState = document.createElement('div');
      emptyState.className = 'analytics-empty-state text-center text-muted py-5';
      emptyState.innerHTML = '<i class="bi bi-scatter-chart fs-1 d-block mb-2 text-secondary"></i>Not enough sales history yet to cluster products. Record more sales to unlock this view.';
      parent.appendChild(emptyState);
    }
  }

  if (summaryContainer) {
    summaryContainer.innerHTML = `<div class="col-12 text-muted small">Clustering requires more sales history — showing the raw product list below instead.</div>`;
  }

  if (productCardsContainer) {
    const list = products || [];
    if (list.length === 0) {
      productCardsContainer.innerHTML = `<div class="col-12 text-muted small">No products yet.</div>`;
    } else {
      productCardsContainer.innerHTML = list.map(p => `
        <div class="col-12 col-sm-6 col-lg-4 mb-3">
          <div class="card p-3 h-100 card-hover">
            <h6 class="fw-bold mb-1 text-dark">${p.productName || p.name || 'Unnamed Product'}</h6>
            <code class="text-muted small d-block mb-2">${p.sku}</code>
            <div class="d-flex justify-content-between small text-muted">
              <span>Stock: <strong class="text-dark">${p.stock}</strong></span>
              <span>Revenue: <strong class="text-dark" data-price-usd="${p.revenue}">${ShopSense.formatCurrency(p.revenue)}</strong></span>
            </div>
          </div>
        </div>
      `).join('');
    }
  }
}

function renderClusterSummaryCards(clusters) {
  const container = document.getElementById('cluster-summary-cards');
  if (!container || !clusters) return;

  container.innerHTML = Object.keys(CLUSTER_META).map(key => {
    const meta = CLUSTER_META[key];
    const stats = clusters[key] || { count: 0, avgTurnoverDays: 0, totalRevenueShare: '0%' };

    return `
      <div class="col-12 col-md-4 mb-3">
        <div class="card p-3 border-start border-4 h-100" style="border-left-color: ${meta.color} !important;">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="fw-bold mb-0 text-dark">${meta.name} Cluster</h6>
            <span class="badge ${meta.badge}">${stats.count} Items</span>
          </div>
          <p class="text-muted small mb-2">${meta.description}</p>
          <div class="d-flex justify-content-between text-muted small border-top pt-2 mt-auto">
            <span>Avg Turnover: <strong>${stats.avgTurnoverDays} days</strong></span>
            <span>Revenue Share: <strong>${stats.totalRevenueShare}</strong></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderScatterChart(scatterData) {
  const canvas = document.getElementById('clusteringScatterChart');
  if (!canvas || !scatterData) return;

  clearScatterEmptyState(canvas);

  if (scatterChartInstance) {
    scatterChartInstance.destroy();
    scatterChartInstance = null;
  }

  const ctx = canvas.getContext('2d');

  const datasets = Object.keys(CLUSTER_META).map(key => {
    const meta = CLUSTER_META[key];
    const points = (scatterData[key] || []).map(pt => ({
      x: pt.x,
      y: pt.y,
      productName: pt.productName,
      sku: pt.sku,
      stock: pt.stock,
      revenue: pt.revenue
    }));

    return {
      label: meta.name,
      data: points,
      backgroundColor: meta.color,
      pointRadius: 7,
      pointHoverRadius: 10
    };
  });

  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, font: { family: 'Poppins', size: 12 } }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 12,
          titleFont: { family: 'Poppins', size: 13 },
          bodyFont: { family: 'Poppins', size: 12 },
          callbacks: {
            label: function(context) {
              const p = context.raw || {};
              return [
                `${p.productName || ''} (${p.sku || ''})`,
                `Sales Velocity: ${p.x} units/period`,
                `Margin / Demand Score: ${p.y}%`,
                `Revenue: $${p.revenue ?? 0}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Sales Velocity (Units Sold)', font: { family: 'Poppins', size: 12 } },
          grid: { color: '#F1F5F9' },
          ticks: { font: { family: 'Poppins', size: 11 } }
        },
        y: {
          title: { display: true, text: 'Profit Margin / Predictability Index (%)', font: { family: 'Poppins', size: 12 } },
          grid: { color: '#F1F5F9' },
          ticks: { font: { family: 'Poppins', size: 11 } }
        }
      }
    }
  });
}

function renderProductCards(scatterData) {
  const container = document.getElementById('analytics-product-cards');
  if (!container || !scatterData) return;

  let allProducts = [];
  Object.keys(CLUSTER_META).forEach(key => {
    (scatterData[key] || []).forEach(p => allProducts.push(Object.assign({ clusterKey: key }, p)));
  });

  if (allProducts.length === 0) {
    container.innerHTML = `<div class="col-12 text-muted small">No segmented products for this timeframe yet.</div>`;
    return;
  }

  container.innerHTML = allProducts.map(prod => {
    const meta = CLUSTER_META[prod.clusterKey];
    return `
    <div class="col-12 col-sm-6 col-lg-4 mb-3">
      <div class="card p-3 h-100 card-hover">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h6 class="fw-bold mb-0 text-dark">${prod.productName}</h6>
            <code class="text-muted small">${prod.sku}</code>
          </div>
          <span class="badge ${meta.badge}">${meta.name}</span>
        </div>
        <div class="bg-light p-2 rounded-3 mb-2 small">
          <div class="d-flex justify-content-between text-muted">
            <span>Sales Velocity:</span>
            <strong class="text-dark">${prod.x} units</strong>
          </div>
          <div class="d-flex justify-content-between text-muted">
            <span>Margin Score:</span>
            <strong class="text-dark">${prod.y}%</strong>
          </div>
          <div class="d-flex justify-content-between text-muted">
            <span>Revenue Generated:</span>
            <strong class="text-primary" data-price-usd="${prod.revenue}">${ShopSense.formatCurrency(prod.revenue)}</strong>
          </div>
        </div>
        <div class="small text-muted mt-auto pt-1">
          <i class="bi bi-lightbulb me-1 text-primary"></i> ${meta.tip}
        </div>
      </div>
    </div>
  `;
  }).join('');
}
