// PrintOkiyo Admin console logic

const hostname = window.location.hostname || 'localhost';
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

// --- Dual-Backend Failover ---
const PRIMARY_BACKEND = 'https://api.printokiyo.com';
const FALLBACK_BACKEND = 'https://printokiyo-backend.onrender.com';
const LOCAL_BACKEND = `http://${hostname}:8000`;

let BACKEND_BASE = isLocal ? LOCAL_BACKEND : PRIMARY_BACKEND;
let API_BASE_URL = `${BACKEND_BASE}/api`;
let HEALTH_URL = `${BACKEND_BASE}/health`;

// Silent health check: if primary is down, auto-switch to fallback
let _backendReady = Promise.resolve();
if (!isLocal) {
  _backendReady = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${PRIMARY_BACKEND}/health`, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error();
      console.log('[PrintOkiyo Admin] Using primary backend:', PRIMARY_BACKEND);
    } catch {
      BACKEND_BASE = FALLBACK_BACKEND;
      API_BASE_URL = `${FALLBACK_BACKEND}/api`;
      HEALTH_URL = `${FALLBACK_BACKEND}/health`;
      console.log('[PrintOkiyo Admin] Primary unreachable, using fallback:', FALLBACK_BACKEND);
    }
  })();
}

function getAdminHeaders() {
  const token = sessionStorage.getItem('printokiyo_admin_token') || sessionStorage.getItem('mwm_admin_token') || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// State
let products = [];
let orders = [];
let users = [];
let analyticsData = null;
let isEditing = false;
let currentFormImages = [];
let selectedAdminCategory = 'ALL';

// DOM Elements
const productsView = document.getElementById('products-view');
const adminCategoryFilterBar = document.getElementById('admin-category-filter-bar');
const emptyState = document.getElementById('empty-state');
const formDrawer = document.getElementById('form-drawer');
const productForm = document.getElementById('product-form');
const drawerTitle = document.getElementById('drawer-title');
const imagePreviewContainer = document.getElementById('image-preview-container');
const toastEl = document.getElementById('toast');
const apiStatusText = document.getElementById('api-status-text');
const statusDot = document.querySelector('.status-dot');

// Tab Navigation Elements
const tabBtnProducts = document.getElementById('tab-btn-products');
const tabBtnOrders = document.getElementById('tab-btn-orders');
const tabBtnAnalytics = document.getElementById('tab-btn-analytics');
const productsTabSection = document.getElementById('products-tab-section');
const ordersTabSection = document.getElementById('orders-tab-section');
const analyticsTabSection = document.getElementById('analytics-tab-section');

// Orders Elements
const ordersListBody = document.getElementById('orders-list-body');
const orderSearchInput = document.getElementById('order-search');

// Analytics & Users Elements
const usersListBody = document.getElementById('users-list-body');
const userSearchInput = document.getElementById('user-search');

const statMonthlyRevenue = document.getElementById('stat-monthly-revenue');
const statFyRevenue = document.getElementById('stat-fy-revenue');
const statFyLabel = document.getElementById('stat-fy-label');
const statTotalUsers = document.getElementById('stat-total-users');
const statTotalOrders = document.getElementById('stat-total-orders');
const revenueChartContainer = document.getElementById('revenue-chart-container');

// Invoice Modal Elements
const invoiceModal = document.getElementById('invoice-modal');
const invoiceCloseBackdrop = document.getElementById('invoice-close-backdrop');
const btnPrintInvoice = document.getElementById('btn-print-invoice');
const btnCloseInvoice = document.getElementById('btn-close-invoice');

// Settings Elements
const settingsForm = document.getElementById('settings-form');
const inputSettingsThreshold = document.getElementById('settings-threshold');
const inputSettingsCharge = document.getElementById('settings-charge');
const inputSettingsCodFee = document.getElementById('settings-cod-fee');
const inputSettingsCod = document.getElementById('settings-cod');

// Input fields
const inputId = document.getElementById('product-id');
const inputTitle = document.getElementById('title');
const inputSlug = document.getElementById('slug');
const inputSku = document.getElementById('SKU');
const inputShortDesc = document.getElementById('short_description');
const inputDesc = document.getElementById('description');
const inputPrice = document.getElementById('price');
const inputDiscountPrice = document.getElementById('discount_price');
const inputStock = document.getElementById('stock');
const inputProdTime = document.getElementById('production_time');
const inputRating = document.getElementById('rating');
const inputFile = document.getElementById('thumbnail-file');
const inputThumbnailHidden = document.getElementById('thumbnail');
const inputGalleryHidden = document.getElementById('gallery');
const uploadStatusText = document.getElementById('upload-status');
const inputCategory = document.getElementById('category');
const inputMaterial = document.getElementById('material');
const inputDimensions = document.getElementById('dimensions');
const inputPinnedToTop = document.getElementById('pinned_to_top');
const inputHasCustomOptions = document.getElementById('has_custom_options');
const customOptionsExpand = document.getElementById('custom-options-expand');
const inputAllowPhotoUpload = document.getElementById('allow_photo_upload');
const inputAllowSizeVariants = document.getElementById('allow_size_variants');
const sizeVariantsContainer = document.getElementById('size-variants-container');
const sizeVariantsList = document.getElementById('size-variants-list');
const btnAddSizeVariant = document.getElementById('btn-add-size-variant');
const inputAllowQuantity = document.getElementById('allow_quantity');
const inputDisableCod = document.getElementById('disable_cod');

// Buttons
const btnAddProduct = document.getElementById('btn-add-product');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const btnCancelForm = document.getElementById('btn-cancel-form');
const drawerCloseBackdrop = document.getElementById('drawer-close-backdrop');

// Helper to resolve relative path images to the backend uvicorn domain
function getImageUrl(url) {
  if (!url) return '';
  
  if (!isLocal && (url.startsWith('http://localhost:8000') || url.startsWith('http://127.0.0.1:8000'))) {
    url = url.replace(/http:\/\/(localhost|127\.0\.0\.1):8000/, BACKEND_BASE);
  }

  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  return `${BACKEND_BASE}${cleanUrl}`;
}

// Initialize Console
document.addEventListener('DOMContentLoaded', async () => {
  await _backendReady;
  checkApiHealth();
  setupEventListeners();
  checkAdminAuthentication();
});

// Admin Authentication Functions & Guard
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
  showAdminLoginScreen();
  showToast("Logged out of Admin Console.");
}

function renderSizeVariantRow(name = '', price = '') {
  if (!sizeVariantsList) return;
  const row = document.createElement('div');
  row.className = 'size-variant-row';
  row.style.display = 'flex';
  row.style.gap = '6px';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <input type="text" class="variant-name-input" placeholder="Size Name (e.g. Small 4x4 in)" value="${escapeHTML(name)}" style="flex: 2; padding: 6px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px;">
    <input type="number" class="variant-price-input" placeholder="Price (₹)" value="${price}" style="flex: 1; padding: 6px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px;">
    <button type="button" class="btn-remove-variant" style="background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; font-weight: 700;">✕</button>
  `;
  row.querySelector('.btn-remove-variant').addEventListener('click', () => row.remove());
  sizeVariantsList.appendChild(row);
}

function getSizeVariantsData() {
  if (!sizeVariantsList) return [];
  const rows = sizeVariantsList.querySelectorAll('.size-variant-row');
  const variants = [];
  rows.forEach(row => {
    const nameInput = row.querySelector('.variant-name-input');
    const priceInput = row.querySelector('.variant-price-input');
    const name = nameInput ? nameInput.value.trim() : '';
    const price = priceInput ? parseFloat(priceInput.value) : 0;
    if (name) {
      variants.push({ name, price: isNaN(price) ? 0 : price });
    }
  });
  return variants;
}

