// PrintOkiyo Admin - Configuration, State & Helper Utilities

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

// Global State
let products = [];
let orders = [];
let users = [];
let analyticsData = null;
let isEditing = false;
let currentFormImages = [];
let selectedAdminCategory = 'ALL';
let ordersAutoRefreshInterval = null;
let analyticsAutoRefreshInterval = null;

// DOM Elements References
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

const tabBtnProducts = document.getElementById('tab-btn-products');
const tabBtnOrders = document.getElementById('tab-btn-orders');
const tabBtnAnalytics = document.getElementById('tab-btn-analytics');
const productsTabSection = document.getElementById('products-tab-section');
const ordersTabSection = document.getElementById('orders-tab-section');
const analyticsTabSection = document.getElementById('analytics-tab-section');

const ordersListBody = document.getElementById('orders-list-body');
const orderSearchInput = document.getElementById('order-search');

const usersListBody = document.getElementById('users-list-body');
const userSearchInput = document.getElementById('user-search');

const statMonthlyRevenue = document.getElementById('stat-monthly-revenue');
const statFyRevenue = document.getElementById('stat-fy-revenue');
const statFyLabel = document.getElementById('stat-fy-label');
const statTotalUsers = document.getElementById('stat-total-users');
const statTotalOrders = document.getElementById('stat-total-orders');
const revenueChartContainer = document.getElementById('revenue-chart-container');

const invoiceModal = document.getElementById('invoice-modal');
const invoiceCloseBackdrop = document.getElementById('invoice-close-backdrop');
const btnPrintInvoice = document.getElementById('btn-print-invoice');
const btnCloseInvoice = document.getElementById('btn-close-invoice');

const settingsForm = document.getElementById('settings-form');
const inputSettingsThreshold = document.getElementById('settings-threshold');
const inputSettingsCharge = document.getElementById('settings-charge');
const inputSettingsCodFee = document.getElementById('settings-cod-fee');
const inputSettingsCod = document.getElementById('settings-cod');

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

const btnAddProduct = document.getElementById('btn-add-product');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const btnCancelForm = document.getElementById('btn-cancel-form');
const drawerCloseBackdrop = document.getElementById('drawer-close-backdrop');

// Helper to resolve relative path images to backend URL
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

// Toast notification helper
function showToast(message) {
  if (!toastEl) return;
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
