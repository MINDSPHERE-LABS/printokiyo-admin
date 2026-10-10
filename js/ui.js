// PrintOkiyo Admin - Console UI Navigation & Event Listeners

// Initialize Console on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  await _backendReady;
  checkApiHealth();
  setupEventListeners();
  checkAdminAuthentication();
});

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

// Event Listeners Setup
function setupEventListeners() {
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

  const inputShowBestValuePacks = document.getElementById('show_best_value_packs');
  const bestValuePacksContainer = document.getElementById('best-value-packs-custom-container');
  if (inputShowBestValuePacks && bestValuePacksContainer) {
    inputShowBestValuePacks.addEventListener('change', (e) => {
      bestValuePacksContainer.style.display = e.target.checked ? 'flex' : 'none';
    });
  }

  if (inputHasCustomOptions) {
    inputHasCustomOptions.addEventListener('change', (e) => {
      if (customOptionsExpand) {
        customOptionsExpand.style.display = e.target.checked ? 'flex' : 'none';
      }
    });
  }

  if (inputAllowSizeVariants) {
    inputAllowSizeVariants.addEventListener('change', (e) => {
      const wrapper = document.getElementById('size-options-wrapper');
      if (wrapper) {
        wrapper.style.display = e.target.checked ? 'flex' : 'none';
      }
      if (sizeVariantsContainer) {
        sizeVariantsContainer.style.display = e.target.checked ? 'flex' : 'none';
      }
    });
  }

  const inputEnableStandardSizes = document.getElementById('enable_standard_sizes');
  if (inputEnableStandardSizes) {
    inputEnableStandardSizes.addEventListener('change', (e) => {
      const standardWrapper = document.getElementById('standard-sizes-wrapper');
      if (standardWrapper) {
        standardWrapper.style.display = e.target.checked ? 'flex' : 'none';
      }
      // When group toggle is turned OFF, uncheck each individual size toggle too
      if (!e.target.checked) {
        const a5 = document.getElementById('enable_a5');
        const a4 = document.getElementById('enable_a4');
        const a3 = document.getElementById('enable_a3');
        if (a5) a5.checked = false;
        if (a4) a4.checked = false;
        if (a3) a3.checked = false;
      }
    });
  }

  if (btnAddSizeVariant) {
    btnAddSizeVariant.addEventListener('click', () => {
      renderSizeVariantRow();
    });
  }

  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', handleAdminLoginSubmit);
  }

  const btnLogout = document.getElementById('btn-admin-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleAdminLogout);
  }

  tabBtnProducts.addEventListener('click', () => switchTab('products'));
  tabBtnOrders.addEventListener('click', () => switchTab('orders'));
  if (tabBtnAnalytics) {
    tabBtnAnalytics.addEventListener('click', () => switchTab('analytics'));
  }

  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', handleExportOrdersExcel);
  }

  const btnExportCustomers = document.getElementById('btn-export-customers');
  if (btnExportCustomers) {
    btnExportCustomers.addEventListener('click', handleExportCustomersExcel);
  }

  btnAddProduct.addEventListener('click', openAddDrawer);
  btnCloseDrawer.addEventListener('click', closeDrawer);
  btnCancelForm.addEventListener('click', closeDrawer);
  drawerCloseBackdrop.addEventListener('click', closeDrawer);

  inputTitle.addEventListener('input', (e) => {
    if (!isEditing) {
      inputSlug.value = generateSlug(e.target.value);
    }
    if (typeof updateTargetR2FolderBadge === 'function') updateTargetR2FolderBadge();
  });

  if (inputSku) {
    inputSku.addEventListener('input', () => {
      if (typeof updateTargetR2FolderBadge === 'function') updateTargetR2FolderBadge();
    });
  }

  if (inputSlug) {
    inputSlug.addEventListener('input', () => {
      if (typeof updateTargetR2FolderBadge === 'function') updateTargetR2FolderBadge();
    });
  }

  inputFile.addEventListener('change', handleImageUpload);

  const btnOutOfStock = document.getElementById('btn-out-of-stock');
  if (btnOutOfStock) {
    btnOutOfStock.addEventListener('click', () => {
      const stockInput = document.getElementById('stock');
      if (stockInput) stockInput.value = 0;
    });
  }

  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSettingsSubmit);
  }

  productForm.addEventListener('submit', handleFormSubmit);

  if (orderSearchInput) {
    orderSearchInput.addEventListener('input', handleOrderSearch);
  }
  if (userSearchInput) {
    userSearchInput.addEventListener('input', handleUserSearch);
  }

  if (btnCloseInvoice) btnCloseInvoice.addEventListener('click', closeInvoice);
  if (invoiceCloseBackdrop) invoiceCloseBackdrop.addEventListener('click', closeInvoice);
  if (btnPrintInvoice) btnPrintInvoice.addEventListener('click', printInvoice);

  if (typeof setupProductSearch === 'function') {
    setupProductSearch();
  }
}
