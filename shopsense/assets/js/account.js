/**
 * ShopSense Account JavaScript Module
 * Handles User Profile, Avatar Image Upload Preview & Password Change Form Validation
 */

let currentAccount = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!ShopSense.requireAuth()) return;

  currentAccount = await ShopSense.fetchData(ShopSense.KEYS.USER, '/api/account');
  populateAccountForm(currentAccount);

  // Avatar Upload Preview Listener
  const avatarInput = document.getElementById('avatar-file-input');
  const avatarPreview = document.getElementById('avatar-preview');

  if (avatarInput && avatarPreview) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          avatarPreview.src = evt.target.result;
          ShopSense.showToast('Avatar Preview', 'Image selected. Click Save Profile to apply.', 'info');
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Profile Save Form
  const profileForm = document.getElementById('account-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        fullName: document.getElementById('acc-fullname').value.trim(),
        phone: document.getElementById('acc-phone').value.trim(),
        avatar: avatarPreview ? avatarPreview.src : undefined
      };

      const submitBtn = profileForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await ShopSense.apiFetch('/api/account', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Failed to save profile.');
        }

        currentAccount = data;
        populateAccountForm(currentAccount);

        // Keep the cached user record (used for the topbar name) in sync
        const storedUser = JSON.parse(localStorage.getItem(ShopSense.KEYS.USER) || '{}');
        localStorage.setItem(ShopSense.KEYS.USER, JSON.stringify(Object.assign({}, storedUser, {
          fullName: data.fullName,
          email: data.email
        })));

        // Update Topbar username if visible
        const topbarNameElem = document.getElementById('topbar-user-name');
        if (topbarNameElem) topbarNameElem.textContent = data.fullName;

        ShopSense.showToast('Profile Saved', 'Your account details have been updated.', 'success');
      } catch (error) {
        ShopSense.showToast('Save Failed', error.message || 'Could not save profile.', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Password Change Form
  const passwordForm = document.getElementById('account-password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPass = document.getElementById('pwd-current').value.trim();
      const newPass = document.getElementById('pwd-new').value.trim();
      const confirmPass = document.getElementById('pwd-confirm').value.trim();

      if (!currentPass || !newPass || !confirmPass) {
        ShopSense.showToast('Input Error', 'Please complete all password fields.', 'danger');
        return;
      }

      if (newPass.length < 6) {
        ShopSense.showToast('Weak Password', 'New password must be at least 6 characters.', 'warning');
        return;
      }

      if (newPass !== confirmPass) {
        ShopSense.showToast('Mismatch Error', 'New passwords do not match.', 'danger');
        return;
      }

      const submitBtn = passwordForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await ShopSense.apiFetch('/api/account', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Current password is incorrect.');
        }

        passwordForm.reset();
        ShopSense.showToast('Password Changed', 'Your password has been updated securely.', 'success');
      } catch (error) {
        ShopSense.showToast('Password Update Failed', error.message || 'Could not update password.', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});

function populateAccountForm(user) {
  if (!user) return;

  if (document.getElementById('acc-fullname')) document.getElementById('acc-fullname').value = user.fullName || '';
  if (document.getElementById('acc-email')) document.getElementById('acc-email').value = user.email || '';
  if (document.getElementById('acc-phone')) document.getElementById('acc-phone').value = user.phone || '';
  if (document.getElementById('acc-shop')) document.getElementById('acc-shop').value = user.storeName || '';
  if (document.getElementById('acc-role')) document.getElementById('acc-role').value = user.role || '';
  if (document.getElementById('avatar-preview')) document.getElementById('avatar-preview').src = user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
}