// Event Listeners setup
function setupEventListeners() {
  // Category select change listener for new category creation
  const inputCategorySelect = document.getElementById('category');
  const newCategoryContainer = document.getElementById('new_category_container');
  const newCategoryInput = document.getElementById('new_category_input');

  if (inputCategorySelect && newCategoryContainer) {
    inputCategorySelect.addEventListener('change', (e) => {
      if (e.target.value === '__NEW__') {
        newCategoryContainer.style.display = 'block';
        if (newCategoryInput) newCategoryInput.focus();
      } else {
        newCategoryContainer.style.display = 'none';
      }
    });
  }

  // Custom Product Options Toggles
  if (inputHasCustomOptions) {
    inputHasCustomOptions.addEventListener('change', (e) => {
      if (customOptionsExpand) {
        customOptionsExpand.style.display = e.target.checked ? 'flex' : 'none';
      }
    });
  }

  if (inputAllowSizeVariants) {
    inputAllowSizeVariants.addEventListener('change', (e) => {
      if (sizeVariantsContainer) {
        sizeVariantsContainer.style.display = e.target.checked ? 'flex' : 'none';
      }
    });
  }

  if (btnAddSizeVariant) {
    btnAddSizeVariant.addEventListener('click', () => {
      renderSizeVariantRow();
    });
  }
  // Admin login & logout listeners
  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', handleAdminLoginSubmit);
  }

  const btnLogout = document.getElementById('btn-admin-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleAdminLogout);
  }

  // Tab Routing listeners
  tabBtnProducts.addEventListener('click', () => switchTab('products'));
  tabBtnOrders.addEventListener('click', () => switchTab('orders'));
  if (tabBtnAnalytics) {
    tabBtnAnalytics.addEventListener('click', () => switchTab('analytics'));
  }

  // Excel / CSV Export Listeners
  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', handleExportOrdersExcel);
  }

  const btnExportCustomers = document.getElementById('btn-export-customers');
  if (btnExportCustomers) {
    btnExportCustomers.addEventListener('click', handleExportCustomersExcel);
  }

  // Drawer toggles
  btnAddProduct.addEventListener('click', openAddDrawer);
  btnCloseDrawer.addEventListener('click', closeDrawer);
  btnCancelForm.addEventListener('click', closeDrawer);
  drawerCloseBackdrop.addEventListener('click', closeDrawer);

  // Auto-slug generation from Title input
  inputTitle.addEventListener('input', (e) => {
    if (!isEditing) {
      inputSlug.value = generateSlug(e.target.value);
    }
  });

  // Handle image file uploading dynamically
  inputFile.addEventListener('change', handleImageUpload);

  // Set Out of Stock button
  document.getElementById('btn-out-of-stock').addEventListener('click', () => {
    document.getElementById('stock').value = 0;
  });

  // Settings form submission
  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSettingsSubmit);
  }

  // Form submission
  productForm.addEventListener('submit', handleFormSubmit);

  // Search listeners
  orderSearchInput.addEventListener('input', handleOrderSearch);
  if (userSearchInput) {
    userSearchInput.addEventListener('input', handleUserSearch);
  }

  // Invoice modal listeners
  btnCloseInvoice.addEventListener('click', closeInvoice);
  invoiceCloseBackdrop.addEventListener('click', closeInvoice);
  btnPrintInvoice.addEventListener('click', printInvoice);
}

// API Health Check
async function checkApiHealth() {
  try {
    const res = await fetch(HEALTH_URL);
    if (res.ok) {
      apiStatusText.innerText = "FastAPI is online & responsive";
      statusDot.className = "status-dot green";
    } else {
      throw new Error();
    }
  } catch (err) {
    apiStatusText.innerText = "Backend offline. Check console log.";
    statusDot.className = "status-dot red";
  }
}

// Toast notification helper
function showToast(message) {
  toastEl.innerText = message;
  toastEl.classList.remove('hidden');
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2500);
}

// Generate URL slug from text
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
}

// HTML entity escaping helper for XSS protection
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Convert order status to CSS class name
function getOrderStatusClass(status) {
  const s = (status || 'processing').toLowerCase().trim().replace(/\s+/g, '-');
  return `status-${s}`;
}

// Render Form Image Previews & Removal Gallery
function renderFormImagePreviews() {
  if (!imagePreviewContainer) return;
  imagePreviewContainer.innerHTML = '';

  if (!currentFormImages || currentFormImages.length === 0) {
    inputThumbnailHidden.value = '';
    inputGalleryHidden.value = '';
    uploadStatusText.innerText = 'No images attached yet. Select images above.';
    uploadStatusText.style.color = 'var(--text-muted)';
    return;
  }

  // Update hidden form inputs
  inputThumbnailHidden.value = currentFormImages[0];
  inputGalleryHidden.value = JSON.stringify(currentFormImages);

  uploadStatusText.innerText = `${currentFormImages.length} image(s) attached to product.`;
  uploadStatusText.style.color = 'var(--green)';

  currentFormImages.forEach((imgUrl, idx) => {
    const card = document.createElement('div');
    card.className = 'preview-thumb-card';
    card.innerHTML = `
      <img src="${getImageUrl(imgUrl)}" alt="Product Image ${idx + 1}">
      <button type="button" class="btn-remove-img" data-index="${idx}" title="Remove this image">✕</button>
      ${idx === 0 ? `<span class="primary-badge">MAIN</span>` : ''}
    `;

    const removeBtn = card.querySelector('.btn-remove-img');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFormImage(idx);
    });

    imagePreviewContainer.appendChild(card);
  });
}

function removeFormImage(index) {
  if (index >= 0 && index < currentFormImages.length) {
    currentFormImages.splice(index, 1);
    showToast('Image removed from product.');
    renderFormImagePreviews();
  }
}

function compressImageToBase64(file, maxWidth = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Invalid image file format'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

// Handle Image Files Uploading to Cloudflare R2 via Backend API
async function handleImageUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  uploadStatusText.innerText = `Uploading ${files.length} image(s) to Cloudflare R2...`;
  uploadStatusText.style.color = "var(--text-muted)";

  const newUrls = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const token = sessionStorage.getItem('mwm_admin_token') || '';
        const res = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.url) {
            newUrls.push(data.url);
            console.log('[Admin Upload] Successfully uploaded to Cloudflare R2:', data.url);
            continue;
          }
        }
      } catch (uploadErr) {
        console.warn('[Admin Upload] API upload failed, falling back to local base64:', uploadErr);
      }

      // Fallback to base64 if API upload failed
      const base64DataUrl = await compressImageToBase64(file);
      newUrls.push(base64DataUrl);
    }

    currentFormImages = [...currentFormImages, ...newUrls];
    inputFile.value = ''; // Reset file input
    renderFormImagePreviews();
    showToast(`Uploaded ${newUrls.length} image(s) to Cloudflare R2!`);
    uploadStatusText.innerText = "";
  } catch (err) {
    console.error("Image processing error:", err);
    uploadStatusText.innerText = "Error uploading image(s).";
    uploadStatusText.style.color = "var(--red)";
  }
}

