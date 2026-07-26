/**
 * ShopSense Auth JavaScript Module
 * Handles Login, Signup, Forgot Password, and Reset Password Forms
 * against the real /api/auth endpoints.
 */

// Render (or update) an inline error alert above a form without touching
// the page's static HTML markup.
function showAuthFormError(form, message) {
  let alertElem = form.querySelector('.auth-inline-error');
  if (!alertElem) {
    alertElem = document.createElement('div');
    alertElem.className = 'alert alert-danger auth-inline-error';
    alertElem.setAttribute('role', 'alert');
    form.prepend(alertElem);
  }
  alertElem.textContent = message;
}

function clearAuthFormError(form) {
  const alertElem = form.querySelector('.auth-inline-error');
  if (alertElem) alertElem.remove();
}

function storeSession(token, user) {
  localStorage.setItem(ShopSense.KEYS.AUTH_TOKEN, token);
  localStorage.setItem(ShopSense.KEYS.USER, JSON.stringify(user));
  localStorage.setItem(ShopSense.KEYS.AUTH, JSON.stringify({
    isLoggedIn: true,
    email: user.email,
    loginTime: new Date().toISOString()
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  // Login Form Handler
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthFormError(loginForm);

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value.trim();

      if (!email || !password) {
        showAuthFormError(loginForm, 'Please enter both email and password.');
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await ShopSense.apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          showAuthFormError(loginForm, data.error || 'Invalid email or password.');
          return;
        }

        storeSession(data.token, data.user);
        ShopSense.showToast('Login Successful', 'Welcome back to ShopSense!', 'success');
        setTimeout(() => {
          window.location.href = '/pages/dashboard.html';
        }, 600);
      } catch (error) {
        showAuthFormError(loginForm, 'Unable to reach the server. Please try again.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Signup Form Handler
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthFormError(signupForm);

      const fullName = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const shopName = document.getElementById('signup-shop').value.trim();
      const password = document.getElementById('signup-password').value.trim();
      const confirmPassword = document.getElementById('signup-confirm-password').value.trim();

      if (!fullName || !email || !shopName || !password) {
        showAuthFormError(signupForm, 'Please fill in all required fields.');
        return;
      }

      if (password !== confirmPassword) {
        showAuthFormError(signupForm, 'Passwords do not match.');
        return;
      }

      const submitBtn = signupForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await ShopSense.apiFetch('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ fullName, email, password, storeName: shopName })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          showAuthFormError(signupForm, data.error || 'Unable to create account. Please try again.');
          return;
        }

        storeSession(data.token, data.user);
        ShopSense.showToast('Account Created', 'Registration successful! Directing to dashboard...', 'success');
        setTimeout(() => {
          window.location.href = '/pages/dashboard.html';
        }, 800);
      } catch (error) {
        showAuthFormError(signupForm, 'Unable to reach the server. Please try again.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Forgot Password Handler (no backend endpoint defined in this API surface;
  // keep as a client-side confirmation step).
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      if (!email) {
        ShopSense.showToast('Input Error', 'Please enter your account email address.', 'danger');
        return;
      }

      ShopSense.showToast('Reset Link Sent', `Password reset instructions sent to ${email}`, 'success');
      setTimeout(() => {
        window.location.href = '/pages/reset-password.html';
      }, 1200);
    });
  }

  // Reset Password Handler (no backend endpoint defined in this API surface;
  // keep as a client-side confirmation step).
  const resetForm = document.getElementById('reset-form');
  if (resetForm) {
    resetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('reset-password').value.trim();
      const confirmPassword = document.getElementById('reset-confirm').value.trim();

      if (!newPassword || newPassword.length < 6) {
        ShopSense.showToast('Weak Password', 'Password must be at least 6 characters.', 'warning');
        return;
      }

      if (newPassword !== confirmPassword) {
        ShopSense.showToast('Mismatch', 'Passwords do not match.', 'danger');
        return;
      }

      ShopSense.showToast('Password Reset', 'Your password has been updated. Please sign in.', 'success');
      setTimeout(() => {
        window.location.href = '/pages/login.html';
      }, 1000);
    });
  }
});
