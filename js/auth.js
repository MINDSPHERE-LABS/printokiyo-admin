// PrintOkiyo Admin - Authentication & Guard

async function checkAdminAuthentication() {
  const token = sessionStorage.getItem('printokiyo_admin_token') || sessionStorage.getItem('mwm_admin_token');
  if (!token) {
    showAdminLoginScreen();
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/admin/me`, {
      headers: getAdminHeaders()
    });
    if (!res.ok) throw new Error("Invalid session");
    const data = await res.json();
    
    hideAdminLoginScreen(data.admin?.name || data.admin?.email || "Store Admin");
    loadProducts();
    loadSettings();
    startGlobalLiveVisitorsPolling();
  } catch (err) {
    sessionStorage.removeItem('printokiyo_admin_token');
    sessionStorage.removeItem('mwm_admin_token');
    showAdminLoginScreen();
  }
}

function showAdminLoginScreen() {
  const modal = document.getElementById('admin-login-modal');
  const userHeader = document.getElementById('admin-user-header');
  if (modal) modal.classList.remove('hidden');
  if (userHeader) userHeader.classList.add('hidden');
}

function hideAdminLoginScreen(adminName) {
  const modal = document.getElementById('admin-login-modal');
  const userHeader = document.getElementById('admin-user-header');
  const userName = document.getElementById('admin-user-name');
  if (modal) modal.classList.add('hidden');
  if (userHeader) userHeader.classList.remove('hidden');
  if (userName) userName.innerText = adminName || "Store Admin";
}

async function handleAdminLoginSubmit(e) {
  e.preventDefault();
  const loginIdInput = document.getElementById('admin-login-id');
  const passwordInput = document.getElementById('admin-password');
  const errorEl = document.getElementById('admin-login-error');
  const submitBtn = document.getElementById('btn-admin-login');

  const loginId = loginIdInput.value.trim();
  const password = passwordInput.value;

  if (!loginId || !password) return;

  submitBtn.disabled = true;
  submitBtn.innerText = "Authenticating...";
  if (errorEl) errorEl.style.display = "none";

  try {
    const res = await fetch(`${API_BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_id: loginId, password: password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Authentication failed.");
    }

    sessionStorage.setItem('printokiyo_admin_token', data.token);
    sessionStorage.setItem('mwm_admin_token', data.token);
    hideAdminLoginScreen(data.user?.name || data.user?.email || "Store Admin");
    showToast("Logged into Admin Console!");

    loadProducts();
    loadSettings();
    startGlobalLiveVisitorsPolling();
    switchTab('products');
  } catch (err) {
    console.error("Admin Login Error:", err);
    if (errorEl) {
      errorEl.innerText = err.message || "Invalid credentials.";
      errorEl.style.display = "block";
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Log In to Admin Console";
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem('printokiyo_admin_token');
  sessionStorage.removeItem('mwm_admin_token');
  stopOrdersAutoRefresh();
  stopAnalyticsAutoRefresh();
  stopGlobalLiveVisitorsPolling();
  showAdminLoginScreen();
  showToast("Logged out of Admin Console.");
}