// Fetch all products from Backend API
async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE_URL}/products`);
    if (!res.ok) throw new Error("Could not load products");
    products = await res.json();
    populateCategoryDropdown();
    renderProducts();
  } catch (err) {
    console.error(err);
    showToast("Error loading catalog.");
    productsView.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
  }
}

// Populate Category Select Dropdown dynamically with default & custom categories
function populateCategoryDropdown(selectedVal = '') {
  const select = document.getElementById('category');
  const newCategoryContainer = document.getElementById('new_category_container');
  const newCategoryInput = document.getElementById('new_category_input');
  if (!select) return;

  const defaultCats = [
    "Anime & Gaming",
    "Superhero",
    "Supercars",
    "Superbike",
    "Cricket",
    "Devotional",
    "Gym & Fitness",
    "Music",
    "Headphone Stands",
    "Lithophane",
    "Home Decor",
    "Desk Setup"
  ];

  const categorySet = new Set(defaultCats);
  if (products && Array.isArray(products)) {
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        categorySet.add(p.category.trim());
      }
    });
  }

  if (selectedVal && selectedVal !== '__NEW__' && !categorySet.has(selectedVal)) {
    categorySet.add(selectedVal);
  }

  const categoryOptions = Array.from(categorySet).map(cat => 
    `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`
  );
  categoryOptions.push(`<option value="__NEW__">➕ Create New Category...</option>`);

  select.innerHTML = categoryOptions.join('');

  if (selectedVal) {
    if (categorySet.has(selectedVal)) {
      select.value = selectedVal;
      if (newCategoryContainer) newCategoryContainer.style.display = 'none';
    } else {
      select.value = '__NEW__';
      if (newCategoryContainer) {
        newCategoryContainer.style.display = 'block';
        if (newCategoryInput) newCategoryInput.value = selectedVal;
      }
    }
  } else {
    select.value = "Anime & Gaming";
    if (newCategoryContainer) newCategoryContainer.style.display = 'none';
  }
}

// Render Admin Category Filter Bar
function renderAdminCategoryFilterBar() {
  if (!adminCategoryFilterBar) return;
  adminCategoryFilterBar.innerHTML = '';

  if (!products || products.length === 0) {
    adminCategoryFilterBar.style.display = 'none';
    return;
  }

  adminCategoryFilterBar.style.display = 'flex';

  const categoryCounts = {};
  products.forEach(p => {
    const cat = (p.category && p.category.trim()) ? p.category.trim() : 'General';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const categories = Object.keys(categoryCounts);

  // 'All' button
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  const isAllSelected = selectedAdminCategory === 'ALL';
  allBtn.style.cssText = `padding: 6px 14px; font-size: 11px; font-weight: 800; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: all 0.2s; border: 1px solid ${isAllSelected ? '#0f172a' : 'var(--border-color)'}; background: ${isAllSelected ? '#0f172a' : 'var(--bg-card)'}; color: ${isAllSelected ? '#ffffff' : 'var(--text-color)'};`;
  allBtn.innerHTML = `All Products (${products.length})`;
  allBtn.addEventListener('click', () => {
    selectedAdminCategory = 'ALL';
    renderAdminCategoryFilterBar();
    renderProducts();
  });
  adminCategoryFilterBar.appendChild(allBtn);

  // Category buttons
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = selectedAdminCategory === cat;
    btn.style.cssText = `padding: 6px 14px; font-size: 11px; font-weight: 800; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: all 0.2s; border: 1px solid ${isSelected ? '#0f172a' : 'var(--border-color)'}; background: ${isSelected ? '#0f172a' : 'var(--bg-card)'}; color: ${isSelected ? '#ffffff' : 'var(--text-color)'};`;
    btn.innerHTML = `📂 ${escapeHTML(cat)} (${categoryCounts[cat]})`;
    btn.addEventListener('click', () => {
      selectedAdminCategory = cat;
      renderAdminCategoryFilterBar();
      renderProducts();
    });
    adminCategoryFilterBar.appendChild(btn);
  });
}

// Render Products Category-Wise Grid
function renderProducts() {
  renderAdminCategoryFilterBar();
  productsView.innerHTML = '';
  
  if (!products || products.length === 0) {
    productsView.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  productsView.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  // Filter products by selected admin category
  let filteredProducts = products;
  if (selectedAdminCategory !== 'ALL') {
    filteredProducts = products.filter(p => (p.category && p.category.trim() ? p.category.trim() : 'General') === selectedAdminCategory);
  }

  if (filteredProducts.length === 0) {
    productsView.innerHTML = `
      <div style="text-align: center; padding: 30px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); color: var(--text-muted); font-size: 12px; font-weight: 600;">
        No products found in category "${escapeHTML(selectedAdminCategory)}".
      </div>
    `;
    return;
  }

  // Group products category-wise
  const categoryGroups = {};
  filteredProducts.forEach(product => {
    const catName = (product.category && product.category.trim()) ? product.category.trim() : 'General';
    if (!categoryGroups[catName]) {
      categoryGroups[catName] = [];
    }
    categoryGroups[catName].push(product);
  });

  // Render each category section
  Object.keys(categoryGroups).forEach(catName => {
    const catProducts = categoryGroups[catName];

    // Section header
    const sectionHeader = document.createElement('div');
    sectionHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-top: 24px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border-color);";
    sectionHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--display); font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-main);">
          📁 ${escapeHTML(catName)}
        </span>
        <span style="font-size: 10px; font-weight: 800; background: #0f172a; color: #ffffff; padding: 2px 8px; border-radius: 10px;">
          ${catProducts.length} ${catProducts.length === 1 ? 'Product' : 'Products'}
        </span>
      </div>
    `;
    productsView.appendChild(sectionHeader);

    // Section grid
    const gridDiv = document.createElement('div');
    gridDiv.className = 'products-grid';

    catProducts.forEach(product => {
      const isOutOfStock = product.stock <= 0;
      const hasDiscount = Boolean(product.discount_price && product.discount_price < product.price);
      const discountPercent = hasDiscount ? Math.round(((product.price - product.discount_price) / product.price) * 100) : 0;
      
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="card-media">
          ${product.pinned_to_top ? `<span class="card-badge" style="background:#0f172a; color:#ffffff; font-weight:800;">📌 Pinned</span>` : (hasDiscount ? `<span class="card-badge" style="background:#dc2626; color:#ffffff;">${discountPercent}% OFF</span>` : (product.new_arrival ? `<span class="card-badge">New</span>` : ''))}
          <img src="${getImageUrl(product.thumbnail)}" alt="${escapeHTML(product.title)}">
          
          <!-- Hover actions -->
          <div class="card-actions">
            <button class="action-btn copy-link" data-slug="${product.slug}" style="background: #0284c7; color: white;">🔗 Link</button>
            <button class="action-btn edit" data-id="${product.id || product._id}">Edit</button>
            <button class="action-btn delete" data-id="${product.id || product._id}">Delete</button>
          </div>
        </div>
        
        <div class="card-details">
          <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">
            ${escapeHTML(product.category || 'General')}
          </span>
          <h4 class="card-title" title="${escapeHTML(product.title)}">${escapeHTML(product.title)}</h4>
          <div class="card-info" style="flex-direction: column; align-items: flex-start; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              ${hasDiscount ? `
                <span class="card-price" style="font-weight: 800; color: #16a34a; font-size: 13px;">₹${product.discount_price.toLocaleString('en-IN')}</span>
                <span style="font-size: 11px; text-decoration: line-through; color: #94a3b8;">₹${product.price.toLocaleString('en-IN')}</span>
                <span style="font-size: 9px; font-weight: 800; background: #dcfce7; color: #15803d; padding: 1px 5px; border-radius: 4px;">${discountPercent}% OFF</span>
              ` : `
                <span class="card-price" style="font-weight: 800; font-size: 13px;">₹${product.price.toLocaleString('en-IN')}</span>
              `}
            </div>
            <span class="card-stock ${isOutOfStock ? 'out-stock' : 'in-stock'}">
              ${isOutOfStock ? 'Out of Stock' : `${product.stock} Stock`}
            </span>
          </div>
        </div>
      `;
      
      card.querySelector('.copy-link')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const link = `https://printokiyo.com/?product=${product.slug}`;
        navigator.clipboard.writeText(link);
        showToast(`🔗 Copied link for "${product.title}"!`);
      });
      card.querySelector('.edit').addEventListener('click', () => openEditDrawer(product.id || product._id));
      card.querySelector('.delete').addEventListener('click', () => handleDeleteProduct(product.id || product._id));
      
      gridDiv.appendChild(card);
    });

    productsView.appendChild(gridDiv);
  });
}

