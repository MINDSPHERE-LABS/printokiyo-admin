// PrintOkiyo Admin - Orders, Invoices & Excel Exporter

let ordersPollInterval = null;
let lastKnownOrdersCount = 0;
let lastRenderedOrdersHash = '';

// Fetch all orders from backend (Supports silent live auto-sync)
async function loadOrders(silent = false) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/orders`, {
      headers: getAdminHeaders()
    });
    if (!res.ok) throw new Error("Could not load orders");
    const freshOrders = await res.json();

    if (silent && freshOrders.length > lastKnownOrdersCount && lastKnownOrdersCount > 0) {
      const newCount = freshOrders.length - lastKnownOrdersCount;
      const latestOrder = freshOrders[0];
      showToast(`🎉 ${newCount} New Order received! (${latestOrder.order_id || 'ID'})`);
    }

    lastKnownOrdersCount = freshOrders.length;
    orders = freshOrders;

    const activeEl = document.activeElement;
    const isUserEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');
    if (!isUserEditing) {
      applyOrdersFilterAndSearch();
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
    }, 30000);
  }
}

function stopOrdersAutoRefresh() {
  if (ordersPollInterval) {
    clearInterval(ordersPollInterval);
    ordersPollInterval = null;
  }
}

// Helper to extract all applied offers for an order (Handles 1 or multiple offers)
function getOrderOffers(order) {
  const offers = [];

  // 1. Explicit applied_offers array on order
  if (Array.isArray(order.applied_offers)) {
    order.applied_offers.forEach(o => {
      if (o && typeof o === 'string' && !offers.includes(o.trim())) {
        offers.push(o.trim());
      }
    });
  }

  // 2. Item-level offers or free items
  if (Array.isArray(order.items)) {
    order.items.forEach(it => {
      const off = (it.offer_applied || '').trim();
      if (off && !offers.includes(off)) {
        offers.push(off);
      } else if ((it.is_free || it.price === 0) && !offers.some(o => o.toLowerCase().includes('free') || o.toLowerCase().includes('pack'))) {
        offers.push('Buy 1 Get 2 Free (Pack Offer)');
      }
    });
  }

  // 3. Free Delivery offer
  if (order.delivery_charge === 0 && (order.grandTotal || order.grand_total || 0) >= 299 && !offers.some(o => o.toLowerCase().includes('shipping') || o.toLowerCase().includes('delivery'))) {
    offers.push('Free Delivery');
  }

  // 4. Prepaid Savings offer (avoided COD fee)
  const isPrepaid = order.payment_method && !order.payment_method.toLowerCase().includes('cash') && !order.payment_method.toLowerCase().includes('cod');
  if (isPrepaid && !offers.some(o => o.toLowerCase().includes('prepaid'))) {
    offers.push('Prepaid Savings');
  }

  return offers;
}

// Render orders list table safely without screen vibration or losing input focus
function renderOrders(ordersList, force = false) {
  const currentHash = JSON.stringify(ordersList || []);
  const activeEl = document.activeElement;
  const isEditingInTable = activeEl && ordersListBody && ordersListBody.contains(activeEl);

  if (!force && isEditingInTable) {
    return;
  }

  if (!force && lastRenderedOrdersHash === currentHash) {
    return;
  }

  lastRenderedOrdersHash = currentHash;
  ordersListBody.innerHTML = '';

  if (!ordersList || ordersList.length === 0) {
    ordersListBody.innerHTML = `
      <tr>
        <td colspan="14" style="text-align: center; padding: 30px; font-weight: 600; color: var(--text-muted);">
          No orders found.
        </td>
      </tr>
    `;
    return;
  }

  ordersList.forEach((order, index) => {
    const tr = document.createElement('tr');
    
    const isNewOrder = order.created_at
      ? (new Date().getTime() - new Date(order.created_at).getTime()) < (12 * 3600 * 1000)
      : (index === 0);

    const isPrepared = !!order.is_prepared;

    if (isPrepared) {
      tr.classList.add('order-row-prepared');
    } else if (isNewOrder) {
      tr.classList.add('new-order-row');
    }

    const formattedDate = order.created_at 
      ? new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'N/A';

    const currentStatus = order.status || 'Processing';
    const statusOptions = ['Processing', 'Dispatched', 'Shipped', 'Delivered', 'Cancelled', 'Pending Payment', 'Paid'];
    const currentStatusClass = getOrderStatusClass(currentStatus);

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

    const itemsHtml = order.items && order.items.length > 0
      ? order.items.map(item => {
          const isFreeItem = item.is_free || item.price === 0;
          return `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; background: #ffffff; padding: 6px 8px; border-radius: 8px; border: 1px solid ${isFreeItem ? '#a7f3d0' : '#cbd5e1'};">
            ${item.thumbnail ? `<img src="${getImageUrl(item.thumbnail)}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;" alt="">` : ''}
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 700; color: var(--text-main); font-size: 11.5px; line-height: 1.2;" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</span>
              ${isFreeItem ? `
                <span style="font-size: 9px; font-weight: 800; color: #047857; background: #d1fae5; border: 1px solid #6ee7b7; padding: 1px 5px; border-radius: 4px; display: inline-block; width: fit-content; margin-top: 1px;">
                  🎁 FREE ITEM ${item.offer_applied ? `(${escapeHTML(item.offer_applied)})` : ''}
                </span>
              ` : ''}
              ${(item.sku || item.SKU) ? `<span style="font-family: monospace; font-size: 9.5px; font-weight: 800; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 1px 5px; border-radius: 4px; display: inline-block; width: fit-content; margin-top: 1px;">🏷️ SKU: ${escapeHTML(item.sku || item.SKU)}</span>` : ''}
              ${item.selected_size ? `<span style="font-size: 9.5px; color: #0284c7; font-weight: 800;">📐 Size: ${escapeHTML(item.selected_size)}</span>` : ''}
              ${item.custom_photo ? `
                <div style="display: flex; gap: 4px; align-items: center; margin-top: 2px;">
                  <a href="${getImageUrl(item.custom_photo)}" target="_blank" style="font-size: 9px; color: #041e42; font-weight: 800; text-decoration: none; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid #bae6fd;">👁️ View Photo</a>
                  <button type="button" class="btn-download-order-photo" data-photo="${escapeHTML(item.custom_photo)}" data-filename="Customer_Photo_Order_${escapeHTML(order.order_id)}.png" style="font-size: 9px; color: #ffffff; font-weight: 800; border: none; background: #041e42; padding: 2px 6px; border-radius: 4px; cursor: pointer;" title="Download customer uploaded photo">📥 Download Photo</button>
                </div>
              ` : ''}
              <div style="display: flex; align-items: center; gap: 6px;">
                ${isFreeItem ? `
                  <span style="font-size: 10px; color: #94a3b8; text-decoration: line-through;">₹${(item.original_price || item.price || 0).toLocaleString('en-IN')}</span>
                  <span style="font-size: 10px; color: #047857; font-weight: 800;">₹0 (FREE)</span>
                ` : `
                  <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">₹${item.price.toLocaleString('en-IN')}</span>
                `}
              </div>
            </div>
          </div>
        `;
      }).join('')
      : '<span style="font-size: 10px; color: var(--text-muted); font-style: italic;">No items specified</span>';

    const appliedOffers = getOrderOffers(order);
    const offersHtml = appliedOffers.length > 0
      ? appliedOffers.map(off => {
          let badgeStyle = 'background: #fef3c7; color: #92400e; border: 1px solid #fde68a;';
          let icon = '🏷️';
          const lower = off.toLowerCase();
          if (lower.includes('free') || lower.includes('get') || lower.includes('buy') || lower.includes('pack')) {
            badgeStyle = 'background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;';
            icon = '🔥';
          } else if (lower.includes('shipping') || lower.includes('delivery')) {
            badgeStyle = 'background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;';
            icon = '🚚';
          } else if (lower.includes('prepaid') || lower.includes('upi')) {
            badgeStyle = 'background: #f5f3ff; color: #5b21b6; border: 1px solid #ddd6fe;';
            icon = '⚡';
          }
          return `
            <div style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; padding: 2.5px 7px; border-radius: 6px; line-height: 1.3; margin-bottom: 3px; ${badgeStyle}">
              <span>${icon}</span>
              <span>${escapeHTML(off)}</span>
            </div>
          `;
        }).join('')
      : '<span style="font-size: 10px; color: var(--text-muted); font-style: italic;">No Offer</span>';

    const existingTrackingId = order.tracking_id || '';
    const cleanPhone = (order.phone || '').replace(/[^0-9]/g, '');
    const waPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    const waMsgText = encodeURIComponent(`Hi ${order.name || 'Customer'}! Your PrintOkiyo order #${order.order_id} has been dispatched. 🚚 Tracking ID: ${existingTrackingId || '[Tracking ID]'}`);
    const waDirectUrl = `https://wa.me/${waPhone}?text=${waMsgText}`;

    // Extract all item SKUs for comma-separated display in order row
    const skuList = [];
    if (Array.isArray(order.items)) {
      order.items.forEach(it => {
        const s = (it.sku || it.SKU || '').trim();
        if (s && !skuList.includes(s)) {
          skuList.push(s);
        }
      });
    }
    const skusCommaSeparated = (order.sku_summary && order.sku_summary.trim()) 
      ? order.sku_summary.trim() 
      : (skuList.length > 0 ? skuList.join(', ') : (order.SKU || order.sku || ''));

    tr.innerHTML = `
      <td style="text-align: center; vertical-align: middle;">
        <label style="cursor: pointer; display: inline-flex; flex-direction: column; align-items: center; gap: 3px;" title="Check to mark as PREPARED (Prevents duplicate product placing)">
          <input 
            type="checkbox" 
            class="order-prepared-checkbox" 
            data-id="${escapeHTML(order.order_id)}" 
            ${isPrepared ? 'checked' : ''} 
            style="width: 17px; height: 17px; accent-color: #10b981; cursor: pointer;"
          >
          <span style="font-size: 8px; font-weight: 800; color: ${isPrepared ? '#059669' : '#94a3b8'}; text-transform: uppercase; letter-spacing: 0.3px;">
            ${isPrepared ? 'DONE' : 'PENDING'}
          </span>
        </label>
      </td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 3px; align-items: flex-start;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700; color: var(--primary);">${escapeHTML(order.order_id)}</span>
            ${isNewOrder && !isPrepared ? '<span class="new-badge">NEW</span>' : ''}
          </div>
          ${isPrepared ? `
            <span class="prepared-lock-badge" title="This order has been prepared / placed. Do not touch or duplicate!">
              🔒 PREPARED (DON'T TOUCH)
            </span>
          ` : ''}
        </div>
      </td>
      <td style="white-space: nowrap;">${formattedDate}</td>
      <td>
        <div style="font-weight: 700; color: var(--text-main);">${escapeHTML(order.name)}</div>
        <div style="font-size: 10px; color: var(--text-muted);">${escapeHTML(order.email || '')}</div>
      </td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start; min-width: 120px;">
          ${skusCommaSeparated ? `
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; font-weight: 800; color: #0284c7; background: #f0f9ff; border: 1px solid #bae6fd; padding: 4px 8px; border-radius: 6px; letter-spacing: 0.5px; line-height: 1.4; word-break: break-word;" title="Order SKUs to Print">
              🏷️ ${escapeHTML(skusCommaSeparated)}
            </div>
            <button type="button" class="btn-copy-order-sku" data-sku="${escapeHTML(skusCommaSeparated)}" style="font-size: 9.5px; font-weight: 700; color: #0369a1; background: #e0f2fe; border: 1px solid #bae6fd; padding: 2px 6px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Copy all SKUs to clipboard">
              📋 Copy SKU
            </button>
          ` : `
            <span style="font-size: 10px; color: var(--text-muted); font-style: italic;">No SKU</span>
          `}
        </div>
      </td>
      <td>
        <div style="max-width: 220px; max-height: 100px; overflow-y: auto;">
          ${itemsHtml}
        </div>
      </td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 2px; min-width: 130px; max-width: 170px;">
          ${offersHtml}
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
        <button type="button" class="btn-resend-confirm" style="padding: 5px 8px; font-size: 10px; font-weight: 700; margin-top: 4px; background: #0284c7; color: #fff; border: none; border-radius: 6px; cursor: pointer; display: block; width: 100%; text-align: center;" data-id="${escapeHTML(order.order_id)}" title="Send WhatsApp Order Confirmation Template">
          📩 WA Order Confirmation
        </button>
      </td>
    `;
    
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

    const prepCheckbox = tr.querySelector('.order-prepared-checkbox');
    if (prepCheckbox) {
      prepCheckbox.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        await handleToggleOrderPrepared(order.order_id, isChecked);
      });
    }

    tr.querySelector('.btn-view-invoice').addEventListener('click', () => {
      openInvoice(order.order_id);
    });

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
          showToast(`⚠️ Confirmation send issue: ${errData.detail || 'Failed to send'}`);
        }
      } catch (err) {
        showToast(`⚠️ Connection error: ${err.message}`);
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

async function handleToggleOrderPrepared(orderId, isPrepared) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/toggle-prepared`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ is_prepared: isPrepared })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update prepared status");
    }

    const data = await res.json();
    const updatedOrder = data.order || {};

    // Update in local cache
    const target = orders.find(o => o.order_id === orderId);
    if (target) {
      target.is_prepared = isPrepared;
      target.prepared_at = updatedOrder.prepared_at || (isPrepared ? new Date().toISOString() : null);
    }

    if (isPrepared) {
      showToast(`🔒 Order #${orderId} marked as PREPARED (DON'T TOUCH)!`);
    } else {
      showToast(`🔓 Order #${orderId} unmarked as prepared.`);
    }

    applyOrdersFilterAndSearch();
  } catch (err) {
    console.error("Order prepared toggle failed:", err);
    showToast(`Error: ${err.message}`);
    loadOrders(false);
  }
}

