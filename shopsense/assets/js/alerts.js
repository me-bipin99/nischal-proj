/**
 * ShopSense Alerts JavaScript Module
 * Handles Low Stock & Stockout Alerts, Severity Badges, Mark Read & Reorder Actions
 */

let alertsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  await loadAlerts();
  setupFilterControls();
});

async function loadAlerts() {
  alertsList = await ShopSense.fetchData(ShopSense.KEYS.ALERTS, '/api/alerts') || [];
  renderAlerts();
}

function renderAlerts(filterSeverity = 'all', filterStatus = 'all') {
  const container = document.getElementById('alerts-container');
  const criticalCountElem = document.getElementById('critical-alerts-count');
  const warningCountElem = document.getElementById('warning-alerts-count');
  const reorderAllBtn = document.getElementById('reorder-all-btn');

  if (!container) return;

  const criticalCount = alertsList.filter(a => a.severity === 'critical').length;
  const warningCount = alertsList.filter(a => a.severity === 'warning').length;

  if (criticalCountElem) criticalCountElem.textContent = criticalCount;
  if (warningCountElem) warningCountElem.textContent = warningCount;

  const filtered = alertsList.filter(a => {
    const matchSev = filterSeverity === 'all' || a.severity === filterSeverity;
    const matchStat = filterStatus === 'all' || a.status === filterStatus;
    return matchSev && matchStat;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card p-5 text-center">
        <i class="bi bi-shield-check fs-1 text-success d-block mb-2"></i>
        <h5 class="fw-bold">All Inventory Health Clear!</h5>
        <p class="text-muted small mb-0">No alerts match your selected filters.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(alt => {
    const isCritical = alt.severity === 'critical';
    const borderClass = isCritical ? 'border-start border-4 border-danger' : 'border-start border-4 border-warning';
    const iconClass = isCritical ? 'bi-exclamation-triangle-fill text-danger' : 'bi-exclamation-diamond-fill text-warning';
    const badgeClass = isCritical ? 'badge-soft-danger' : 'badge-soft-warning';

    return `
      <div class="card ${borderClass} mb-3 card-hover">
        <div class="card-body p-3 p-md-4">
          <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div class="d-flex align-items-start gap-3">
              <div class="p-2 rounded-3 bg-light">
                <i class="bi ${iconClass} fs-3"></i>
              </div>
              <div>
                <div class="d-flex align-items-center gap-2 mb-1">
                  <h6 class="fw-bold mb-0 text-dark">${alt.productName}</h6>
                  <span class="badge ${badgeClass} text-uppercase" style="font-size: 0.7rem;">${alt.severity}</span>
                  ${alt.status === 'unread' ? '<span class="badge bg-primary text-white" style="font-size: 0.65rem;">NEW</span>' : ''}
                </div>
                <p class="text-muted small mb-2">${alt.message}</p>
                <div class="d-flex flex-wrap gap-3 small text-muted">
                  <span>SKU: <code>${alt.sku}</code></span>
                  <span>Stock Left: <strong class="${isCritical ? 'text-danger' : 'text-warning'}">${alt.currentStock} units</strong></span>
                  <span>Recommended Order: <strong>${alt.recommendedReorderQty} units</strong></span>
                  <span>Time: ${alt.timestamp}</span>
                </div>
              </div>
            </div>
            <div class="d-flex align-items-center gap-2 align-self-md-center">
              ${alt.status === 'unread' ? `<button class="btn btn-sm btn-outline-secondary mark-read-btn" data-id="${alt.id}">Mark Read</button>` : ''}
              <button class="btn btn-sm btn-primary reorder-single-btn" data-id="${alt.id}" data-name="${alt.productName}" data-qty="${alt.recommendedReorderQty}">
                <i class="bi bi-cart-plus me-1"></i> Reorder (${alt.recommendedReorderQty})
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Event Listeners for Buttons
  document.querySelectorAll('.mark-read-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      try {
        const response = await ShopSense.apiFetch(`/api/alerts/${id}/read`, { method: 'PATCH' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to mark alert as read.');

        await loadAlerts();
        renderAlerts(filterSeverity, filterStatus);
        ShopSense.showToast('Alert Updated', 'Alert marked as read.', 'info');
      } catch (error) {
        ShopSense.showToast('Update Failed', error.message || 'Could not update alert.', 'danger');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('.reorder-single-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      const qty = btn.getAttribute('data-qty');
      btn.disabled = true;
      try {
        const response = await ShopSense.apiFetch(`/api/alerts/${id}/reorder`, { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to submit reorder.');

        await loadAlerts();
        renderAlerts(filterSeverity, filterStatus);
        ShopSense.showToast('Purchase Order Sent', `Reorder request for ${qty} units of ${name} submitted to supplier!`, 'success');
      } catch (error) {
        ShopSense.showToast('Reorder Failed', error.message || 'Could not submit reorder.', 'danger');
        btn.disabled = false;
      }
    });
  });

  if (reorderAllBtn) {
    // Avoid stacking duplicate listeners across re-renders since this button
    // lives outside the re-rendered container.
    reorderAllBtn.replaceWith(reorderAllBtn.cloneNode(true));
    const freshBtn = document.getElementById('reorder-all-btn');
    freshBtn.addEventListener('click', async () => {
      if (!confirm('Create automated purchase orders for all critical and warning low stock items?')) return;
      freshBtn.disabled = true;
      try {
        const response = await ShopSense.apiFetch('/api/alerts/reorder-all', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to submit batch reorder.');

        await loadAlerts();
        ShopSense.showToast('Batch Reorder Executed', `Purchase orders generated for ${data.reorderedCount} low-stock items!`, 'success');
      } catch (error) {
        ShopSense.showToast('Reorder Failed', error.message || 'Could not submit batch reorder.', 'danger');
      } finally {
        freshBtn.disabled = false;
      }
    });
  }
}

function setupFilterControls() {
  const sevFilter = document.getElementById('alert-severity-filter');
  const statFilter = document.getElementById('alert-status-filter');

  function update() {
    renderAlerts(sevFilter ? sevFilter.value : 'all', statFilter ? statFilter.value : 'all');
  }

  if (sevFilter) sevFilter.addEventListener('change', update);
  if (statFilter) statFilter.addEventListener('change', update);
}
