/**
 * ShopSense Account JavaScript Module
 * Handles User Profile, Avatar Image Upload Preview & Password Change Form Validation
 */

let currentAccount = null;
let newAvatarDataUrl = null;   // set only when user picks a new file

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
      if (!file) return;

      if (file.size > 1024 * 1024) {
        ShopSense.showToast('File Too Large', 'Avatar image must be under 1 MB.', 'warning');
        avatarInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        newAvatarDataUrl = evt.target.result;   // remember new selection
        avatarPreview.src = newAvatarDataUrl;
        ShopSense.showToast('Avatar Preview', 'Image selected. Click Save Profile to apply.', 'info');
      };
      reader.readAsDataURL(file);
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
      };

      // Only include avatar when the user actually picked a new file
      if (newAvatarDataUrl) {
        payload.avatar = newAvatarDataUrl;
      }

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
        newAvatarDataUrl = null;   // clear after successful save
        populateAccountForm(currentAccount);

        // Keep the cached user record (used for the topbar name + avatar) in sync
        const storedUser = JSON.parse(localStorage.getItem(ShopSense.KEYS.USER) || '{}');
        localStorage.setItem(ShopSense.KEYS.USER, JSON.stringify(Object.assign({}, storedUser, {
          fullName: data.fullName,
          email: data.email,
          avatar: data.avatar || storedUser.avatar || '',
        })));

        // Update topbar name and avatar live without a page reload
        const topbarNameElem = document.getElementById('topbar-user-name');
        if (topbarNameElem) topbarNameElem.textContent = data.fullName;

        const topbarAvatarElem = document.getElementById('topbar-user-avatar');
        if (topbarAvatarElem && data.avatar) topbarAvatarElem.src = data.avatar;

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

      if (newPass.length < 8) {
        ShopSense.showToast('Weak Password', 'New password must be at least 8 characters.', 'warning');
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
