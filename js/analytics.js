// PrintOkiyo Admin - Financial Analytics & Customer Directory

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
