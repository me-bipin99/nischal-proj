/**
 * ShopSense Common JavaScript Module
 * Handles Layout, Navigation, LocalStorage State, Toasts & Reusable Components
 */

const ShopSense = {
  // LocalStorage state keys
  KEYS: {
    DASHBOARD: 'shopsense_dashboard_data',
    PRODUCTS: 'shopsense_products_data',
    SALES: 'shopsense_sales_data',
    ALERTS: 'shopsense_alerts_data',
    ANALYTICS: 'shopsense_analytics_data',
    SETTINGS: 'shopsense_settings_data',
    USER: 'shopsense_user_data',
    AUTH: 'shopsense_auth_session',
    AUTH_TOKEN: 'shopsense_auth_token'
  },

  // Base URL for the live ShopSense API. Pages may override this by setting
  // window.SHOPSENSE_API_BASE in an inline <script> before common.js loads.
  getApiBase() {
    return window.SHOPSENSE_API_BASE || 'http://localhost:4000';
  },

  // Core authenticated fetch helper. Attaches the JWT (if present), prefixes
  // the API base URL, and redirects to login on a 401 response.
  async apiFetch(path, options = {}) {
    const token = localStorage.getItem(this.KEYS.AUTH_TOKEN);
    const headers = Object.assign({}, options.headers || {});

    if (!(options.body instanceof FormData) && options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = /^https?:\/\//i.test(path) ? path : `${this.getApiBase()}${path}`;

    let response;
    try {
      response = await fetch(url, Object.assign({}, options, { headers }));
    } catch (error) {
      console.error(`ShopSense API Network Error [${path}]:`, error);
      throw error;
    }

    // Only auto-redirect on 401 if we actually sent a token that got rejected
    // (an expired/invalid session). A 401 with no token present just means the
    // request itself was a failed login attempt - let the caller handle that
    // response normally instead of bouncing back to the page it's already on.
    if (response.status === 401 && token) {
      localStorage.removeItem(this.KEYS.AUTH_TOKEN);
      localStorage.removeItem(this.KEYS.USER);
      window.location.href = '/pages/login.html';
      // Stop callers from continuing to process a request that is being redirected away from.
      throw new Error('Unauthorized - redirecting to login');
    }

    return response;
  },

  // Convenience wrapper: apiFetch + JSON parsing, kept signature-compatible
  // with the old (storageKey, mockPath) callers by accepting an API path in
  // place of the mock JSON path. Returns parsed JSON on success, or null on
  // failure (mirroring the old mock-based behavior).
  async fetchData(storageKey, apiPath, options = {}) {
    try {
      const response = await this.apiFetch(apiPath, options);
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to load ${apiPath}: ${response.statusText}`);
      }
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      console.error(`ShopSense Data Error [${storageKey}]:`, error);
      return null;
    }
  },

  // Route guard: redirect to login.html immediately if no auth token is
  // stored. Called at the top of every protected page's JS module.
  requireAuth() {
    const token = localStorage.getItem(this.KEYS.AUTH_TOKEN);
    if (!token) {
      window.location.href = '/pages/login.html';
      return false;
    }
    return true;
  },

  // Save updated data to LocalStorage (still used for small bits of purely
  // client-side UI state; no longer used as a substitute for persistence).
  saveData(storageKey, data) {
    localStorage.setItem(storageKey, JSON.stringify(data));
  },

  // Currency formatter
  formatCurrency(value, currencySymbol = '$') {
    const num = parseFloat(value) || 0;
    return `${currencySymbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  // Formats a sale's date + time fields for display. The API may return
  // either short strings ("2026-07-25", "10:42 AM") or full ISO timestamps
  // for both fields (when a sale was just recorded) — normalize either shape
  // into a single readable string.
  formatSaleDateTime(dateVal, timeVal) {
    const dateObj = dateVal ? new Date(dateVal) : null;
    const timeObj = timeVal ? new Date(timeVal) : null;
    const dateValid = dateObj && !isNaN(dateObj.getTime());
    const timeValid = timeObj && !isNaN(timeObj.getTime());

    // Both fields parse as full timestamps on the same moment (fresh sale) —
    // show one combined, human-readable date/time.
    if (dateValid && timeValid && /^\d{4}-\d{2}-\d{2}T/.test(String(timeVal))) {
      return dateObj.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }

    // Otherwise treat them as separate short date / time strings and just
    // concatenate (the original mock-data shape).
    return [dateVal, timeVal].filter(Boolean).join(' ');
  },

  // Toast notification trigger
  showToast(title, message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toastId = 'toast-' + Date.now();
    const bgClass = type === 'success' ? 'bg-success' : type === 'danger' ? 'bg-danger' : type === 'warning' ? 'bg-warning' : 'bg-primary';
    const iconClass = type === 'success' ? 'bi-check-circle-fill' : type === 'danger' ? 'bi-exclamation-triangle-fill' : type === 'warning' ? 'bi-exclamation-diamond-fill' : 'bi-info-circle-fill';

    const toastHtml = `
      <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0 shadow-lg mb-2" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body d-flex align-items-center gap-2">
            <i class="bi ${iconClass} fs-5"></i>
            <div>
              <strong>${title}</strong>
              <div class="small">${message}</div>
            </div>
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastElem = document.getElementById(toastId);
    if (window.bootstrap && window.bootstrap.Toast) {
      const bsToast = new window.bootstrap.Toast(toastElem, { delay: 4000 });
      bsToast.show();
      toastElem.addEventListener('hidden.bs.toast', () => toastElem.remove());
    } else {
      setTimeout(() => toastElem.remove(), 4000);
    }
  },

  // Highlight Active Link in Sidebar
  getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('products') || path.includes('add-product') || path.includes('edit-product')) return 'products';
    if (path.includes('sales')) return 'sales';
    if (path.includes('alerts')) return 'alerts';
    if (path.includes('analytics')) return 'analytics';
    if (path.includes('settings')) return 'settings';
    if (path.includes('account')) return 'account';
    if (path.includes('login') || path.includes('signup') || path.includes('forgot') || path.includes('reset')) return 'auth';
    return 'dashboard';
  },

  // Global Navigation & Layout Injector
  initLayout() {
    const activePage = this.getCurrentPage();
    if (activePage === 'auth') return; // Auth pages have standalone centered layout

    // Inject Sidebar if container present
    const sidebarElem = document.getElementById('sidebar-container');
    if (sidebarElem) {
      sidebarElem.innerHTML = `
        <aside class="sidebar">
          <a href="/index.html" class="sidebar-brand">
            <div class="sidebar-brand-logo"><i class="bi bi-shop"></i></div>
            <span class="fs-5 fw-bold text-dark tracking-tight">ShopSense</span>
          </a>
          <nav class="sidebar-nav">
            <div class="nav-section-title">Main Menu</div>
            <a href="/index.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">
              <i class="bi bi-grid-1x2-fill"></i>
              <span>Dashboard</span>
            </a>
            <a href="/pages/products.html" class="nav-link ${activePage === 'products' ? 'active' : ''}">
              <i class="bi bi-box-seam-fill"></i>
              <span>Products</span>
            </a>
            <a href="/pages/sales.html" class="nav-link ${activePage === 'sales' ? 'active' : ''}">
              <i class="bi bi-receipt-cutoff"></i>
              <span>Sales</span>
            </a>
            <a href="/pages/alerts.html" class="nav-link ${activePage === 'alerts' ? 'active' : ''}">
              <i class="bi bi-bell-fill"></i>
              <span>Alerts</span>
              <span class="badge bg-danger rounded-pill ms-auto" id="sidebar-alert-count">3</span>
            </a>
            <a href="/pages/analytics.html" class="nav-link ${activePage === 'analytics' ? 'active' : ''}">
              <i class="bi bi-graph-up-arrow"></i>
              <span>Analytics</span>
            </a>

            <div class="nav-section-title mt-3">Account & System</div>
            <a href="/pages/settings.html" class="nav-link ${activePage === 'settings' ? 'active' : ''}">
              <i class="bi bi-gear-fill"></i>
              <span>Settings</span>
            </a>
            <a href="/pages/account.html" class="nav-link ${activePage === 'account' ? 'active' : ''}">
              <i class="bi bi-person-circle"></i>
              <span>My Account</span>
            </a>
          </nav>
          <div class="sidebar-footer">
            <a href="#" class="nav-link text-danger w-100 btn btn-light text-start text-danger fw-medium d-flex align-items-center gap-2" id="sidebar-logout-btn">
              <i class="bi bi-box-arrow-right"></i>
              <span>Logout</span>
            </a>
          </div>
        </aside>
        <div class="sidebar-overlay" id="sidebar-overlay"></div>
      `;
    }

    // Inject Topbar if container present
    const topbarElem = document.getElementById('topbar-container');
    if (topbarElem) {
      topbarElem.innerHTML = `
        <header class="topbar">
          <div class="d-flex align-items-center gap-3">
            <button class="btn btn-light d-lg-none border-0 p-2" id="mobile-sidebar-toggle" aria-label="Toggle Navigation">
              <i class="bi bi-list fs-4"></i>
            </button>
            <div class="topbar-search d-none d-md-block">
              <i class="bi bi-search"></i>
              <input type="text" class="form-control" placeholder="Search SKU, products, orders..." id="global-search-input">
            </div>
          </div>
          <div class="d-flex align-items-center gap-3">
            <!-- Notifications Dropdown -->
            <div class="dropdown">
              <button class="btn btn-light rounded-circle position-relative p-2" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-bell fs-5"></i>
                <span class="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle">
                  <span class="visually-hidden">Unread notifications</span>
                </span>
              </button>
              <div class="dropdown-menu dropdown-menu-end shadow-lg border-0 p-0 rounded-3 mt-2" style="width: 320px;">
                <div class="p-3 border-bottom d-flex align-items-center justify-content-between">
                  <h6 class="mb-0 fw-semibold">Notifications</h6>
                  <span class="badge bg-primary-subtle text-primary rounded-pill">3 New</span>
                </div>
                <div class="list-group list-group-flush small" style="max-height: 280px; overflow-y: auto;">
                  <a href="/pages/alerts.html" class="list-group-item list-group-item-action p-3">
                    <div class="d-flex w-100 justify-content-between">
                      <strong class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i> Out of Stock Alert</strong>
                      <small class="text-muted">10m ago</small>
                    </div>
                    <p class="mb-1 text-muted small">Smart LED Desk Lamp is out of stock.</p>
                  </a>
                  <a href="/pages/alerts.html" class="list-group-item list-group-item-action p-3">
                    <div class="d-flex w-100 justify-content-between">
                      <strong class="text-warning"><i class="bi bi-exclamation-circle me-1"></i> Low Stock Warning</strong>
                      <small class="text-muted">1h ago</small>
                    </div>
                    <p class="mb-1 text-muted small">Vitamin C Serum stock reached 2 bottles.</p>
                  </a>
                </div>
                <div class="p-2 text-center border-top bg-light">
                  <a href="/pages/alerts.html" class="text-primary text-decoration-none small fw-medium">View All Alerts</a>
                </div>
              </div>
            </div>

            <!-- User Menu Dropdown -->
            <div class="dropdown">
              <a href="#" class="d-flex align-items-center gap-2 text-decoration-none text-dark dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="User Avatar" class="rounded-circle" width="38" height="38" style="object-fit: cover;">
                <div class="d-none d-sm-block text-start">
                  <div class="fw-semibold lh-1" style="font-size: 0.9rem;" id="topbar-user-name">Alex Morgan</div>
                  <small class="text-muted" style="font-size: 0.75rem;">Store Manager</small>
                </div>
              </a>
              <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 mt-2">
                <li><a class="dropdown-item d-flex align-items-center gap-2" href="/pages/account.html"><i class="bi bi-person"></i> My Account</a></li>
                <li><a class="dropdown-item d-flex align-items-center gap-2" href="/pages/settings.html"><i class="bi bi-gear"></i> Settings</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item d-flex align-items-center gap-2 text-danger" href="#" id="topbar-logout-btn"><i class="bi bi-box-arrow-right"></i> Logout</a></li>
              </ul>
            </div>
          </div>
        </header>
      `;
    }

    // Inject Footer if container present
    const footerElem = document.getElementById('footer-container');
    if (footerElem) {
      footerElem.innerHTML = `
        <footer class="footer d-flex flex-column flex-sm-row align-items-center justify-content-between gap-2">
          <div>&copy; 2026 <strong>ShopSense</strong>. Smart Retail Inventory & Sales Intelligence.</div>
          <div class="d-flex gap-3">
            <a href="/pages/settings.html" class="text-muted text-decoration-none">System Settings</a>
            <a href="/pages/404.html" class="text-muted text-decoration-none">Help Center</a>
          </div>
        </footer>
      `;
    }

    // Populate topbar with the logged-in user's name, if known
    const topbarNameElem = document.getElementById('topbar-user-name');
    if (topbarNameElem) {
      try {
        const storedUser = JSON.parse(localStorage.getItem(this.KEYS.USER) || 'null');
        if (storedUser && storedUser.fullName) {
          topbarNameElem.textContent = storedUser.fullName;
        }
      } catch (e) { /* ignore malformed stored user */ }
    }

    // Initialize Global Event Listeners
    this.bindEvents();
  },

  bindEvents() {
    // Mobile Sidebar Toggle
    const toggleBtn = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggleBtn && sidebar && overlay) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
      });

      overlay.addEventListener('click', () => {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
      });
    }

    // Logout Action Listener
    const logoutBtns = document.querySelectorAll('#sidebar-logout-btn, #topbar-logout-btn');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem(this.KEYS.AUTH);
        localStorage.removeItem(this.KEYS.AUTH_TOKEN);
        localStorage.removeItem(this.KEYS.USER);
        this.showToast('Logged Out', 'You have been safely signed out.', 'warning');
        setTimeout(() => {
          window.location.href = '/pages/login.html';
        }, 800);
      });
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ShopSense.initLayout();
});
