/**
 * ShopSense Alerts JavaScript Module
 * Handles Low Stock & Stockout Alerts, Severity Badges, Mark Read & Reorder Actions
 * Supports order statuses: unread | read | processing | restocked
 */

let alertsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  // Handle any ?restocked=1 or ?order_error= query params from a redirect
  handleConfirmRedirect();

  await loadAlerts();
  setupFilterControls();

  // Auto-refresh every 10s so status flips (processing → restocked) appear quickly
  setInterval(async () => {
    await loadAlerts();
    const sevFilter  = document.getElementById('alert-severity-filter');
    const statFilter = document.getElementById('alert-status-filter');
    renderAlerts(sevFilter?.value || 'all', statFilter?.value || 'all');
  }, 10000);
});

function handleConfirmRedirect() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('restocked') === '1') {
    const product = params.get('product') || 'Product';
    const qty     = params.get('qty')     || '0';
    const stock   = params.get('stock')   || '0';
    const eta     = params.get('eta')     || 'Not specified';

    // ── Save to localStorage so dashboard picks it up ─────────────────────
    const notifications = JSON.parse(localStorage.getItem('shopsense_dashboard_notifications') || '[]');
    notifications.push({
      id:        Date.now(),
      type:      'restocked',
      product,
      qty,
      stock,
      eta,
      read:      false,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem('shopsense_dashboard_notifications', JSON.stringify(notifications));

    // ── Show inline success banner on alerts page ──────────────────────────
    const etaLine = eta && eta !== 'Not specified'
      ? `<br><span class="text-muted small">📅 Expected delivery: <strong>${eta}</strong></span>`
      : '';

    const banner = document.createElement('div');
    banner.className = 'alert alert-success alert-dismissible fade show d-flex align-items-start gap-3 mb-4';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <span style="font-size:1.6rem;">✅</span>
      <div>
        <strong class="d-block mb-1">Restock Confirmed by Supplier!</strong>
        <span class="text-success-emphasis">
          <strong>${product}</strong> restocked —
          <strong>${qty} units</strong> dispatched,
          new stock level: <strong>${stock} units</strong>.
        </span>
        ${etaLine}
      </div>
      <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    const contentArea = document.querySelector('.content-area');
    if (contentArea) contentArea.prepend(banner);

    window.history.replaceState({}, '', window.location.pathname);
  }

  if (params.get('order_error')) {
    const msg = params.get('order_error');
    const banner = document.createElement('div');
    banner.className = 'alert alert-warning alert-dismissible fade show d-flex align-items-start gap-3 mb-4';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <span style="font-size:1.6rem;">⚠️</span>
      <div>
        <strong class="d-block mb-1">Confirmation Failed</strong>
        <span>${msg}</span>
      </div>
      <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    const contentArea = document.querySelector('.content-area');
    if (contentArea) contentArea.prepend(banner);

    window.history.replaceState({}, '', window.location.pathname);
  }
}

async function loadAlerts() {
  alertsList = await ShopSense.fetchData(ShopSense.KEYS.ALERTS, '/api/alerts') || [];
  renderAlerts();
  // Keep sidebar badge in sync with current alert state
  ShopSense.refreshAlertBadge();
}

function statusBadge(alt) {
  switch (alt.status) {
    case 'processing':
      return `<span class="badge bg-warning text-dark ms-1" style="font-size:0.65rem;">
                <span class="spinner-border spinner-border-sm me-1" style="width:.6rem;height:.6rem;"></span>
                Processing
              </span>`;
    case 'restocked':
      return `<span class="badge bg-success text-white ms-1" style="font-size:0.65rem;">
                <i class="bi bi-check-circle-fill me-1"></i>Restocked
              </span>`;
    case 'unread':
      return `<span class="badge bg-primary text-white ms-1" style="font-size:0.65rem;">NEW</span>`;
    default:
      return '';
  }
}

function reorderButton(alt) {
  if (alt.status === 'processing') {
    return `<button class="btn btn-sm btn-warning disabled" disabled>
              <span class="spinner-border spinner-border-sm me-1" style="width:.75rem;height:.75rem;"></span>
              Awaiting Confirmation
            </button>`;
  }
  if (alt.status === 'restocked') {
    return `
      <button class="btn btn-sm btn-success mark-complete-btn" data-id="${alt.id}">
        <i class="bi bi-check-lg me-1"></i>Mark Complete
      </button>
      <button class="btn btn-sm btn-outline-secondary dismiss-alert-btn" data-id="${alt.id}" title="Dismiss">
        <i class="bi bi-x-lg"></i>
      </button>`;
  }
  return `
    <div class="d-flex flex-column align-items-end gap-1">
      <button class="btn btn-sm btn-primary reorder-single-btn"
              data-id="${alt.id}" data-name="${alt.productName}" data-qty="${alt.recommendedReorderQty}">
        <i class="bi bi-cart-plus me-1"></i> Reorder ${alt.recommendedReorderQty} units
      </button>
      <span class="text-muted" style="font-size:0.7rem;">
        <i class="bi bi-calculator me-1"></i>EOQ-optimised quantity
      </span>
    </div>`;
}

function renderAlerts(filterSeverity = 'all', filterStatus = 'all') {
  const container       = document.getElementById('alerts-container');
  const criticalCountElem = document.getElementById('critical-alerts-count');
  const warningCountElem  = document.getElementById('warning-alerts-count');
  const reorderAllBtn   = document.getElementById('reorder-all-btn');

  if (!container) return;

  const criticalCount = alertsList.filter(a => a.severity === 'critical').length;
  const warningCount  = alertsList.filter(a => a.severity === 'warning').length;

  if (criticalCountElem) criticalCountElem.textContent = criticalCount;
  if (warningCountElem)  warningCountElem.textContent  = warningCount;

  const filtered = alertsList.filter(a => {
    const matchSev  = filterSeverity === 'all' || a.severity === filterSeverity;
    const matchStat = filterStatus   === 'all' || a.status   === filterStatus;
    return matchSev && matchStat;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card p-5 text-center">
        <i class="bi bi-shield-check fs-1 text-success d-block mb-2"></i>
        <h5 class="fw-bold">All Inventory Health Clear!</h5>
        <p class="text-muted small mb-0">No alerts match your selected filters.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(alt => {
    const isCritical  = alt.severity === 'critical';
    const isProcessing = alt.status === 'processing';
    const isRestocked  = alt.status === 'restocked';

    const borderClass = isRestocked  ? 'border-start border-4 border-success'
                       : isProcessing ? 'border-start border-4 border-warning'
                       : isCritical   ? 'border-start border-4 border-danger'
                       :                'border-start border-4 border-warning';

    const iconClass   = isRestocked  ? 'bi-check-circle-fill text-success'
                       : isProcessing ? 'bi-hourglass-split text-warning'
                       : isCritical   ? 'bi-exclamation-triangle-fill text-danger'
                       :                'bi-exclamation-diamond-fill text-warning';

    const badgeClass  = isCritical ? 'badge-soft-danger' : 'badge-soft-warning';

    const cardOpacity = '';

    return `
      <div class="card ${borderClass} ${cardOpacity} mb-3 card-hover">
        <div class="card-body p-3 p-md-4">
          <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div class="d-flex align-items-start gap-3">
              <div class="p-2 rounded-3 bg-light">
                <i class="bi ${iconClass} fs-3"></i>
              </div>
              <div>
                <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                  <h6 class="fw-bold mb-0 text-dark">${alt.productName}</h6>
                  <span class="badge ${badgeClass} text-uppercase" style="font-size:0.7rem;">${alt.severity}</span>
                  ${statusBadge(alt)}
                </div>
                <p class="text-muted small mb-2">${alt.message}</p>
                ${alt.sellerResponse ? `<p class="small mb-2"><span class="badge bg-success-subtle text-success border border-success-subtle">📅 Seller Response: <strong>${alt.sellerResponse}</strong></span></p>` : ''}
                <div class="d-flex flex-wrap gap-3 small text-muted">
                  <span>SKU: <code>${alt.sku}</code></span>
                  <span>Stock Left: <strong class="${isCritical ? 'text-danger' : 'text-warning'}">${alt.currentStock} units</strong></span>
                  <span>EOQ Reorder Qty: <strong class="text-primary">${alt.recommendedReorderQty} units</strong></span>
                  <span>Time: ${new Date(alt.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div class="d-flex align-items-center gap-2 align-self-md-center">
              ${alt.status === 'unread' ? `<button class="btn btn-sm btn-outline-secondary mark-read-btn" data-id="${alt.id}">Mark Read</button>` : ''}
              ${reorderButton(alt)}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  // ── Mark Read ────────────────────────────────────────────────────────────────
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

  // ── Mark Complete (restocked alerts) ─────────────────────────────────────────
  async function acknowledgeAlert(id, btn) {
    btn.disabled = true;
    try {
      const response = await ShopSense.apiFetch(`/api/alerts/${id}/read`, { method: 'PATCH' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to acknowledge alert.');
      await loadAlerts();
      renderAlerts(filterSeverity, filterStatus);
      ShopSense.showToast('✅ Alert Completed', 'Seller response acknowledged and alert cleared.', 'success');
    } catch (error) {
      ShopSense.showToast('Update Failed', error.message || 'Could not update alert.', 'danger');
      btn.disabled = false;
    }
  }

  document.querySelectorAll('.mark-complete-btn').forEach(btn => {
    btn.addEventListener('click', () => acknowledgeAlert(btn.getAttribute('data-id'), btn));
  });

  document.querySelectorAll('.dismiss-alert-btn').forEach(btn => {
    btn.addEventListener('click', () => acknowledgeAlert(btn.getAttribute('data-id'), btn));
  });

  // ── Reorder Single ───────────────────────────────────────────────────────────
  document.querySelectorAll('.reorder-single-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      const qty  = btn.getAttribute('data-qty');
      btn.disabled = true;

      try {
        const response = await ShopSense.apiFetch(`/api/alerts/${id}/reorder`, { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to submit reorder.');

        await loadAlerts();
        renderAlerts(filterSeverity, filterStatus);
        ShopSense.showToast(
          '📧 Reorder Email Sent',
          `Purchase order for ${qty} units of "${name}" sent to supplier. Check server console for email preview link.`,
          'success'
        );
      } catch (error) {
        ShopSense.showToast('Reorder Failed', error.message || 'Could not submit reorder.', 'danger');
        btn.disabled = false;
      }
    });
  });

  // ── Reorder All ──────────────────────────────────────────────────────────────
  if (reorderAllBtn) {
    reorderAllBtn.replaceWith(reorderAllBtn.cloneNode(true));
    const freshBtn = document.getElementById('reorder-all-btn');
    freshBtn.addEventListener('click', async () => {
      if (!confirm('Send purchase order emails for all critical and warning low-stock items?')) return;
      freshBtn.disabled = true;
      try {
        const response = await ShopSense.apiFetch('/api/alerts/reorder-all', { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to submit batch reorder.');
        await loadAlerts();
        ShopSense.showToast(
          '📧 Batch Orders Sent',
          `Purchase order emails sent for ${data.reorderedCount} low-stock items. Check server console for preview links.`,
          'success'
        );
      } catch (error) {
        ShopSense.showToast('Reorder Failed', error.message || 'Could not submit batch reorder.', 'danger');
      } finally {
        freshBtn.disabled = false;
      }
    });
  }
}

function setupFilterControls() {
  const sevFilter  = document.getElementById('alert-severity-filter');
  const statFilter = document.getElementById('alert-status-filter');

  function update() {
    renderAlerts(sevFilter?.value || 'all', statFilter?.value || 'all');
  }

  if (sevFilter)  sevFilter.addEventListener('change', update);
  if (statFilter) statFilter.addEventListener('change', update);
}
