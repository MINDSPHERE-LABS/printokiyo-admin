// PrintOkiyo Admin - Products Management & Category Sync

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
    "Wall Sets",
    "Cricket Collage Block Kits",
    "Football Collage",
    "God Collage/Block kit",
    "Anime Collage",
    "Supercar Colage",
    "Movie Collage",
    "Motivation Collage",
    "Collage/Block Kits",
    "Custom Poloride Photo",
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

// Global Product Search Query State
let productSearchQuery = '';

// Render Products Category-Wise Grid
function renderProducts() {
  renderAdminCategoryFilterBar();
  productsView.innerHTML = '';
  
  const searchCountEl = document.getElementById('product-search-count');

  if (!products || products.length === 0) {
    productsView.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    if (searchCountEl) searchCountEl.innerText = '';
    return;
  }

  productsView.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  // Filter products by selected admin category
  let filteredProducts = products;
  if (selectedAdminCategory !== 'ALL') {
    filteredProducts = products.filter(p => (p.category && p.category.trim() ? p.category.trim() : 'General') === selectedAdminCategory);
  }

  // Filter products by SKU, Name, Category, or Tags Search Query
  if (productSearchQuery) {
    const q = productSearchQuery.toLowerCase().trim();
    filteredProducts = filteredProducts.filter(p => {
      const skuVal = (p.SKU || p.sku || '').toLowerCase();
      const titleVal = (p.title || '').toLowerCase();
      const catVal = (p.category || '').toLowerCase();
      const tagsVal = Array.isArray(p.tags) ? p.tags.join(' ').toLowerCase() : '';
      return skuVal.includes(q) || titleVal.includes(q) || catVal.includes(q) || tagsVal.includes(q);
    });

    if (searchCountEl) {
      searchCountEl.innerText = `Found ${filteredProducts.length} product${filteredProducts.length === 1 ? '' : 's'}`;
    }
  } else {
    if (searchCountEl) {
      searchCountEl.innerText = '';
    }
  }

  if (filteredProducts.length === 0) {
    productsView.innerHTML = `
      <div style="text-align: center; padding: 40px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); color: var(--text-muted); font-size: 13px; font-weight: 600;">
        ${productSearchQuery 
          ? `🔍 No products found matching "<strong>${escapeHTML(productSearchQuery)}</strong>"${selectedAdminCategory !== 'ALL' ? ` in category "${escapeHTML(selectedAdminCategory)}"` : ''}.` 
          : `No products found in category "${escapeHTML(selectedAdminCategory)}".`}
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
      const skuDisplay = product.SKU || product.sku || 'N/A';
      
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
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block;">
              ${escapeHTML(product.category || 'General')}
            </span>
            <span class="product-sku-badge" style="font-family: monospace; font-size: 9.5px; font-weight: 800; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.4px;" title="Product SKU Code">
              🏷️ SKU: ${escapeHTML(skuDisplay)}
            </span>
          </div>
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
  if (inputShortDesc) inputShortDesc.value = '';
  if (inputDesc) inputDesc.value = '';
  inputPrice.value = '';
  inputDiscountPrice.value = '';

  const inputPriceA5 = document.getElementById('price_a5');
  const inputPriceA4 = document.getElementById('price_a4');
  const inputPriceA3 = document.getElementById('price_a3');
  if (inputPriceA5) inputPriceA5.value = '';
  if (inputPriceA4) inputPriceA4.value = '';
  if (inputPriceA3) inputPriceA3.value = '';

  const inputEnableA5 = document.getElementById('enable_a5');
  const inputEnableA4 = document.getElementById('enable_a4');
  const inputEnableA3 = document.getElementById('enable_a3');
  if (inputEnableA5) inputEnableA5.checked = true;
  if (inputEnableA4) inputEnableA4.checked = true;
  if (inputEnableA3) inputEnableA3.checked = true;

  const inputCustomSize1 = document.getElementById('custom_size_1');
  const inputCustomSize2 = document.getElementById('custom_size_2');
  const inputCustomSize3 = document.getElementById('custom_size_3');
  const inputCustomPrice1 = document.getElementById('custom_price_1');
  const inputCustomPrice2 = document.getElementById('custom_price_2');
  const inputCustomPrice3 = document.getElementById('custom_price_3');
  if (inputCustomSize1) inputCustomSize1.value = '';
  if (inputCustomSize2) inputCustomSize2.value = '';
  if (inputCustomSize3) inputCustomSize3.value = '';
  if (inputCustomPrice1) inputCustomPrice1.value = '';
  if (inputCustomPrice2) inputCustomPrice2.value = '';
  if (inputCustomPrice3) inputCustomPrice3.value = '';

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
  const bestValuePacksContainer = document.getElementById('best-value-packs-custom-container');
  if (inputShowBestValuePacks) inputShowBestValuePacks.checked = true;
  if (bestValuePacksContainer) bestValuePacksContainer.style.display = 'flex';

  const inputPack1Buy = document.getElementById('best_value_pack_1_buy');
  const inputPack1Get = document.getElementById('best_value_pack_1_get');
  const inputPack1Title = document.getElementById('best_value_pack_1_title');
  const inputPack1Sub = document.getElementById('best_value_pack_1_subtitle');
  const inputPack2Buy = document.getElementById('best_value_pack_2_buy');
  const inputPack2Get = document.getElementById('best_value_pack_2_get');
  const inputPack2Title = document.getElementById('best_value_pack_2_title');
  const inputPack2Sub = document.getElementById('best_value_pack_2_subtitle');
  const inputPack3Buy = document.getElementById('best_value_pack_3_buy');
  const inputPack3Get = document.getElementById('best_value_pack_3_get');
  const inputPack3Title = document.getElementById('best_value_pack_3_title');
  const inputPack3Sub = document.getElementById('best_value_pack_3_subtitle');

  if (inputPack1Buy) inputPack1Buy.value = '1';
  if (inputPack1Get) inputPack1Get.value = '2';
  if (inputPack1Title) inputPack1Title.value = '';
  if (inputPack1Sub) inputPack1Sub.value = '';
  if (inputPack2Buy) inputPack2Buy.value = '2';
  if (inputPack2Get) inputPack2Get.value = '4';
  if (inputPack2Title) inputPack2Title.value = '';
  if (inputPack2Sub) inputPack2Sub.value = '';
  if (inputPack3Buy) inputPack3Buy.value = '3';
  if (inputPack3Get) inputPack3Get.value = '9';
  if (inputPack3Title) inputPack3Title.value = '';
  if (inputPack3Sub) inputPack3Sub.value = '';

  if (inputHasCustomOptions) inputHasCustomOptions.checked = false;
  if (customOptionsExpand) customOptionsExpand.style.display = 'none';
  if (inputAllowPhotoUpload) inputAllowPhotoUpload.checked = false;
  if (inputAllowSizeVariants) inputAllowSizeVariants.checked = true;
  const sizeOptionsWrapper = document.getElementById('size-options-wrapper');
  if (sizeOptionsWrapper) sizeOptionsWrapper.style.display = 'flex';
  const inputEnableStandardSizes = document.getElementById('enable_standard_sizes');
  const standardSizesWrapper = document.getElementById('standard-sizes-wrapper');
  if (inputEnableStandardSizes) inputEnableStandardSizes.checked = true;
  if (standardSizesWrapper) standardSizesWrapper.style.display = 'flex';
  const availableSizesInput = document.getElementById('available_sizes_input');
  if (availableSizesInput) availableSizesInput.value = '';
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

  // Pre-fill form inputs with details from the last saved product template or latest catalog product
  try {
    const savedTemplateStr = localStorage.getItem('mwm_last_product_template');
    let template = savedTemplateStr ? JSON.parse(savedTemplateStr) : null;
    if (!template && products && products.length > 0) {
      template = products[0];
    }
    if (template) {
      if (template.category) populateCategoryDropdown(template.category);
      if (template.price) inputPrice.value = template.price;
      const inputDiscountPrice = document.getElementById('discount_price');
      if (inputDiscountPrice && template.discount_price) inputDiscountPrice.value = template.discount_price;

      const inputPriceA5 = document.getElementById('price_a5');
      const inputPriceA4 = document.getElementById('price_a4');
      const inputPriceA3 = document.getElementById('price_a3');
      if (inputPriceA5 && template.price_a5) inputPriceA5.value = template.price_a5;
      if (inputPriceA4 && template.price_a4) inputPriceA4.value = template.price_a4;
      if (inputPriceA3 && template.price_a3) inputPriceA3.value = template.price_a3;

      const availableSizesInput = document.getElementById('available_sizes_input');
      const sizeOptionsWrapper = document.getElementById('size-options-wrapper');
      if (availableSizesInput && template.available_sizes && Array.isArray(template.available_sizes)) {
        availableSizesInput.value = template.available_sizes.join(', ');
      }
      if (inputAllowSizeVariants) {
        const hasSizes = template.allow_size_variants !== false;
        inputAllowSizeVariants.checked = hasSizes;
        if (sizeOptionsWrapper) sizeOptionsWrapper.style.display = hasSizes ? 'flex' : 'none';
      }

      if (template.stock) inputStock.value = template.stock;
      if (template.production_time) inputProdTime.value = template.production_time;
      if (template.rating) inputRating.value = template.rating;
      if (inputMaterial && template.material) inputMaterial.value = template.material;
      if (inputDimensions && template.dimensions) inputDimensions.value = template.dimensions;

      const inputPack1Buy = document.getElementById('best_value_pack_1_buy');
      const inputPack1Get = document.getElementById('best_value_pack_1_get');
      const inputPack1Title = document.getElementById('best_value_pack_1_title');
      const inputPack1Sub = document.getElementById('best_value_pack_1_subtitle');
      const inputPack2Buy = document.getElementById('best_value_pack_2_buy');
      const inputPack2Get = document.getElementById('best_value_pack_2_get');
      const inputPack2Title = document.getElementById('best_value_pack_2_title');
      const inputPack2Sub = document.getElementById('best_value_pack_2_subtitle');
      const inputPack3Buy = document.getElementById('best_value_pack_3_buy');
      const inputPack3Get = document.getElementById('best_value_pack_3_get');
      const inputPack3Title = document.getElementById('best_value_pack_3_title');
      const inputPack3Sub = document.getElementById('best_value_pack_3_subtitle');

      if (inputPack1Buy && template.best_value_pack_1_buy) inputPack1Buy.value = template.best_value_pack_1_buy;
      if (inputPack1Get && template.best_value_pack_1_get) inputPack1Get.value = template.best_value_pack_1_get;
      if (inputPack1Title && template.best_value_pack_1_title) inputPack1Title.value = template.best_value_pack_1_title;
      if (inputPack1Sub && template.best_value_pack_1_subtitle) inputPack1Sub.value = template.best_value_pack_1_subtitle;

      if (inputPack2Buy && template.best_value_pack_2_buy) inputPack2Buy.value = template.best_value_pack_2_buy;
      if (inputPack2Get && template.best_value_pack_2_get) inputPack2Get.value = template.best_value_pack_2_get;
      if (inputPack2Title && template.best_value_pack_2_title) inputPack2Title.value = template.best_value_pack_2_title;
      if (inputPack2Sub && template.best_value_pack_2_subtitle) inputPack2Sub.value = template.best_value_pack_2_subtitle;

      if (inputPack3Buy && template.best_value_pack_3_buy) inputPack3Buy.value = template.best_value_pack_3_buy;
      if (inputPack3Get && template.best_value_pack_3_get) inputPack3Get.value = template.best_value_pack_3_get;
      if (inputPack3Title && template.best_value_pack_3_title) inputPack3Title.value = template.best_value_pack_3_title;
      if (inputPack3Sub && template.best_value_pack_3_subtitle) inputPack3Sub.value = template.best_value_pack_3_subtitle;
    }
  } catch (e) {
    console.warn('[Admin] Could not load template:', e);
  }

  formDrawer.classList.remove('hidden');
}

function openEditDrawer(id) {
  isEditing = true;
  const product = products.find(p => (p.id || p._id) === id);
  if (!product) return;

  drawerTitle.innerText = "Edit Product Details";
  
  inputId.value = product.id || product._id;
  inputTitle.value = product.title || '';
  inputSlug.value = product.slug || '';
  inputSku.value = product.SKU || product.sku || '';
  if (inputShortDesc) inputShortDesc.value = product.short_description || '';
  if (inputDesc) inputDesc.value = product.description || '';
  if (inputMaterial) inputMaterial.value = product.material || '';
  if (inputDimensions) inputDimensions.value = product.dimensions || '';
  if (inputPinnedToTop) inputPinnedToTop.checked = Boolean(product.pinned_to_top);
  
  const inputShowBestValuePacks = document.getElementById('show_best_value_packs');
  const bestValuePacksContainer = document.getElementById('best-value-packs-custom-container');
  const isPacksEnabled = product.show_best_value_packs !== false;
  if (inputShowBestValuePacks) {
    inputShowBestValuePacks.checked = isPacksEnabled;
  }
  if (bestValuePacksContainer) {
    bestValuePacksContainer.style.display = isPacksEnabled ? 'flex' : 'none';
  }

  const inputPack1Buy = document.getElementById('best_value_pack_1_buy');
  const inputPack1Get = document.getElementById('best_value_pack_1_get');
  const inputPack1Title = document.getElementById('best_value_pack_1_title');
  const inputPack1Sub = document.getElementById('best_value_pack_1_subtitle');
  const inputPack2Buy = document.getElementById('best_value_pack_2_buy');
  const inputPack2Get = document.getElementById('best_value_pack_2_get');
  const inputPack2Title = document.getElementById('best_value_pack_2_title');
  const inputPack2Sub = document.getElementById('best_value_pack_2_subtitle');
  const inputPack3Buy = document.getElementById('best_value_pack_3_buy');
  const inputPack3Get = document.getElementById('best_value_pack_3_get');
  const inputPack3Title = document.getElementById('best_value_pack_3_title');
  const inputPack3Sub = document.getElementById('best_value_pack_3_subtitle');

  const p1Buy = (product.best_value_pack_1_buy !== undefined && product.best_value_pack_1_buy !== null) ? product.best_value_pack_1_buy : 1;
  const p1Get = (product.best_value_pack_1_get !== undefined && product.best_value_pack_1_get !== null) ? product.best_value_pack_1_get : 2;
  const p2Buy = (product.best_value_pack_2_buy !== undefined && product.best_value_pack_2_buy !== null) ? product.best_value_pack_2_buy : 2;
  const p2Get = (product.best_value_pack_2_get !== undefined && product.best_value_pack_2_get !== null) ? product.best_value_pack_2_get : 4;
  const p3Buy = (product.best_value_pack_3_buy !== undefined && product.best_value_pack_3_buy !== null) ? product.best_value_pack_3_buy : 3;
  const p3Get = (product.best_value_pack_3_get !== undefined && product.best_value_pack_3_get !== null) ? product.best_value_pack_3_get : 9;

  if (inputPack1Buy) inputPack1Buy.value = p1Buy;
  if (inputPack1Get) inputPack1Get.value = p1Get;
  if (inputPack1Title) inputPack1Title.value = (product.best_value_pack_1_title && product.best_value_pack_1_title !== `Buy ${p1Buy} → Get ${p1Get} FREE`) ? product.best_value_pack_1_title : '';
  if (inputPack1Sub) inputPack1Sub.value = (product.best_value_pack_1_subtitle && product.best_value_pack_1_subtitle !== `🛒 Add ${p1Buy + p1Get} posters`) ? product.best_value_pack_1_subtitle : '';

  if (inputPack2Buy) inputPack2Buy.value = p2Buy;
  if (inputPack2Get) inputPack2Get.value = p2Get;
  if (inputPack2Title) inputPack2Title.value = (product.best_value_pack_2_title && product.best_value_pack_2_title !== `Buy ${p2Buy} → Get ${p2Get} FREE`) ? product.best_value_pack_2_title : '';
  if (inputPack2Sub) inputPack2Sub.value = (product.best_value_pack_2_subtitle && product.best_value_pack_2_subtitle !== `🛒 Add ${p2Buy + p2Get} posters`) ? product.best_value_pack_2_subtitle : '';

  if (inputPack3Buy) inputPack3Buy.value = p3Buy;
  if (inputPack3Get) inputPack3Get.value = p3Get;
  if (inputPack3Title) inputPack3Title.value = (product.best_value_pack_3_title && product.best_value_pack_3_title !== `Buy ${p3Buy} → Get ${p3Get} FREE`) ? product.best_value_pack_3_title : '';
  if (inputPack3Sub) inputPack3Sub.value = (product.best_value_pack_3_subtitle && product.best_value_pack_3_subtitle !== `🛒 Add ${p3Buy + p3Get} posters`) ? product.best_value_pack_3_subtitle : '';

  inputPrice.value = product.price;
  inputDiscountPrice.value = product.discount_price || '';

  const inputPriceA5 = document.getElementById('price_a5');
  const inputPriceA4 = document.getElementById('price_a4');
  const inputPriceA3 = document.getElementById('price_a3');
  if (inputPriceA5) inputPriceA5.value = product.price_a5 !== undefined && product.price_a5 !== null ? product.price_a5 : '';
  if (inputPriceA4) inputPriceA4.value = product.price_a4 !== undefined && product.price_a4 !== null ? product.price_a4 : '';
  if (inputPriceA3) inputPriceA3.value = product.price_a3 !== undefined && product.price_a3 !== null ? product.price_a3 : '';

  const inputEnableA5 = document.getElementById('enable_a5');
  const inputEnableA4 = document.getElementById('enable_a4');
  const inputEnableA3 = document.getElementById('enable_a3');
  if (inputEnableA5) inputEnableA5.checked = product.enable_a5 !== false;
  if (inputEnableA4) inputEnableA4.checked = product.enable_a4 !== false;
  if (inputEnableA3) inputEnableA3.checked = product.enable_a3 !== false;

  const inputCustomSize1 = document.getElementById('custom_size_1');
  const inputCustomSize2 = document.getElementById('custom_size_2');
  const inputCustomSize3 = document.getElementById('custom_size_3');
  const inputCustomPrice1 = document.getElementById('custom_price_1');
  const inputCustomPrice2 = document.getElementById('custom_price_2');
  const inputCustomPrice3 = document.getElementById('custom_price_3');
  const avail = Array.isArray(product.available_sizes) ? product.available_sizes : [];
  if (inputCustomSize1) inputCustomSize1.value = product.custom_size_1 || avail[0] || '';
  if (inputCustomSize2) inputCustomSize2.value = product.custom_size_2 || avail[1] || '';
  if (inputCustomSize3) inputCustomSize3.value = product.custom_size_3 || avail[2] || '';
  if (inputCustomPrice1) inputCustomPrice1.value = product.custom_price_1 !== undefined && product.custom_price_1 !== null ? product.custom_price_1 : '';
  if (inputCustomPrice2) inputCustomPrice2.value = product.custom_price_2 !== undefined && product.custom_price_2 !== null ? product.custom_price_2 : '';
  if (inputCustomPrice3) inputCustomPrice3.value = product.custom_price_3 !== undefined && product.custom_price_3 !== null ? product.custom_price_3 : '';

  const sizeOptionsWrapper = document.getElementById('size-options-wrapper');

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
    const hasSizes = product.allow_size_variants !== false;
    inputAllowSizeVariants.checked = hasSizes;
    if (sizeOptionsWrapper) sizeOptionsWrapper.style.display = hasSizes ? 'flex' : 'none';
  }
  // Group toggle for A5/A4/A3 block — enabled if any standard size is enabled (or undefined = default on)
  const inputEnableStandardSizes = document.getElementById('enable_standard_sizes');
  const standardSizesWrapper = document.getElementById('standard-sizes-wrapper');
  if (inputEnableStandardSizes) {
    const anyStandardEnabled = product.enable_a5 !== false || product.enable_a4 !== false || product.enable_a3 !== false;
    inputEnableStandardSizes.checked = anyStandardEnabled;
    if (standardSizesWrapper) standardSizesWrapper.style.display = anyStandardEnabled ? 'flex' : 'none';
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

  const inputPriceA5 = document.getElementById('price_a5');
  const inputPriceA4 = document.getElementById('price_a4');
  const inputPriceA3 = document.getElementById('price_a3');

  const inputEnableA5 = document.getElementById('enable_a5');
  const inputEnableA4 = document.getElementById('enable_a4');
  const inputEnableA3 = document.getElementById('enable_a3');

  const inputCustomSize1 = document.getElementById('custom_size_1');
  const inputCustomSize2 = document.getElementById('custom_size_2');
  const inputCustomSize3 = document.getElementById('custom_size_3');
  const inputCustomPrice1 = document.getElementById('custom_price_1');
  const inputCustomPrice2 = document.getElementById('custom_price_2');
  const inputCustomPrice3 = document.getElementById('custom_price_3');

  const c1Val = inputCustomSize1 && inputCustomSize1.value.trim() ? inputCustomSize1.value.trim() : null;
  const c2Val = inputCustomSize2 && inputCustomSize2.value.trim() ? inputCustomSize2.value.trim() : null;
  const c3Val = inputCustomSize3 && inputCustomSize3.value.trim() ? inputCustomSize3.value.trim() : null;
  const cp1Val = inputCustomPrice1 && inputCustomPrice1.value ? parseFloat(inputCustomPrice1.value) : null;
  const cp2Val = inputCustomPrice2 && inputCustomPrice2.value ? parseFloat(inputCustomPrice2.value) : null;
  const cp3Val = inputCustomPrice3 && inputCustomPrice3.value ? parseFloat(inputCustomPrice3.value) : null;

  const availableSizesArray = [c1Val, c2Val, c3Val].filter(Boolean);

  const inputPack1Buy = document.getElementById('best_value_pack_1_buy');
  const inputPack1Get = document.getElementById('best_value_pack_1_get');
  const inputPack1Title = document.getElementById('best_value_pack_1_title');
  const inputPack1Sub = document.getElementById('best_value_pack_1_subtitle');
  
  const inputPack2Buy = document.getElementById('best_value_pack_2_buy');
  const inputPack2Get = document.getElementById('best_value_pack_2_get');
  const inputPack2Title = document.getElementById('best_value_pack_2_title');
  const inputPack2Sub = document.getElementById('best_value_pack_2_subtitle');
  
  const inputPack3Buy = document.getElementById('best_value_pack_3_buy');
  const inputPack3Get = document.getElementById('best_value_pack_3_get');
  const inputPack3Title = document.getElementById('best_value_pack_3_title');
  const inputPack3Sub = document.getElementById('best_value_pack_3_subtitle');

  const p1BuyVal = inputPack1Buy && inputPack1Buy.value ? parseInt(inputPack1Buy.value) : (showBestValuePacksVal ? 1 : null);
  const p1GetVal = inputPack1Get && inputPack1Get.value ? parseInt(inputPack1Get.value) : (showBestValuePacksVal ? 2 : null);
  const p1TitleVal = (inputPack1Title && inputPack1Title.value.trim() && inputPack1Title.value.trim() !== `Buy ${p1BuyVal} → Get ${p1GetVal} FREE`) ? inputPack1Title.value.trim() : null;
  const p1SubVal = (inputPack1Sub && inputPack1Sub.value.trim() && inputPack1Sub.value.trim() !== `🛒 Add ${p1BuyVal + p1GetVal} posters`) ? inputPack1Sub.value.trim() : null;

  const p2BuyVal = inputPack2Buy && inputPack2Buy.value ? parseInt(inputPack2Buy.value) : (showBestValuePacksVal ? 2 : null);
  const p2GetVal = inputPack2Get && inputPack2Get.value ? parseInt(inputPack2Get.value) : (showBestValuePacksVal ? 4 : null);
  const p2TitleVal = (inputPack2Title && inputPack2Title.value.trim() && inputPack2Title.value.trim() !== `Buy ${p2BuyVal} → Get ${p2GetVal} FREE`) ? inputPack2Title.value.trim() : null;
  const p2SubVal = (inputPack2Sub && inputPack2Sub.value.trim() && inputPack2Sub.value.trim() !== `🛒 Add ${p2BuyVal + p2GetVal} posters`) ? inputPack2Sub.value.trim() : null;

  const p3BuyVal = inputPack3Buy && inputPack3Buy.value ? parseInt(inputPack3Buy.value) : (showBestValuePacksVal ? 3 : null);
  const p3GetVal = inputPack3Get && inputPack3Get.value ? parseInt(inputPack3Get.value) : (showBestValuePacksVal ? 9 : null);
  const p3TitleVal = (inputPack3Title && inputPack3Title.value.trim() && inputPack3Title.value.trim() !== `Buy ${p3BuyVal} → Get ${p3GetVal} FREE`) ? inputPack3Title.value.trim() : null;
  const p3SubVal = (inputPack3Sub && inputPack3Sub.value.trim() && inputPack3Sub.value.trim() !== `🛒 Add ${p3BuyVal + p3GetVal} posters`) ? inputPack3Sub.value.trim() : null;

  // Construct payload with dynamic rating and gallery
  const productPayload = {
    title: inputTitle.value,
    slug: inputSlug.value,
    short_description: (typeof inputShortDesc !== 'undefined' && inputShortDesc && inputShortDesc.value) ? inputShortDesc.value : "",
    description: (typeof inputDesc !== 'undefined' && inputDesc && inputDesc.value) ? inputDesc.value : "",
    price: (cp1Val !== null) 
      ? cp1Val 
      : ((inputPriceA5 && inputPriceA5.value) 
          ? parseFloat(inputPriceA5.value) 
          : (sizeVariants.length > 0 && sizeVariants[0].price 
              ? sizeVariants[0].price 
              : (inputPrice && inputPrice.value ? parseFloat(inputPrice.value) : 89))),
    discount_price: inputDiscountPrice.value ? parseFloat(inputDiscountPrice.value) : null,
    price_a5: inputPriceA5 && inputPriceA5.value ? parseFloat(inputPriceA5.value) : null,
    price_a4: inputPriceA4 && inputPriceA4.value ? parseFloat(inputPriceA4.value) : null,
    price_a3: inputPriceA3 && inputPriceA3.value ? parseFloat(inputPriceA3.value) : null,
    allow_size_variants: inputAllowSizeVariants ? inputAllowSizeVariants.checked : true,
    enable_a5: inputEnableA5 ? inputEnableA5.checked : true,
    enable_a4: inputEnableA4 ? inputEnableA4.checked : true,
    enable_a3: inputEnableA3 ? inputEnableA3.checked : true,
    custom_size_1: c1Val,
    custom_price_1: cp1Val,
    custom_size_2: c2Val,
    custom_price_2: cp2Val,
    custom_size_3: c3Val,
    custom_price_3: cp3Val,
    available_sizes: availableSizesArray,
    category: finalCategory,
    show_best_value_packs: showBestValuePacksVal,
    best_value_pack_1_buy: p1BuyVal,
    best_value_pack_1_get: p1GetVal,
    best_value_pack_1_title: p1TitleVal,
    best_value_pack_1_subtitle: p1SubVal,
    best_value_pack_2_buy: p2BuyVal,
    best_value_pack_2_get: p2GetVal,
    best_value_pack_2_title: p2TitleVal,
    best_value_pack_2_subtitle: p2SubVal,
    best_value_pack_3_buy: p3BuyVal,
    best_value_pack_3_get: p3GetVal,
    best_value_pack_3_title: p3TitleVal,
    best_value_pack_3_subtitle: p3SubVal,
    subcategory: "3D Creation",
    tags: ["3dprint", "premium", "home-decor"],
    thumbnail: thumbUrl,
    gallery: galleryArray,
    videos: [],
    available_colors: ["Classic Grey", "Frost White"],
    available_sizes: availableSizesArray,
    material: inputMaterial && inputMaterial.value ? inputMaterial.value : "Premium PLA+",
    print_quality: "0.16mm Fine",
    production_time: inputProdTime.value,
    stock: parseInt(inputStock.value),
    SKU: inputSku && inputSku.value ? inputSku.value.trim() : '',
    sku: inputSku && inputSku.value ? inputSku.value.trim() : '',
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
    allow_size_variants: inputAllowSizeVariants ? inputAllowSizeVariants.checked : true,
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

    // Save template for pre-populating future Add Product forms
    try {
      localStorage.setItem('mwm_last_product_template', JSON.stringify(productPayload));
    } catch (e) {}

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

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || "Could not delete product");
    }

    showToast("Product deleted successfully");
    loadProducts();
  } catch (err) {
    console.error(err);
    showToast(`Delete failed: ${err.message}`);
  }
}

// Wire up Product Search Bar input and clear button
function setupProductSearch() {
  const searchInput = document.getElementById('product-search');
  const btnClearSearch = document.getElementById('btn-clear-product-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      productSearchQuery = e.target.value.trim();
      if (btnClearSearch) {
        btnClearSearch.style.display = productSearchQuery ? 'block' : 'none';
      }
      renderProducts();
    });
  }
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      productSearchQuery = '';
      btnClearSearch.style.display = 'none';
      renderProducts();
    });
  }
}
