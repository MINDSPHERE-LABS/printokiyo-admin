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