// Reset form fields to defaults
function resetForm() {
  productForm.reset();
  inputId.value = '';
  inputTitle.value = '';
  inputSlug.value = '';
  inputSku.value = '';
  inputShortDesc.value = '';
  inputDesc.value = '';
  inputPrice.value = '';
  inputDiscountPrice.value = '';
  inputStock.value = '10';
  inputProdTime.value = '2-3 Days';
  inputRating.value = '5.0';
  inputFile.value = '';
  inputThumbnailHidden.value = '';
  inputGalleryHidden.value = '';
  inputCategory.value = 'Anime & Gaming';
  populateCategoryDropdown('Anime & Gaming');
  if (inputMaterial) inputMaterial.value = '';
  if (inputDimensions) inputDimensions.value = '';
  if (inputPinnedToTop) inputPinnedToTop.checked = false;
  const inputShowBestValuePacks = document.getElementById('show_best_value_packs');
  if (inputShowBestValuePacks) inputShowBestValuePacks.checked = true;
  if (inputHasCustomOptions) inputHasCustomOptions.checked = false;
  if (customOptionsExpand) customOptionsExpand.style.display = 'none';
  if (inputAllowPhotoUpload) inputAllowPhotoUpload.checked = false;
  if (inputAllowSizeVariants) inputAllowSizeVariants.checked = false;
  if (sizeVariantsContainer) sizeVariantsContainer.style.display = 'none';
  if (sizeVariantsList) sizeVariantsList.innerHTML = '';
  if (inputAllowQuantity) inputAllowQuantity.checked = true;
  if (inputDisableCod) inputDisableCod.checked = false;
  currentFormImages = [];
  renderFormImagePreviews();
}

// Drawer visibility managers
function openAddDrawer() {
  isEditing = false;
  resetForm();
  drawerTitle.innerText = "Add New Product";
  inputSku.value = "MWM-" + Math.floor(1000 + Math.random() * 9000);
  formDrawer.classList.remove('hidden');
}

function openEditDrawer(id) {
  isEditing = true;
  const product = products.find(p => (p.id || p._id) === id);
  if (!product) return;

  drawerTitle.innerText = "Edit Product Details";
  
  inputId.value = product.id || product._id;
  inputTitle.value = product.title;
  inputSlug.value = product.slug;
  inputSku.value = product.SKU;
  inputShortDesc.value = product.short_description || '';
  inputDesc.value = product.description || '';
  if (inputMaterial) inputMaterial.value = product.material || '';
  if (inputDimensions) inputDimensions.value = product.dimensions || '';
  if (inputPinnedToTop) inputPinnedToTop.checked = Boolean(product.pinned_to_top);
  
  const inputShowBestValuePacks = document.getElementById('show_best_value_packs');
  if (inputShowBestValuePacks) {
    inputShowBestValuePacks.checked = product.show_best_value_packs !== false;
  }

  inputPrice.value = product.price;
  inputDiscountPrice.value = product.discount_price || '';
  inputStock.value = product.stock;
  inputProdTime.value = product.production_time;
  inputRating.value = product.rating !== undefined ? product.rating : '5.0';
  populateCategoryDropdown(product.category || 'Anime & Gaming');
  
  if (inputHasCustomOptions) {
    const hasCustom = Boolean(product.has_custom_options);
    inputHasCustomOptions.checked = hasCustom;
    if (customOptionsExpand) customOptionsExpand.style.display = hasCustom ? 'flex' : 'none';
  }
  if (inputAllowPhotoUpload) {
    inputAllowPhotoUpload.checked = Boolean(product.allow_photo_upload);
  }
  if (inputAllowSizeVariants) {
    const hasSizes = Boolean(product.allow_size_variants);
    inputAllowSizeVariants.checked = hasSizes;
    if (sizeVariantsContainer) sizeVariantsContainer.style.display = hasSizes ? 'flex' : 'none';
  }
  if (sizeVariantsList) {
    sizeVariantsList.innerHTML = '';
    if (product.size_variants && Array.isArray(product.size_variants)) {
      product.size_variants.forEach(sv => renderSizeVariantRow(sv.name, sv.price));
    }
  }
  if (inputAllowQuantity) {
    inputAllowQuantity.checked = product.allow_quantity !== undefined ? Boolean(product.allow_quantity) : true;
  }
  if (inputDisableCod) {
    inputDisableCod.checked = Boolean(product.disable_cod);
  }
  
  inputFile.value = '';
  
  if (product.gallery && Array.isArray(product.gallery) && product.gallery.length > 0) {
    currentFormImages = [...product.gallery];
  } else if (product.thumbnail) {
    currentFormImages = [product.thumbnail];
  } else {
    currentFormImages = [];
  }

  renderFormImagePreviews();
  formDrawer.classList.remove('hidden');
}

function closeDrawer() {
  formDrawer.classList.add('hidden');
}

// Handle Form Submit (Add / Edit API requests)
async function handleFormSubmit(e) {
  e.preventDefault();

  const id = inputId.value;
  const thumbUrl = currentFormImages.length > 0 ? currentFormImages[0] : (inputThumbnailHidden.value || '');
  const galleryArray = currentFormImages.length > 0 ? currentFormImages : [thumbUrl];

  const inputCategorySelect = document.getElementById('category');
  const newCategoryInput = document.getElementById('new_category_input');
  let finalCategory = inputCategorySelect ? inputCategorySelect.value : 'Anime & Gaming';
  if (finalCategory === '__NEW__') {
    finalCategory = (newCategoryInput && newCategoryInput.value.trim()) ? newCategoryInput.value.trim() : 'General';
  }

  const inputShowBestValuePacks = document.getElementById('show_best_value_packs');
  const showBestValuePacksVal = inputShowBestValuePacks ? inputShowBestValuePacks.checked : true;

  // Construct payload with dynamic rating and gallery
  const productPayload = {
    title: inputTitle.value,
    slug: inputSlug.value,
    short_description: inputShortDesc.value,
    description: inputDesc.value,
    price: parseFloat(inputPrice.value),
    discount_price: inputDiscountPrice.value ? parseFloat(inputDiscountPrice.value) : null,
    category: finalCategory,
    show_best_value_packs: showBestValuePacksVal,
    subcategory: "3D Creation",
    tags: ["3dprint", "premium", "home-decor"],
    thumbnail: thumbUrl,
    gallery: galleryArray,
    videos: [],
    available_colors: ["Classic Grey", "Frost White"],
    available_sizes: ["Standard"],
    material: inputMaterial && inputMaterial.value ? inputMaterial.value : "Premium PLA+",
    print_quality: "0.16mm Fine",
    production_time: inputProdTime.value,
    stock: parseInt(inputStock.value),
    SKU: inputSku.value,
    weight: 250.0,
    dimensions: inputDimensions && inputDimensions.value ? inputDimensions.value : "Standard Size",
    shipping_weight: 400.0,
    featured: true,
    new_arrival: true,
    best_seller: false,
    published: true,
    pinned_to_top: inputPinnedToTop ? inputPinnedToTop.checked : false,
    has_custom_options: inputHasCustomOptions ? inputHasCustomOptions.checked : false,
    allow_photo_upload: inputAllowPhotoUpload ? inputAllowPhotoUpload.checked : false,
    allow_size_variants: inputAllowSizeVariants ? inputAllowSizeVariants.checked : false,
    size_variants: getSizeVariantsData(),
    allow_quantity: inputAllowQuantity ? inputAllowQuantity.checked : true,
    disable_cod: inputDisableCod ? inputDisableCod.checked : false,
    rating: parseFloat(inputRating.value)
  };

  try {
    let url = `${API_BASE_URL}/products`;
    let method = 'POST';

    if (isEditing && id) {
      url = `${API_BASE_URL}/products/${id}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method: method,
      headers: getAdminHeaders(),
      body: JSON.stringify(productPayload)
    });

    if (!res.ok) {
      const errorData = await res.json();
      let errorMsg = "Request failed";
      if (errorData && errorData.detail) {
        if (typeof errorData.detail === 'string') {
          errorMsg = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMsg = errorData.detail.map(d => `${d.loc.slice(1).join('.')}: ${d.msg}`).join(', ');
        }
      }
      throw new Error(errorMsg);
    }

    showToast(isEditing ? "Product updated!" : "New product published!");
    closeDrawer();
    loadProducts();
  } catch (err) {
    console.error(err);
    showToast(`Error: ${err.message}`);
  }
}

// Handle Delete Product API Request
async function handleDeleteProduct(id) {
  const product = products.find(p => (p.id || p._id) === id);
  if (!product) return;

  const confirmDelete = confirm(`Are you sure you want to permanently delete "${product.title}"?`);
  if (!confirmDelete) return;

  try {
    const res = await fetch(`${API_BASE_URL}/products/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });

    if (res.ok) {
      showToast("Product deleted successfully!");
      loadProducts();
    } else {
      throw new Error("Could not delete");
    }
  } catch (err) {
    console.error(err);
    showToast("Error deleting product.");
  }
}

