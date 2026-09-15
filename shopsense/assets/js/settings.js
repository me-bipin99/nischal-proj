/**
 * ShopSense Settings JavaScript Module
 * Handles Store Profile, Currency, Timezone, Low Stock Threshold & Toast Updates
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  const settingsData = await ShopSense.fetchData(ShopSense.KEYS.SETTINGS, '/api/settings');
  if (!settingsData) return;

  populateSettingsForm(settingsData);

  const form = document.getElementById('settings-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updated = {
        storeName: document.getElementById('setting-store-name').value.trim(),
        currency: document.getElementById('setting-currency').value,
        timezone: document.getElementById('setting-timezone').value,
        lowStockThreshold: parseInt(document.getElementById('setting-threshold').value) || 15,
        taxRate: parseFloat(document.getElementById('setting-tax-rate').value) || 0,
        receiptFooter: document.getElementById('setting-footer').value.trim()
      };

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await ShopSense.apiFetch('/api/settings', {
          method: 'PUT',
          body: JSON.stringify(updated)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Failed to save settings.');
        }

        populateSettingsForm(data);

        // Persist the active currency to localStorage so all other pages
        // immediately pick it up via ShopSense.getCurrency(), then fire the
        // custom event so any listener on this same page can re-render prices.
        const newCurrency = data.currency || updated.currency;
        localStorage.setItem('shopsense_currency', newCurrency);
        window.dispatchEvent(new CustomEvent('currencychange', { detail: { currency: newCurrency } }));

        ShopSense.showToast('Settings Saved', 'System preferences updated successfully!', 'success');
      } catch (error) {
        ShopSense.showToast('Save Failed', error.message || 'Could not save settings.', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});

function populateSettingsForm(settingsData) {
  if (document.getElementById('setting-store-name')) document.getElementById('setting-store-name').value = settingsData.storeName || '';
  if (document.getElementById('setting-currency')) document.getElementById('setting-currency').value = settingsData.currency || 'USD';
  if (document.getElementById('setting-timezone')) document.getElementById('setting-timezone').value = settingsData.timezone || '';
  if (document.getElementById('setting-threshold')) document.getElementById('setting-threshold').value = settingsData.lowStockThreshold || 15;
  if (document.getElementById('setting-tax-rate')) document.getElementById('setting-tax-rate').value = settingsData.taxRate || 8.5;
  if (document.getElementById('setting-footer')) document.getElementById('setting-footer').value = settingsData.receiptFooter || '';

  // Keep localStorage in sync with whatever the server says the currency is.
  // This ensures that on first load (or after a session restore) the rest of
  // the app immediately uses the correct currency without requiring a save.
  if (settingsData.currency) {
    localStorage.setItem('shopsense_currency', settingsData.currency);
    window.dispatchEvent(new CustomEvent('currencychange', { detail: { currency: settingsData.currency } }));
  }
}