// Search and filter orders by search query and prepared status
function applyOrdersFilterAndSearch() {
  const query = (orderSearchInput ? orderSearchInput.value : '').toLowerCase().trim();
  const filterSelect = document.getElementById('filter-prepared-status');
  const preparedFilter = filterSelect ? filterSelect.value : 'all';

  let filtered = orders;

  // Filter by prepared status
  if (preparedFilter === 'unprepared') {
    filtered = filtered.filter(o => !o.is_prepared);
  } else if (preparedFilter === 'prepared') {
    filtered = filtered.filter(o => !!o.is_prepared);
  }

  // Filter by text search
  if (query) {
    filtered = filtered.filter(o => 
      (o.order_id && o.order_id.toLowerCase().includes(query)) ||
      (o.name && o.name.toLowerCase().includes(query)) ||
      (o.phone && o.phone.toLowerCase().includes(query)) ||
      (o.address && o.address.toLowerCase().includes(query)) ||
      (o.payment_method && o.payment_method.toLowerCase().includes(query)) ||
      (o.sku_summary && o.sku_summary.toLowerCase().includes(query)) ||
      (Array.isArray(o.skus) && o.skus.some(s => s && s.toLowerCase().includes(query))) ||
      (o.items && o.items.some(item => 
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.sku && item.sku.toLowerCase().includes(query)) ||
        (item.SKU && item.SKU.toLowerCase().includes(query))
      ))
    );
  }

  renderOrders(filtered, true);
}