// Fetch store settings from Backend API
async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE_URL}/settings`);
    if (!res.ok) throw new Error("Could not load settings");
    const settings = await res.json();
    inputSettingsThreshold.value = settings.delivery_charge_threshold;
    inputSettingsCharge.value = settings.delivery_charge;
    if (inputSettingsCodFee) inputSettingsCodFee.value = settings.cod_fee !== undefined ? settings.cod_fee : 40;
    inputSettingsCod.checked = settings.cod_enabled;
  } catch (err) {
    console.error("Error loading store settings:", err);
    showToast("Error loading store configurations.");
  }
}

// Handle Settings Form Submit
async function handleSettingsSubmit(e) {
  e.preventDefault();
  const threshold = parseFloat(inputSettingsThreshold.value);
  const charge = parseFloat(inputSettingsCharge.value);
  const codFee = inputSettingsCodFee ? parseFloat(inputSettingsCodFee.value) : 40.0;
  const codEnabled = inputSettingsCod.checked;

  try {
    const res = await fetch(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({
        delivery_charge_threshold: threshold,
        delivery_charge: charge,
        cod_fee: codFee,
        cod_enabled: codEnabled
      })
    });

    if (!res.ok) throw new Error("Could not update settings");
    const updated = await res.json();
    showToast("Store configurations updated!");
    
    // update inputs
    inputSettingsThreshold.value = updated.delivery_charge_threshold;
    inputSettingsCharge.value = updated.delivery_charge;
    if (inputSettingsCodFee) inputSettingsCodFee.value = updated.cod_fee !== undefined ? updated.cod_fee : 40;
    inputSettingsCod.checked = updated.cod_enabled;
  } catch (err) {
    console.error("Error saving configurations:", err);
    showToast("Error saving configurations.");
  }
}

let ordersPollInterval = null;
let lastKnownOrdersCount = 0;

let analyticsPollInterval = null;
let lastKnownUsersCount = 0;
let lastKnownMonthlyRevenue = -1;

function startAnalyticsAutoRefresh() {
  if (!analyticsPollInterval) {
    analyticsPollInterval = setInterval(() => {
      loadAnalyticsAndUsers(true);
    }, 5000);
  }
}

function stopAnalyticsAutoRefresh() {
  if (analyticsPollInterval) {
    clearInterval(analyticsPollInterval);
    analyticsPollInterval = null;
  }
}

// Switch Console Tabs
function switchTab(tab) {
  if (tab === 'products') {
    tabBtnProducts.classList.add('active');
    tabBtnOrders.classList.remove('active');
    if (tabBtnAnalytics) tabBtnAnalytics.classList.remove('active');

    productsTabSection.classList.remove('hidden');
    ordersTabSection.classList.add('hidden');
    if (analyticsTabSection) analyticsTabSection.classList.add('hidden');
    stopOrdersAutoRefresh();
    stopAnalyticsAutoRefresh();
  } else if (tab === 'orders') {
    tabBtnProducts.classList.remove('active');
    tabBtnOrders.classList.add('active');
    if (tabBtnAnalytics) tabBtnAnalytics.classList.remove('active');

    productsTabSection.classList.add('hidden');
    ordersTabSection.classList.remove('hidden');
    if (analyticsTabSection) analyticsTabSection.classList.add('hidden');
    stopAnalyticsAutoRefresh();
    loadOrders(false);
    startOrdersAutoRefresh();
  } else if (tab === 'analytics') {
    tabBtnProducts.classList.remove('active');
    tabBtnOrders.classList.remove('active');
    if (tabBtnAnalytics) tabBtnAnalytics.classList.add('active');

    productsTabSection.classList.add('hidden');
    ordersTabSection.classList.add('hidden');
    if (analyticsTabSection) analyticsTabSection.classList.remove('hidden');
    stopOrdersAutoRefresh();
    loadAnalyticsAndUsers(false);
    startAnalyticsAutoRefresh();
  }
}

// Fetch Analytics metrics & Registered Users list (Supports silent live auto-sync)
async function loadAnalyticsAndUsers(silent = false) {
  try {
    const headers = getAdminHeaders();
    
    const [analyticsRes, usersRes] = await Promise.all([
      fetch(`${API_BASE_URL}/admin/analytics`, { headers }),
      fetch(`${API_BASE_URL}/admin/users`, { headers })
    ]);

    if (analyticsRes.ok) {
      const freshAnalytics = await analyticsRes.json();

      if (silent && lastKnownMonthlyRevenue >= 0 && freshAnalytics.monthly_revenue > lastKnownMonthlyRevenue) {
        const diff = freshAnalytics.monthly_revenue - lastKnownMonthlyRevenue;
        showToast(`💳 Payment Captured! +₹${diff.toLocaleString('en-IN')} added to earnings!`);
      }

      lastKnownMonthlyRevenue = freshAnalytics.monthly_revenue;
      analyticsData = freshAnalytics;

      if (statMonthlyRevenue) statMonthlyRevenue.innerText = `₹${(analyticsData.monthly_revenue || 0).toLocaleString('en-IN')}`;
      if (statFyRevenue) statFyRevenue.innerText = `₹${(analyticsData.fy_revenue || 0).toLocaleString('en-IN')}`;
      if (statFyLabel && analyticsData.financial_year_label) {
        statFyLabel.innerText = `${analyticsData.financial_year_label} Revenue`;
      }
      if (statTotalUsers) statTotalUsers.innerText = (analyticsData.total_users || 0).toLocaleString('en-IN');
      if (statTotalOrders) statTotalOrders.innerText = (analyticsData.total_orders || 0).toLocaleString('en-IN');

      renderRevenueChart(analyticsData.monthly_chart || []);
    }

    if (usersRes.ok) {
      const freshUsers = await usersRes.json();

      if (silent && freshUsers.length > lastKnownUsersCount && lastKnownUsersCount > 0) {
        const newCount = freshUsers.length - lastKnownUsersCount;
        showToast(`👤 ${newCount} New Customer registered!`);
      }

      lastKnownUsersCount = freshUsers.length;
      users = freshUsers;

      const activeEl = document.activeElement;
      const isUserEditing = activeEl && activeEl.id === 'user-search';
      if (!isUserEditing) {
        if (userSearchInput && userSearchInput.value.trim()) {
          handleUserSearch({ target: userSearchInput });
        } else {
          renderUsers(users);
        }
      }
    }
  } catch (err) {
    if (!silent) {
      console.error("Error loading analytics or users:", err);
      showToast("Error loading analytics & customer directory.");
    }
  }
}

// Render Monthly Revenue Financial Chart
function renderRevenueChart(chartData) {
  if (!revenueChartContainer) return;
  revenueChartContainer.innerHTML = '';

  if (!chartData || chartData.length === 0) {
    revenueChartContainer.innerHTML = '<div style="margin: auto; color: var(--text-muted); font-size: 11px; font-weight: 600;">No financial data recorded yet</div>';
    return;
  }

  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 100);

  chartData.forEach(item => {
    const heightPct = Math.max(4, Math.round((item.revenue / maxRevenue) * 100));
    const formattedVal = item.revenue > 0 ? `₹${item.revenue >= 1000 ? (item.revenue/1000).toFixed(1) + 'k' : item.revenue}` : '₹0';

    const group = document.createElement('div');
    group.className = 'chart-bar-group';
    group.innerHTML = `
      <span class="chart-bar-value">${formattedVal}</span>
      <div class="chart-bar-fill" style="height: ${heightPct}%;" title="${item.month}: ₹${item.revenue.toLocaleString('en-IN')}"></div>
      <span class="chart-bar-label">${item.month}</span>
    `;
    revenueChartContainer.appendChild(group);
  });
}

// Render Registered Customers Table
function renderUsers(usersList) {
  if (!usersListBody) return;
  usersListBody.innerHTML = '';

  if (!usersList || usersList.length === 0) {
    usersListBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px; font-weight: 600; color: var(--text-muted);">
          No registered customers found.
        </td>
      </tr>
    `;
    return;
  }

  usersList.forEach(user => {
    const tr = document.createElement('tr');
    const displayId = user.id ? `USR-${user.id.slice(-6).toUpperCase()}` : 'USR-000';
    const formattedDate = user.created_at
      ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';

    const roleStyle = user.role === 'admin' 
      ? 'background-color: #fee2e2; color: #dc2626;' 
      : 'background-color: #f3f4f6; color: #374151;';

    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--primary); font-family: monospace;">${escapeHTML(displayId)}</td>
      <td>
        <div style="font-weight: 700; color: var(--text-main);">${escapeHTML(user.name)}</div>
      </td>
      <td style="white-space: nowrap; font-weight: 600;">${escapeHTML(user.phone)}</td>
      <td style="color: var(--text-muted); font-size: 11px;">${escapeHTML(user.email)}</td>
      <td>
        <span style="font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; ${roleStyle}">
          ${escapeHTML(user.role)}
        </span>
      </td>
      <td style="white-space: nowrap; font-size: 11px;">${formattedDate}</td>
      <td class="text-right" style="font-weight: 800; color: var(--text-main);">
        <span style="background: var(--bg-body); padding: 3px 10px; border-radius: 8px; border: 1px solid var(--border-color);">
          📦 ${user.total_orders || 0}
        </span>
      </td>
    `;
    usersListBody.appendChild(tr);
  });
}

// Search Users Filter
function handleUserSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderUsers(users);
  } else {
    const filtered = users.filter(u => 
      (u.id && u.id.toLowerCase().includes(query)) ||
      (u.name && u.name.toLowerCase().includes(query)) ||
      (u.phone && u.phone.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query))
    );
    renderUsers(filtered);
  }
}

// Fetch all orders from backend (Supports silent live auto-sync)
async function loadOrders(silent = false) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/orders`, {
      headers: getAdminHeaders()
    });
    if (!res.ok) throw new Error("Could not load orders");
    const freshOrders = await res.json();

    // Check if new orders arrived during silent background sync
    if (silent && freshOrders.length > lastKnownOrdersCount && lastKnownOrdersCount > 0) {
      const newCount = freshOrders.length - lastKnownOrdersCount;
      const latestOrder = freshOrders[0];
      showToast(`🎉 ${newCount} New Order received! (${latestOrder.order_id || 'ID'})`);
    }

    lastKnownOrdersCount = freshOrders.length;
    orders = freshOrders;

    // Do not re-render if user is currently interacting with an input or dropdown
    const activeEl = document.activeElement;
    const isUserEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');
    if (!isUserEditing) {
      if (orderSearchInput && orderSearchInput.value.trim()) {
        handleOrderSearch({ target: orderSearchInput });
      } else {
        renderOrders(orders);
      }
    }
  } catch (err) {
    if (!silent) {
      console.error("Error loading orders:", err);
      showToast("Failed to fetch user orders.");
    }
  }
}

function startOrdersAutoRefresh() {
  if (!ordersPollInterval) {
    ordersPollInterval = setInterval(() => {
      loadOrders(true);
    }, 30000); // 30-second interval (saves ~85% bandwidth)
  }
}

function stopOrdersAutoRefresh() {
  if (ordersPollInterval) {
    clearInterval(ordersPollInterval);
    ordersPollInterval = null;
  }
}

let lastRenderedOrdersHash = '';

// Render orders list table safely without screen vibration or losing input focus
function renderOrders(ordersList, force = false) {
  const currentHash = JSON.stringify(ordersList || []);
  const activeEl = document.activeElement;
  const isEditingInTable = activeEl && ordersListBody && ordersListBody.contains(activeEl);

  if (!force && isEditingInTable) {
    return; // Don't wipe table if user is currently typing/editing in a table field
  }

  if (!force && lastRenderedOrdersHash === currentHash) {
    return; // Skip re-rendering if order data has not changed
  }

  lastRenderedOrdersHash = currentHash;
  ordersListBody.innerHTML = '';

  if (!ordersList || ordersList.length === 0) {
    ordersListBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 30px; font-weight: 600; color: var(--text-muted);">
          No orders found.
        </td>
      </tr>
    `;
    return;
  }

  ordersList.forEach((order, index) => {
    const tr = document.createElement('tr');
    
    // Check if order was placed in the last 12 hours or is top new order
    const isNewOrder = order.created_at
      ? (new Date().getTime() - new Date(order.created_at).getTime()) < (12 * 3600 * 1000)
      : (index === 0);

    if (isNewOrder) {
      tr.classList.add('new-order-row');
    }

    const formattedDate = order.created_at 
      ? new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'N/A';

    const currentStatus = order.status || 'Processing';
    const statusOptions = ['Processing', 'Dispatched', 'Shipped', 'Delivered', 'Cancelled', 'Pending Payment', 'Paid'];
    const currentStatusClass = getOrderStatusClass(currentStatus);

    // Payment status formatting
    const rawPayStatus = (order.payment_status || (order.payment_method === 'Cash on Delivery' ? 'pending' : (order.status === 'Processing' || order.status === 'Paid' ? 'paid' : 'pending'))).toLowerCase();
    
    let payBadgeClass = 'payment-badge-pending';
    let payBadgeText = 'PENDING ⏳';

    if (rawPayStatus === 'paid') {
      payBadgeClass = 'payment-badge-paid';
      payBadgeText = 'PAID ✓';
    } else if (rawPayStatus === 'failed') {
      payBadgeClass = 'payment-badge-failed';
      payBadgeText = 'FAILED ❌';
    }

    // Build items preview column
    const itemsHtml = order.items && order.items.length > 0
      ? order.items.map(item => `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; background: #ffffff; padding: 6px 8px; border-radius: 8px; border: 1px solid #cbd5e1;">
            ${item.thumbnail ? `<img src="${getImageUrl(item.thumbnail)}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;" alt="">` : ''}
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 700; color: var(--text-main); font-size: 11.5px; line-height: 1.2;" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</span>
              ${item.selected_size ? `<span style="font-size: 9.5px; color: #0284c7; font-weight: 800;">📐 Size: ${escapeHTML(item.selected_size)}</span>` : ''}
              ${item.custom_photo ? `
                <div style="display: flex; gap: 4px; align-items: center; margin-top: 2px;">
                  <a href="${getImageUrl(item.custom_photo)}" target="_blank" style="font-size: 9px; color: #041e42; font-weight: 800; text-decoration: none; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid #bae6fd;">👁️ View Photo</a>
                  <button type="button" onclick="downloadCustomPhoto('${item.custom_photo.replace(/'/g, "\\'")}', 'Customer_Photo_Order_${order.order_id}.png')" style="font-size: 9px; color: #ffffff; font-weight: 800; border: none; background: #041e42; padding: 2px 6px; border-radius: 4px; cursor: pointer;" title="Download customer uploaded photo">📥 Download Photo</button>
                </div>
              ` : ''}
              ${item.price ? `<span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">₹${item.price.toLocaleString('en-IN')}</span>` : ''}
            </div>
          </div>
        `).join('')
      : '<span style="font-size: 10px; color: var(--text-muted); font-style: italic;">No items specified</span>';

    const existingTrackingId = order.tracking_id || '';
    const cleanPhone = (order.phone || '').replace(/[^0-9]/g, '');
    const waPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    const waMsgText = encodeURIComponent(`Hi ${order.name || 'Customer'}! Your MakeWithMojo order #${order.order_id} has been dispatched. 🚚 Tracking ID: ${existingTrackingId || '[Tracking ID]'}`);
    const waDirectUrl = `https://wa.me/${waPhone}?text=${waMsgText}`;

    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: 700; color: var(--primary);">${escapeHTML(order.order_id)}</span>
          ${isNewOrder ? '<span class="new-badge">NEW</span>' : ''}
        </div>
      </td>
      <td style="white-space: nowrap;">${formattedDate}</td>
      <td>
        <div style="font-weight: 700; color: var(--text-main);">${escapeHTML(order.name)}</div>
        <div style="font-size: 10px; color: var(--text-muted);">${escapeHTML(order.email || '')}</div>
      </td>
      <td>
        <div style="max-width: 220px; max-height: 100px; overflow-y: auto;">
          ${itemsHtml}
        </div>
      </td>
      <td style="white-space: nowrap;">${escapeHTML(order.phone)}</td>
      <td>
        <div style="font-size: 11px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(order.address)}">
          ${escapeHTML(order.address)}
        </div>
      </td>
      <td style="text-transform: capitalize;">${escapeHTML(order.payment_method)}</td>
      <td>
        <span class="payment-badge ${payBadgeClass}">${payBadgeText}</span>
      </td>
      <td class="text-right" style="font-weight: 700; color: var(--text-main);">₹${order.grand_total.toLocaleString('en-IN')}</td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 6px; min-width: 195px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 8.5px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">TRACKING ID / AWB:</span>
            <input type="text" class="tracking-id-input" value="${escapeHTML(existingTrackingId)}" placeholder="Enter Tracking ID..." data-id="${escapeHTML(order.order_id)}" style="padding: 4px 8px; font-size: 11px; font-weight: 600; border: 1px solid var(--border-color); border-radius: 6px; width: 100%;">
          </div>

          <div style="display: flex; gap: 4px; align-items: center;">
            <select class="order-status-select ${currentStatusClass}" data-id="${escapeHTML(order.order_id)}" style="flex: 1;">
              ${statusOptions.map(opt => `<option value="${opt}" ${opt.toLowerCase() === currentStatus.toLowerCase() ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
          </div>

          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="btn-save-tracking" data-id="${escapeHTML(order.order_id)}" style="padding: 5px 8px; font-size: 10px; font-weight: 700; background: #041E42; color: #fff; border: none; border-radius: 6px; cursor: pointer; flex: 1; display: flex; align-items: center; justify-content: center; gap: 3px;" title="Save Tracking ID & send WhatsApp tracking alert">
              <span>💾 Save & WA Tracking</span>
            </button>
            <a href="${waDirectUrl}" target="_blank" class="btn-direct-wa" style="padding: 5px 8px; font-size: 10px; font-weight: 700; background: #25D366; color: #fff; border-radius: 6px; text-decoration: none; display: flex; align-items: center; justify-content: center;" title="Open Direct WhatsApp Chat with Customer">
              <span>Chat 📱</span>
            </a>
          </div>
        </div>
      </td>
      <td class="text-right">
        <button class="btn-secondary btn-view-invoice" style="padding: 6px 12px; font-size: 11px;" data-id="${escapeHTML(order.order_id)}">
          View Invoice
        </button>
        <button type="button" class="btn-resend-confirm" style="padding: 5px 8px; font-size: 10px; font-weight: 700; margin-top: 4px; background: #0284c7; color: #fff; border: none; border-radius: 6px; cursor: pointer; display: block; width: 100%; text-align: center;" data-id="${escapeHTML(order.order_id)}" title="Send WhatsApp Order Confirmation Template (order_confirmation_v1)">
          📩 WA Order Confirmation
        </button>
      </td>
    `;
    
    // Bind change event for Status Dropdown
    const selectEl = tr.querySelector('.order-status-select');
    const trackingInput = tr.querySelector('.tracking-id-input');
    const saveBtn = tr.querySelector('.btn-save-tracking');

    selectEl.addEventListener('change', async (e) => {
      const newStatus = e.target.value;
      selectEl.className = `order-status-select ${getOrderStatusClass(newStatus)}`;
      await handleUpdateOrderStatus(order.order_id, newStatus, trackingInput.value, 'Express Delivery', false);
    });

    saveBtn.addEventListener('click', async () => {
      const trackingId = trackingInput.value;
      const currentStatusVal = selectEl.value;
      await handleUpdateOrderStatus(order.order_id, currentStatusVal, trackingId, 'Express Delivery', true);
    });

    // Bind click event for View Invoice button
    tr.querySelector('.btn-view-invoice').addEventListener('click', () => {
      openInvoice(order.order_id);
    });

    // Bind click event for Resend WhatsApp Order Confirmation button
    tr.querySelector('.btn-resend-confirm').addEventListener('click', async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/orders/${order.order_id}/resend-confirmation`, {
          method: 'POST',
          headers: getAdminHeaders()
        });
        if (res.ok) {
          showToast(`📲 WhatsApp Order Confirmation sent for Order #${order.order_id}!`);
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(`⚠️ Confirmation send issue: ${errData.detail || 'Failed to send'}`, 'info');
        }
      } catch (err) {
        showToast(`⚠️ Connection error: ${err.message}`, 'info');
      }
    });

    ordersListBody.appendChild(tr);
  });
}