// Search/Filter orders on search input
function handleOrderSearch(e) {
  applyOrdersFilterAndSearch();
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

function openInvoice(orderId) {
  const order = orders.find(o => o.order_id === orderId);
  if (!order) return;

  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString('en-IN')
    : 'N/A';

  document.getElementById('inv-billing-name').innerText = order.name;
  document.getElementById('inv-billing-address').innerText = order.address;
  document.getElementById('inv-billing-phone').innerText = order.phone;

  document.getElementById('inv-shipping-name').innerText = order.name;
  document.getElementById('inv-shipping-address').innerText = order.address;
  document.getElementById('inv-shipping-phone').innerText = order.phone;

  const invOrderIdEl = document.getElementById('inv-order-id');
  if (invOrderIdEl) invOrderIdEl.innerText = order.order_id;

  const invOrderDateEl = document.getElementById('inv-order-date');
  if (invOrderDateEl) invOrderDateEl.innerText = formattedDate;

  const invInvoiceIdEl = document.getElementById('inv-invoice-id');
  if (invInvoiceIdEl) invInvoiceIdEl.innerText = order.order_id;

  const invInvoiceDateEl = document.getElementById('inv-invoice-date');
  if (invInvoiceDateEl) invInvoiceDateEl.innerText = formattedDate;

  // Extract all SKUs for invoice banner
  const invSkuList = [];
  if (Array.isArray(order.items)) {
    order.items.forEach(it => {
      const s = (it.sku || it.SKU || '').trim();
      if (s && !invSkuList.includes(s)) invSkuList.push(s);
    });
  }
  const invSkusComma = (order.sku_summary && order.sku_summary.trim())
    ? order.sku_summary.trim()
    : (invSkuList.length > 0 ? invSkuList.join(', ') : (order.SKU || order.sku || 'N/A'));

  const invSkusEl = document.getElementById('inv-skus-text');
  if (invSkusEl) invSkusEl.innerText = invSkusComma;

  const btnCopyInvSkus = document.getElementById('btn-copy-inv-skus');
  if (btnCopyInvSkus) {
    btnCopyInvSkus.onclick = () => {
      navigator.clipboard.writeText(invSkusComma);
      showToast(`📋 Copied SKUs: ${invSkusComma}`);
    };
  }

  // Extract and show applied offers in invoice
  const invOffers = getOrderOffers(order);
  const invOffersBanner = document.getElementById('inv-offers-banner');
  const invOffersText = document.getElementById('inv-offers-text');
  if (invOffersBanner && invOffersText) {
    if (invOffers.length > 0) {
      invOffersText.innerText = invOffers.join('  •  ');
      invOffersBanner.style.display = 'flex';
    } else {
      invOffersBanner.style.display = 'none';
    }
  }

  const itemsBody = document.getElementById('invoice-items-body');
  itemsBody.innerHTML = '';

  let itemsSubtotal = 0;
  let slNo = 1;

  order.items.forEach(item => {
    const row = document.createElement('tr');
    const isFree = item.is_free || item.price === 0;
    const rate = isFree ? 0 : item.price;
    const qty = 1;
    const amount = qty * rate;
    itemsSubtotal += amount;

    row.innerHTML = `
      <td class="text-center">${slNo++}</td>
      <td style="font-weight: 700; color: #111111;">
        ${escapeHTML(item.title)}
        ${isFree ? `<div style="font-size: 9.5px; color: #047857; font-weight: 800; margin-top: 2px;">🎁 FREE ITEM ${item.offer_applied ? `(${escapeHTML(item.offer_applied)})` : ''}</div>` : ''}
        ${(item.sku || item.SKU) ? `<div style="font-family: monospace; font-size: 10px; color: #0369a1; font-weight: 700; margin-top: 2px;">SKU: ${escapeHTML(item.sku || item.SKU)}</div>` : ''}
        ${item.selected_size ? `<div style="font-size: 10px; color: #64748b; font-weight: 600;">Size: ${escapeHTML(item.selected_size)}</div>` : ''}
      </td>
      <td class="text-right">${isFree ? '<span style="color: #047857; font-weight: 800;">FREE</span>' : `₹${rate.toLocaleString('en-IN')}`}</td>
      <td class="text-center">${qty}</td>
      <td class="text-right">${isFree ? '<span style="color: #047857; font-weight: 800;">₹0</span>' : `₹${amount.toLocaleString('en-IN')}`}</td>
    `;
    itemsBody.appendChild(row);
  });

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

  document.getElementById('inv-total').innerText = `₹${order.grand_total.toLocaleString('en-IN')}`;
  document.getElementById('inv-words').innerText = numberToWords(order.grand_total);

  invoiceModal.classList.remove('hidden');
}

function closeInvoice() {
  invoiceModal.classList.add('hidden');
}

function printInvoice() {
  window.print();
}

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

  let csvFile = '\uFEFF';
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
    "Prepared (Don't Touch)", "Order ID", "Date", "Customer Name", "SKU Codes", "Ordered Items", "Offers Applied", "Phone", "Email",
    "Shipping Address", "Grand Total (₹)",
    "Payment Method", "Payment Status", "Order Status", "Tracking ID / AWB"
  ];

  const rows = [headers];
  orders.forEach(o => {
    const skuList = [];
    if (Array.isArray(o.items)) {
      o.items.forEach(it => {
        const s = (it.sku || it.SKU || '').trim();
        if (s && !skuList.includes(s)) skuList.push(s);
      });
    }
    const skusCommaSeparated = (o.sku_summary && o.sku_summary.trim())
      ? o.sku_summary.trim()
      : (skuList.length > 0 ? skuList.join(', ') : (o.SKU || o.sku || ''));

    const itemsSummary = (o.items || []).map(it => `${it.title}${(it.sku || it.SKU) ? ` [SKU: ${it.sku || it.SKU}]` : ''}${it.is_free ? ' [FREE ITEM]' : ''} (x${it.quantity || 1})`).join(' | ');
    const formattedDate = o.created_at
      ? new Date(o.created_at).toLocaleString('en-IN')
      : (o.date || '');

    const appliedOffers = getOrderOffers(o);
    const offersText = appliedOffers.length > 0 ? appliedOffers.join('; ') : 'None';
    const prepStatusText = o.is_prepared ? "PREPARED / PLACED" : "PENDING";

    rows.push([
      prepStatusText,
      o.order_id || '',
      formattedDate,
      o.name || 'Guest',
      skusCommaSeparated,
      itemsSummary,
      offersText,
      o.phone || '',
      o.email || '',
      o.address || '',
      o.grandTotal || o.grand_total || 0,
      o.payment_method || 'Online',
      o.payment_status || 'pending',
      o.status || 'Processing',
      o.tracking_id || ''
    ]);
  });

  const dateStr = new Date().toISOString().split('T')[0];
  exportToCSV(`PrintOkiyo_Orders_${dateStr}.csv`, rows);
  showToast("📊 Orders exported to Excel (.csv) successfully!");
}