async function handleUpdateOrderStatus(orderId, newStatus, trackingId = null, courierName = 'Express Delivery', notifyWhatsapp = false) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({
        status: newStatus,
        tracking_id: trackingId,
        courier_name: courierName,
        notify_whatsapp: notifyWhatsapp
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update order status");
    }

    if (notifyWhatsapp) {
      showToast(`Order #${orderId} tracking saved & WhatsApp notification sent!`);
    } else {
      showToast(`Order #${orderId} status updated to '${newStatus}'!`);
    }
    loadOrders();
  } catch (err) {
    console.error("Order status update failed:", err);
    showToast(`Error: ${err.message}`);
  }
}

// Google Sheets Live Data Synchronization Handler
async function handleSyncGoogleSheets() {
  const inputEl = document.getElementById('sheets-id-input');
  const btnSync = document.getElementById('btn-sync-sheets');
  const sheetInputVal = inputEl ? inputEl.value.trim() : '';

  if (btnSync) {
    btnSync.disabled = true;
    btnSync.innerHTML = '<span>🔄 Syncing Live Data...</span>';
  }

  try {
    const res = await fetch(`${API_BASE_URL}/admin/google-sheets/sync`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ sheet_id: sheetInputVal })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Google Sheets sync failed.");
    }

    if (data.sheet_id && inputEl) {
      inputEl.value = data.sheet_id;
      localStorage.setItem('mwm_google_sheet_id', data.sheet_id);
    }

    showToast(`🎉 Live Google Sheet Synced! (${data.synced_counts?.orders || 0} Orders & ${data.synced_counts?.customers || 0} Customers)`);
  } catch (err) {
    console.error("Google Sheets Sync Error:", err);
    showToast(`Error: ${err.message}`);
  } finally {
    if (btnSync) {
      btnSync.disabled = false;
      btnSync.innerHTML = '<span>🔄 Sync Google Sheet Live</span>';
    }
  }
}