function handleExportCustomersExcel() {
  if (!users || users.length === 0) {
    showToast("⚠️ No customers available to export.");
    return;
  }

  const headers = ["User ID", "Customer Name", "Phone Number", "Email", "Total Orders", "Registered Date"];
  const rows = [headers];

  users.forEach(u => {
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
  exportToCSV(`PrintOkiyo_Customers_${dateStr}.csv`, rows);
  showToast("👥 Customers directory exported to Excel (.csv) successfully!");
}

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

// Secure Event Delegation for Orders Table (prevents inline onclick DOM XSS)
if (ordersListBody) {
  ordersListBody.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-copy-order-sku');
    if (copyBtn) {
      const sku = copyBtn.getAttribute('data-sku') || '';
      if (sku) {
        navigator.clipboard.writeText(sku).then(() => {
          showToast(`📋 Copied SKUs: ${sku}`);
        }).catch(() => {
          showToast(`📋 Copied SKUs: ${sku}`);
        });
      }
      return;
    }

    const dlBtn = e.target.closest('.btn-download-order-photo');
    if (dlBtn) {
      const photo = dlBtn.getAttribute('data-photo') || '';
      const fname = dlBtn.getAttribute('data-filename') || 'Customer_Photo.png';
      if (photo && window.downloadCustomPhoto) {
        window.downloadCustomPhoto(photo, fname);
      }
      return;
    }
  });
}