// Search/Filter orders on search input
function handleOrderSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderOrders(orders);
  } else {
    const filtered = orders.filter(o => 
      (o.order_id && o.order_id.toLowerCase().includes(query)) ||
      (o.name && o.name.toLowerCase().includes(query)) ||
      (o.phone && o.phone.toLowerCase().includes(query)) ||
      (o.address && o.address.toLowerCase().includes(query)) ||
      (o.payment_method && o.payment_method.toLowerCase().includes(query)) ||
      (o.items && o.items.some(item => item.title && item.title.toLowerCase().includes(query)))
    );
    renderOrders(filtered);
  }
}

function numberToWords(num) {
  const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

  function numToWords(n) {
    if (n < 20) return a[n];
    const digit = n % 10;
    if (n < 100) return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit].trim() : '');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + numToWords(n % 100) : '');
    if (n < 100000) return numToWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? numToWords(n % 1000) : '');
    if (n < 10000000) return numToWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? numToWords(n % 100000) : '');
    return numToWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? numToWords(n % 10000000) : '');
  }

  if (num === 0) return 'Zero';
  
  const parts = num.toString().split('.');
  const whole = parseInt(parts[0]);
  const decimal = parts[1] ? parseInt(parts[1].slice(0, 2)) : 0;
  
  let result = numToWords(whole) + 'Rupees ';
  if (decimal > 0) {
    result += 'and ' + numToWords(decimal) + 'Paise ';
  }
  return result.trim() + ' Only';
}

// Populate and show Invoice modal
function openInvoice(orderId) {
  const order = orders.find(o => o.order_id === orderId);
  if (!order) return;

  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString('en-IN')
    : 'N/A';

  // Set fields
  document.getElementById('inv-billing-name').innerText = order.name;
  document.getElementById('inv-billing-address').innerText = order.address;
  document.getElementById('inv-billing-phone').innerText = order.phone;

  document.getElementById('inv-shipping-name').innerText = order.name;
  document.getElementById('inv-shipping-address').innerText = order.address;
  document.getElementById('inv-shipping-phone').innerText = order.phone;

  document.getElementById('inv-order-id').innerText = order.order_id;
  document.getElementById('inv-order-date').innerText = formattedDate;
  document.getElementById('inv-invoice-id').innerText = order.order_id;
  document.getElementById('inv-invoice-date').innerText = formattedDate;

  // Populate items body
  const itemsBody = document.getElementById('invoice-items-body');
  itemsBody.innerHTML = '';

  let itemsSubtotal = 0;
  let slNo = 1;

  order.items.forEach(item => {
    const row = document.createElement('tr');
    const rate = item.price;
    const qty = 1; // Default to 1
    const amount = qty * rate;
    itemsSubtotal += amount;

    row.innerHTML = `
      <td class="text-center">${slNo++}</td>
      <td style="font-weight: 700; color: #111111;">${escapeHTML(item.title)}</td>
      <td class="text-right">₹${rate.toLocaleString('en-IN')}</td>
      <td class="text-center">${qty}</td>
      <td class="text-right">₹${amount.toLocaleString('en-IN')}</td>
    `;
    itemsBody.appendChild(row);
  });

  // Calculate delivery charge dynamically
  const delivery = Math.max(0, order.grand_total - itemsSubtotal);

  if (delivery > 0) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="text-center">${slNo++}</td>
      <td style="font-style: italic; color: #555555;">Shipping Charges</td>
      <td class="text-right">₹${delivery.toLocaleString('en-IN')}</td>
      <td class="text-center"> </td>
      <td class="text-right">₹${delivery.toLocaleString('en-IN')}</td>
    `;
    itemsBody.appendChild(row);
  }

  // Set total and amount in words fields
  document.getElementById('inv-total').innerText = `₹${order.grand_total.toLocaleString('en-IN')}`;
  document.getElementById('inv-words').innerText = numberToWords(order.grand_total);

  // Show modal
  invoiceModal.classList.remove('hidden');
}

// Close Invoice modal
function closeInvoice() {
  invoiceModal.classList.add('hidden');
}

// Open printer dialog
function printInvoice() {
  window.print();
}

// --- Excel / CSV Exporters ---
function exportToCSV(filename, rows) {
  const processRow = function (row) {
    let finalVal = '';
    for (let j = 0; j < row.length; j++) {
      let innerValue = row[j] === null || row[j] === undefined ? '' : row[j].toString();
      let result = innerValue.replace(/"/g, '""');
      if (result.search(/("|,|\n)/g) >= 0)
        result = '"' + result + '"';
      if (j > 0)
        finalVal += ',';
      finalVal += result;
    }
    return finalVal + '\r\n';
  };

  let csvFile = '\uFEFF'; // UTF-8 BOM so Excel opens INR symbols & accents accurately
  for (let i = 0; i < rows.length; i++) {
    csvFile += processRow(rows[i]);
  }

  const blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function handleExportOrdersExcel() {
  if (!orders || orders.length === 0) {
    showToast("⚠️ No orders available to export.");
    return;
  }

  const headers = [
    "Order ID", "Date", "Customer Name", "Phone", "Email",
    "Shipping Address", "Items Summary", "Grand Total (₹)",
    "Payment Method", "Payment Status", "Order Status", "Tracking ID / AWB"
  ];

  const rows = [headers];
  orders.forEach(o => {
    const itemsSummary = (o.items || []).map(it => `${it.title} (x${it.quantity || 1})`).join(' | ');
    const formattedDate = o.created_at
      ? new Date(o.created_at).toLocaleString('en-IN')
      : (o.date || '');

    rows.push([
      o.order_id || '',
      formattedDate,
      o.name || 'Guest',
      o.phone || '',
      o.email || '',
      o.address || '',
      itemsSummary,
      o.grandTotal || o.grand_total || 0,
      o.payment_method || 'Online',
      o.payment_status || 'pending',
      o.status || 'Processing',
      o.tracking_id || ''
    ]);
  });

  const dateStr = new Date().toISOString().split('T')[0];
  exportToCSV(`MakeWithMojo_Orders_${dateStr}.csv`, rows);
  showToast("📊 Orders exported to Excel (.csv) successfully!");
}

function handleExportCustomersExcel() {
  if (!adminUsersList || adminUsersList.length === 0) {
    showToast("⚠️ No customers available to export.");
    return;
  }

  const headers = ["User ID", "Customer Name", "Phone Number", "Email", "Total Orders", "Registered Date"];
  const rows = [headers];

  adminUsersList.forEach(u => {
    const formattedDate = u.created_at
      ? new Date(u.created_at).toLocaleString('en-IN')
      : '';

    rows.push([
      u.id || u._id || '',
      u.name || 'Guest',
      u.phone || '',
      u.email || '',
      u.total_orders || 0,
      formattedDate
    ]);
  });

  const dateStr = new Date().toISOString().split('T')[0];
  exportToCSV(`MakeWithMojo_Customers_${dateStr}.csv`, rows);
  showToast("👥 Customers directory exported to Excel (.csv) successfully!");
}

// 1-Click Blob Photo Downloader for Admin Console
window.downloadCustomPhoto = function(photoUrl, filename) {
  if (!photoUrl) return;
  try {
    if (photoUrl.startsWith('data:')) {
      const parts = photoUrl.split(';base64,');
      const contentType = parts[0].split(':')[1] || 'image/png';
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      const blob = new Blob([uInt8Array], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'Customer_Photo.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } else {
      const a = document.createElement('a');
      a.href = photoUrl;
      a.target = '_blank';
      a.download = filename || 'Customer_Photo.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (e) {
    window.open(photoUrl, '_blank');
  }
};

