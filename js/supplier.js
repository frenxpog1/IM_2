// Supplier Management JS

let suppliers = [], products = [], orders = [], modalProducts = [], restockProducts = [];

// --- Modal Product Table Management ---
function renderSupplierProductsTable() {
  const supplierProductsTableBody = document.querySelector('#supplierProductsTable tbody');
  if (!supplierProductsTableBody) return;
  supplierProductsTableBody.innerHTML = '';
  modalProducts.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.style.fontSize = '0.97em';
    tr.innerHTML = `
      <td><input type="text" class="modal-product-name" value="${p.product_name !== undefined ? p.product_name : ''}" placeholder="e.g. Premium Dog Food" style="width:98%; min-width:90px;" /></td>
      <td><input type="text" class="modal-product-desc" value="${p.description !== undefined ? p.description : ''}" placeholder="Description" style="width:98%; min-width:100px;" /></td>
      <td><input type="number" class="modal-product-price" value="${p.unit_price !== undefined && p.unit_price !== null ? p.unit_price : ''}" min="0" step="0.01" placeholder="0.00" style="width:80px; min-width:60px;" /></td>
      <td><input type="number" class="modal-product-min" value="${p.min_order_quantity !== undefined && p.min_order_quantity !== null ? p.min_order_quantity : ''}" min="1" step="1" placeholder="1" style="width:60px; min-width:40px;" /></td>
      <td><input type="number" class="modal-product-lead" value="${p.lead_time_days !== undefined && p.lead_time_days !== null ? p.lead_time_days : ''}" min="0" step="1" placeholder="0" style="width:60px; min-width:40px;" /></td>
      <td><button type="button" class="btn btn-danger btn-sm delete-product-btn" data-idx="${idx}" style="background:#e74c3c;color:#fff;border:none;padding:4px 10px;border-radius:3px; cursor:pointer;">Delete</button></td>
    `;
    supplierProductsTableBody.appendChild(tr);
  });
  // Focus the last row's first input if a new row was added
  if (modalProducts.length > 0) {
    const lastRow = supplierProductsTableBody.lastElementChild;
    if (lastRow) {
      const nameInput = lastRow.querySelector('.modal-product-name');
      if (nameInput && nameInput.value === '') nameInput.focus();
    }
  }
}

function resetSupplierModalProducts(products) {
  modalProducts = (products || []).map(p => ({
    product_name: p.product_name !== undefined ? p.product_name : '',
    description: p.description !== undefined ? p.description : '',
    unit_price: p.unit_price !== undefined && p.unit_price !== null ? p.unit_price : '',
    min_order_quantity: p.min_order_quantity !== undefined && p.min_order_quantity !== null ? p.min_order_quantity : '',
    lead_time_days: p.lead_time_days !== undefined && p.lead_time_days !== null ? p.lead_time_days : ''
  }));
  renderSupplierProductsTable();
}

// Move these declarations to the top so they are always defined before use
const productSupplierFilter = document.getElementById('productSupplierFilter');
const orderSupplierFilter = document.getElementById('orderSupplierFilter');

// --- Helper Functions ---

/**
 * Check if current user can edit a specific supplier
 * Mirrors the permission logic used in staff user management
 * @param {number} supplierId - ID of the supplier to check edit permissions for
 * @returns {boolean} - True if user can edit the supplier, false otherwise
 */
function canEditSupplier(supplierId) {
  if (!window.rbac) {
    console.warn('RBAC not initialized for supplier edit check');
    return false;
  }

  const userRole = window.rbac.userRole || 0;
  const userSupplierId = window.rbac.userSupplierId || 0;

  // Debug logging for supplier users (similar to staff user management)
  if (userRole === 3) {
    console.log(`Supplier Edit Permission Check - User Role: ${userRole}, User Supplier ID: ${userSupplierId}, Target Supplier ID: ${supplierId}`);
  }

  if (userRole === 1 || userRole === 2) {
    // Admin or Staff - check general update permission
    const hasPermission = window.rbac.checkActionPermission('suppliers', 'update');
    if (userRole === 3) {
      console.log(`Admin/Staff Update Permission: ${hasPermission}`);
    }
    return hasPermission;
  } else if (userRole === 3) {
    // Supplier - can only edit their own profile
    const isOwnSupplier = parseInt(userSupplierId) === parseInt(supplierId);
    console.log(`Is Own Supplier: ${isOwnSupplier}, Update Own Permission: ${window.rbac.checkActionPermission('suppliers', 'update_own')}`);
    return isOwnSupplier && window.rbac.checkActionPermission('suppliers', 'update_own');
  }

  return false;
}

/**
 * Check if current user can delete a specific supplier
 * @param {number} supplierId - ID of the supplier to check delete permissions for
 * @returns {boolean} - True if user can delete the supplier, false otherwise
 */
function canDeleteSupplier(supplierId) {
  if (!window.rbac) {
    return false;
  }

  const userRole = window.rbac.userRole || 0;

  // Only admin/staff can delete suppliers
  return (userRole === 1 || userRole === 2) && window.rbac.checkActionPermission('suppliers', 'delete');
}

/**
 * Show notification message to user
 * @param {string} message - Message to display
 * @param {string} type - Type of notification ('success', 'error', 'info')
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    z-index: 1000;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;

  switch (type) {
    case 'error':
      notification.style.backgroundColor = '#dc3545';
      break;
    case 'success':
      notification.style.backgroundColor = '#28a745';
      break;
    default:
      notification.style.backgroundColor = '#007bff';
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);

  console.log(`[${type.toUpperCase()}] ${message}`);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize RBAC first
  if (window.rbac) {
    await window.rbac.initializePermissions();
  }

  // --- REMOVE SUPPLIER-ONLY RESTRICTIONS: allow all suppliers to see all data ---
  fetchSuppliers();

  // --- Tab switching ---
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(this.dataset.tab + '-tab').classList.add('active');
    });
  });



  // --- SUPPLIER SEARCH ---
  const supplierSearch = document.getElementById('supplierSearch');
  if (supplierSearch) {
    supplierSearch.addEventListener('input', e => fetchSuppliers(e.target.value));
  }

  // --- PRODUCT FILTERS ---
  if (productSupplierFilter) productSupplierFilter.addEventListener('change', renderProducts);
  if (productSearch) productSearch.addEventListener('input', renderProducts);

  // --- ADD PRODUCT BUTTON ---
  const addProductBtn = document.getElementById('addProductBtn');
  if (addProductBtn) {
    // Show add product button only for supplier users
    const userRole = window.rbac ? window.rbac.userRole : 0;
    if (userRole === 3) {
      addProductBtn.style.display = '';
      addProductBtn.addEventListener('click', () => {
        openAddProductModal();
      });
    } else {
      addProductBtn.style.display = 'none';
    }
  }

  // --- ORDER FILTERS ---
  if (orderSupplierFilter) orderSupplierFilter.addEventListener('change', renderOrders);
  if (orderSearch) orderSearch.addEventListener('input', renderOrders);

  // --- CREATE RESTOCK ORDER BUTTON ---
  const createRestockOrderBtn = document.getElementById('createRestockOrderBtn');
  if (createRestockOrderBtn) {
    // Hide restock order button for supplier users since they have "Manage Requests" in inventory page
    const userRole = window.rbac ? window.rbac.userRole : 0;
    
    if (userRole === 3) {
      // Supplier users: Hide the button (they use inventory page for request management)
      createRestockOrderBtn.style.display = 'none';
    } else {
      // Admin/Staff: Show the button if they have permission
      const canCreateRestock = window.rbac && window.rbac.checkActionPermission('suppliers', 'update');
      if (canCreateRestock) {
        createRestockOrderBtn.style.display = '';
        createRestockOrderBtn.addEventListener('click', () => {
          openRestockOrderModal();
        });
      } else {
        createRestockOrderBtn.style.display = 'none';
      }
    }
  }

  // --- RESTOCK REQUESTS TAB ---
  const restockRequestsTab = document.getElementById('restockRequestsTab');
  if (restockRequestsTab) {
    // Show restock requests tab only for supplier users
    const userRole = window.rbac ? window.rbac.userRole : 0;
    if (userRole === 3) {
      restockRequestsTab.style.display = '';
      // Load restock requests when tab is clicked
      restockRequestsTab.addEventListener('click', () => {
        fetchRestockRequests();
      });
    } else {
      restockRequestsTab.style.display = 'none';
    }
  }

  // --- RESTOCK REQUEST FILTERS ---
  const restockRequestSearch = document.getElementById('restockRequestSearch');
  if (restockRequestSearch) {
    restockRequestSearch.addEventListener('input', renderRestockRequests);
  }

  // Status filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderRestockRequests();
    });
  });

  // --- SUPPLIER MODAL ---
  const addSupplierBtn = document.getElementById('addSupplierBtn');
  const supplierModal = document.getElementById('supplierModal');
  const closeSupplierModal = document.getElementById('closeSupplierModal');
  const supplierForm = document.getElementById('supplierForm');
  const supplierModalTitle = document.getElementById('supplierModalTitle');

  // Check if user can create suppliers and hide/show Add button accordingly
  if (addSupplierBtn) {
    const canCreate = window.rbac && window.rbac.checkActionPermission('suppliers', 'create');
    if (canCreate) {
      addSupplierBtn.style.display = '';
      addSupplierBtn.addEventListener('click', () => {
        if (supplierModalTitle) supplierModalTitle.textContent = 'Add Supplier';
        supplierForm.reset();
        supplierForm.supplierId.value = '';
        supplierModal.style.display = 'block';
      });
    } else {
      addSupplierBtn.style.display = 'none';
    }
  }
  if (closeSupplierModal) closeSupplierModal.addEventListener('click', () => supplierModal.style.display = 'none');
  if (supplierModal) supplierModal.addEventListener('click', e => { if (e.target === supplierModal) supplierModal.style.display = 'none'; });
  const cancelSupplierBtn = document.getElementById('cancelSupplierBtn');
  if (cancelSupplierBtn) cancelSupplierBtn.addEventListener('click', () => supplierModal.style.display = 'none');

  // --- SUPPLIER FORM SUBMIT ---
  let isSubmitting = false;
  if (supplierForm) {
    supplierForm.addEventListener('submit', e => {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      const submitBtn = supplierForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      const data = {
        id: supplierForm.supplierId.value,
        name: supplierForm.supplierName.value,
        contact_person: supplierForm.supplierContactPerson.value,
        email: supplierForm.supplierEmail.value,
        phone: supplierForm.supplierPhone.value,
        address: supplierForm.supplierAddress.value,
        city: supplierForm.supplierCity.value,
        state: supplierForm.supplierState.value,
        postal_code: supplierForm.supplierPostalCode.value,
        country: supplierForm.supplierCountry.value,
        website: supplierForm.supplierWebsite.value,
        tax_id: supplierForm.supplierTaxId.value,
        payment_terms: supplierForm.supplierPaymentTerms.value,
        status: supplierForm.supplierStatus.value,
        notes: supplierForm.supplierNotes.value
      };
      console.log('Submitting supplier data:', data);

      fetch('backend/suppliers.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(r => {
          console.log('Response status:', r.status);
          return r.json();
        })
        .then(response => {
          console.log('Response data:', response);
          if (response.success) {
            alert(data.id ? 'Supplier updated successfully' : 'Supplier added successfully');
            supplierModal.style.display = 'none';
            fetchSuppliers();
          } else {
            alert('Error: ' + (response.error || 'Unknown error'));
          }
        })
        .catch(error => {
          console.error('Error saving supplier:', error);
          alert('Error saving supplier: ' + error.message);
        })
        .finally(() => {
          isSubmitting = false;
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  // --- MANAGEMENT FETCH/RENDER FUNCTIONS ---
  function fillSupplierFilters() {
    [productSupplierFilter, orderSupplierFilter].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '<option value="">All Suppliers</option>' + suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    });
  }

  function renderSuppliers() {
    const supplierTableBody = document.querySelector('#supplierTable tbody');
    if (!supplierTableBody) return;
    supplierTableBody.innerHTML = '';
    suppliers.forEach(s => {
      const tr = document.createElement('tr');

      // Use helper functions for consistent permission checking
      const canEditThis = canEditSupplier(s.id);
      const canDeleteThis = canDeleteSupplier(s.id);

      const editButton = canEditThis ?
        `<button class="editOrderBtn" onclick="window.editSupplier(${s.id})">Edit</button>` :
        `<button class="editOrderBtn rbac-disabled" disabled>Edit</button>`;

      const deleteButton = canDeleteThis ?
        `<button class="deleteOrderBtn" onclick="window.deleteSupplier(${s.id})" data-action="delete" data-module="suppliers">Delete</button>` :
        `<button class="deleteOrderBtn rbac-disabled" disabled>Delete</button>`;

      tr.innerHTML = `
        <td>${s.name}</td>
        <td>${s.contact_person || ''}</td>
        <td>${s.email || ''}</td>
        <td>${s.phone || ''}</td>
        <td>${s.city || ''}</td>
        <td>${s.status || ''}</td>
        <td>
          ${editButton}
          ${deleteButton}
        </td>
      `;
      supplierTableBody.appendChild(tr);
    });
  }

  function renderProducts() {
    const productsTableBody = document.querySelector('#productsTable tbody');
    if (!productsTableBody) return;
    const supplierId = productSupplierFilter && productSupplierFilter.value;
    const search = productSearch && productSearch.value ? productSearch.value.toLowerCase() : '';
    productsTableBody.innerHTML = '';
    products.filter(p =>
      (!supplierId || p.supplier_id == supplierId) &&
      (p.product_name.toLowerCase().includes(search) || (p.supplier || '').toLowerCase().includes(search))
    ).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.supplier || ''}</td>
        <td>${p.product_name}</td>
        <td>${p.description || ''}</td>
        <td>${parseFloat(p.unit_price).toFixed(2)}</td>
        <td>${p.min_order_quantity}</td>
        <td>${p.lead_time_days}</td>
      `;
      productsTableBody.appendChild(tr);
    });
  }

  function renderOrders() {
    const ordersTableBody = document.querySelector('#ordersTable tbody');
    if (!ordersTableBody) return;
    const supplierId = orderSupplierFilter && orderSupplierFilter.value;
    const search = orderSearch && orderSearch.value ? orderSearch.value.toLowerCase() : '';
    ordersTableBody.innerHTML = '';

    const filteredOrders = orders.filter(o =>
      (!supplierId || o.supplier_id == supplierId) &&
      (o.po_number.toLowerCase().includes(search) ||
        (o.supplier || '').toLowerCase().includes(search) ||
        (o.status || '').toLowerCase().includes(search))
    );

    // Sort by order date (newest first)
    filteredOrders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

    filteredOrders.forEach(o => {
      const tr = document.createElement('tr');
      const formatCurrency = (amount) => '₱' + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const getStatusClass = (status) => `status-badge status-${status.toLowerCase().replace(' ', '-')}`;

      tr.innerHTML = `
        <td><strong>${o.po_number}</strong></td>
        <td>${o.supplier || ''}</td>
        <td>${formatDate(o.order_date)}</td>
        <td><span class="${getStatusClass(o.status)}">${o.status}</span></td>
        <td style="text-align: right; font-weight: bold;">${formatCurrency(o.total_amount)}</td>
        <td>
          <button class="viewOrderBtn" onclick="viewOrderDetails(${o.id})" title="View Receipt">
            <span class="material-icons" style="font-size: 16px;">receipt</span> View
          </button>
        </td>
      `;
      ordersTableBody.appendChild(tr);
    });

    // Add summary row if there are orders
    if (filteredOrders.length > 0) {
      const totalAmount = filteredOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
      const summaryRow = document.createElement('tr');
      summaryRow.className = 'summary-row';
      summaryRow.innerHTML = `
        <td colspan="4" style="text-align: right; font-weight: bold; background: #f8f9fa;">
          Total (${filteredOrders.length} orders):
        </td>
        <td style="text-align: right; font-weight: bold; background: #f8f9fa; color: #007bff;">
          ₱${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="background: #f8f9fa;"></td>
      `;
      ordersTableBody.appendChild(summaryRow);
    }

    // Add CSS for status badges if not already added
    if (!document.getElementById('purchase-order-styles')) {
      const style = document.createElement('style');
      style.id = 'purchase-order-styles';
      style.textContent = `
        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .status-delivered { background: #d4edda; color: #155724; }
        .status-confirmed { background: #cce5ff; color: #004085; }
        .status-shipped { background: #b8e6e6; color: #0c5460; }
        .status-sent { background: #e2d9f3; color: #4a148c; }
        .status-draft { background: #e2e3e5; color: #383d41; }
        .status-cancelled { background: #f8d7da; color: #721c24; }
        .viewOrderBtn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        }
        .viewOrderBtn:hover {
          background: #0056b3;
        }
        .summary-row {
          border-top: 2px solid #007bff;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function fetchSuppliers(q = '') {
    fetch('backend/suppliers.php?action=' + (q ? 'search&q=' + encodeURIComponent(q) : 'list'))
      .then(r => r.json())
      .then(data => {
        let allSuppliers = data.suppliers || [];

        // Filter suppliers based on user role
        const userRole = window.rbac ? window.rbac.userRole : 0;
        const userSupplierId = window.rbac ? window.rbac.userSupplierId : 0;

        if (userRole === 3 && userSupplierId) {
          // Supplier users can only see their own supplier record
          suppliers = allSuppliers.filter(s => s.id == userSupplierId);
          console.log(`Supplier user (ID: ${userSupplierId}) - Filtered to own supplier only:`, suppliers);
        } else {
          // Admin/Staff can see all suppliers
          suppliers = allSuppliers;
        }

        renderSuppliers();
        afterSuppliersLoaded();
      })
      .catch(error => {
        console.error('Error fetching suppliers:', error);
      });
  }

  function fetchProducts() {
    Promise.all(suppliers.map(s =>
      fetch('backend/suppliers.php?action=products&supplier_id=' + s.id)
        .then(r => r.json())
        .then(data => (data.products || []).map(p => ({ ...p, supplier: s.name, supplier_id: s.id })))
    )).then(results => {
      products = results.flat();
      renderProducts();
    });
  }

  function fetchOrders() {
    console.log('Fetching orders for suppliers:', suppliers);
    Promise.all(suppliers.map(s =>
      fetch('backend/suppliers.php?action=orders&supplier_id=' + s.id)
        .then(r => r.json())
        .then(data => {
          console.log(`Orders for supplier ${s.name} (ID: ${s.id}):`, data);
          return (data.orders || []).map(o => ({ ...o, supplier: s.name, supplier_id: s.id }));
        })
    )).then(results => {
      orders = results.flat();
      console.log('All orders fetched:', orders);
      renderOrders();
    });
  }

  function afterSuppliersLoaded() {
    fillSupplierFilters();
    fetchProducts();
    fetchOrders();
  }

  // --- RESTOCK REQUESTS FUNCTIONS ---
  let restockRequests = [];

  function fetchRestockRequests() {
    fetch('backend/suppliers.php?action=restock_requests')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          restockRequests = data.requests || [];
          renderRestockRequests();
        } else {
          showNotification('Error loading restock requests: ' + (data.error || 'Unknown error'), 'error');
        }
      })
      .catch(error => {
        console.error('Error fetching restock requests:', error);
        showNotification('Error loading restock requests', 'error');
      });
  }

  function renderRestockRequests() {
    const restockRequestsTableBody = document.querySelector('#restockRequestsTable tbody');
    if (!restockRequestsTableBody) return;

    const search = document.getElementById('restockRequestSearch')?.value?.toLowerCase() || '';
    const activeStatus = document.querySelector('.filter-btn.active')?.dataset?.status || 'pending';

    const filteredRequests = restockRequests.filter(req => {
      const matchesSearch = !search ||
        req.product_name.toLowerCase().includes(search) ||
        req.requested_by_username.toLowerCase().includes(search) ||
        req.id.toString().includes(search);

      const matchesStatus = req.status === activeStatus;

      return matchesSearch && matchesStatus;
    });

    restockRequestsTableBody.innerHTML = '';

    if (filteredRequests.length === 0) {
      restockRequestsTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 20px; color: #666;">
            No ${activeStatus} restock requests found
          </td>
        </tr>
      `;
      return;
    }

    filteredRequests.forEach(req => {
      const tr = document.createElement('tr');
      const totalValue = parseFloat(req.quantity) * parseFloat(req.unit_price);
      const formatCurrency = (amount) => '₱' + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

      // Action buttons based on status
      let actionButtons = '';
      if (req.status === 'pending') {
        actionButtons = `
          <button class="btn btn-success btn-sm" onclick="handleRestockRequest(${req.id}, 'approved')" style="margin-right: 5px;">
            Approve
          </button>
          <button class="btn btn-danger btn-sm" onclick="handleRestockRequest(${req.id}, 'declined')">
            Decline
          </button>
        `;
      } else {
        actionButtons = `<span class="status-badge status-${req.status}">${req.status.toUpperCase()}</span>`;
      }

      tr.innerHTML = `
        <td><strong>#${req.id}</strong></td>
        <td>
          <strong>${req.product_name}</strong>
          <br><small style="color: #666;">Supplier: ${req.supplier_name}</small>
        </td>
        <td style="text-align: right;">${parseInt(req.quantity).toLocaleString()}</td>
        <td style="text-align: right;">${formatCurrency(req.unit_price)}</td>
        <td style="text-align: right; font-weight: bold;">${formatCurrency(totalValue)}</td>
        <td>${req.requested_by_username || 'Unknown'}</td>
        <td>${formatDate(req.created_at)}</td>
        <td>${actionButtons}</td>
      `;
      restockRequestsTableBody.appendChild(tr);
    });
  }

  // Handle restock request approval/decline
  function handleRestockRequest(requestId, status) {
    if (!confirm(`Are you sure you want to ${status} this restock request?`)) {
      return;
    }

    fetch('backend/suppliers.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'handle_restock_request',
        request_id: requestId,
        status: status
      })
    })
      .then(r => r.json())
      .then(response => {
        if (response.success) {
          showNotification(response.message, 'success');
          fetchRestockRequests(); // Refresh the list
        } else {
          showNotification('Error: ' + (response.error || 'Unknown error'), 'error');
        }
      })
      .catch(error => {
        console.error('Error handling restock request:', error);
        showNotification('Error processing request', 'error');
      });
  }

  // --- ADD PRODUCT MODAL FUNCTIONS ---
  function openAddProductModal() {
    // Create a simple product modal for suppliers
    const modal = document.createElement('div');
    modal.id = 'addProductModal';
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close" onclick="closeAddProductModal()">&times;</span>
        <h2>Add New Product</h2>
        <form id="addProductForm">
          <div class="form-row">
            <label>Product Name:
              <input type="text" id="newProductName" required placeholder="e.g. Premium Dog Food">
            </label>
          </div>
          <div class="form-row">
            <label>Description:
              <textarea id="newProductDescription" placeholder="Product description..."></textarea>
            </label>
          </div>
          <div class="form-row">
            <label>Unit Price (₱):
              <input type="number" id="newProductPrice" step="0.01" min="0" required placeholder="0.00">
            </label>
            <label>Min Order Quantity:
              <input type="number" id="newProductMinOrder" min="1" value="1" required>
            </label>
          </div>
          <div class="form-row">
            <label>Lead Time (days):
              <input type="number" id="newProductLeadTime" min="0" value="0">
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn">Add Product</button>
            <button type="button" class="btn btn-secondary" onclick="closeAddProductModal()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeAddProductModal();
      }
    });
  }

  function closeAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (modal) {
      modal.remove();
    }
  }

  function handleAddProduct(e) {
    e.preventDefault();
    
    const userRole = window.rbac ? window.rbac.userRole : 0;
    const userSupplierId = window.rbac ? window.rbac.userSupplierId : 0;
    
    if (userRole !== 3 || !userSupplierId) {
      showNotification('Only supplier users can add products', 'error');
      return;
    }
    
    const productData = {
      action: 'add_product',
      supplier_id: userSupplierId,
      product_name: document.getElementById('newProductName').value,
      description: document.getElementById('newProductDescription').value,
      unit_price: parseFloat(document.getElementById('newProductPrice').value),
      min_order_quantity: parseInt(document.getElementById('newProductMinOrder').value),
      lead_time_days: parseInt(document.getElementById('newProductLeadTime').value)
    };
    
    fetch('backend/suppliers.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    })
      .then(r => r.json())
      .then(response => {
        if (response.success) {
          showNotification('Product added successfully!', 'success');
          closeAddProductModal();
          fetchProducts(); // Refresh the products list
        } else {
          showNotification('Error: ' + (response.error || 'Unknown error'), 'error');
        }
      })
      .catch(error => {
        console.error('Error adding product:', error);
        showNotification('Error adding product: ' + error.message, 'error');
      });
  }

  // Make functions globally available
  window.fetchRestockRequests = fetchRestockRequests;
  window.renderRestockRequests = renderRestockRequests;
  window.handleRestockRequest = handleRestockRequest;
  window.openAddProductModal = openAddProductModal;
  window.closeAddProductModal = closeAddProductModal;

  // --- RESTOCK ORDER MODAL ---
  const restockOrderModal = document.getElementById('restockOrderModal');
  const closeRestockOrderModal = document.getElementById('closeRestockOrderModal');
  const restockOrderForm = document.getElementById('restockOrderForm');
  const cancelRestockOrder = document.getElementById('cancelRestockOrder');

  if (closeRestockOrderModal) closeRestockOrderModal.addEventListener('click', () => restockOrderModal.style.display = 'none');
  if (restockOrderModal) restockOrderModal.addEventListener('click', e => { if (e.target === restockOrderModal) restockOrderModal.style.display = 'none'; });
  if (cancelRestockOrder) cancelRestockOrder.addEventListener('click', () => restockOrderModal.style.display = 'none');

  // --- RESTOCK ORDER FUNCTIONS ---
  function generatePoNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = String(date.getHours()).padStart(2, '0') + String(date.getMinutes()).padStart(2, '0');
    return `PO-${year}${month}${day}-${time}`;
  }

  function renderRestockProducts() {
    const restockProductsTableBody = document.querySelector('#restockProductsTable tbody');
    if (!restockProductsTableBody) return;

    restockProductsTableBody.innerHTML = '';

    // Get current supplier's products
    const userRole = window.rbac ? window.rbac.userRole : 0;
    let supplierProducts = [];

    if (userRole === 3) {
      // Supplier user - get their products
      const userSupplierId = window.rbac ? window.rbac.userSupplierId : 0;
      supplierProducts = products.filter(p => p.supplier_id == userSupplierId);
    } else {
      // Admin/Staff - this shouldn't happen in normal flow, but handle gracefully
      supplierProducts = products;
    }

    supplierProducts.forEach(product => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 10px; border: 1px solid #dee2e6;">
          <input type="checkbox" class="restock-product-select" data-product-id="${product.id}" data-product-name="${product.product_name}" data-unit-price="${product.unit_price}" data-description="${product.description || ''}">
        </td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">
          <strong>${product.product_name}</strong>
          ${product.description ? `<br><small style="color: #666;">${product.description}</small>` : ''}
        </td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">
          ${parseInt(product.stock || 0).toLocaleString()}
        </td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">
          ₱${parseFloat(product.unit_price).toFixed(2)}
        </td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">
          <input type="number" class="restock-quantity" data-product-id="${product.id}" min="1" step="1" placeholder="0" style="width: 80px;" disabled>
        </td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">
          <span class="line-total" data-product-id="${product.id}">₱0.00</span>
        </td>
      `;
      restockProductsTableBody.appendChild(tr);
    });

    // Add event listeners for checkboxes and quantity inputs
    restockProductsTableBody.addEventListener('change', handleRestockProductChange);
    restockProductsTableBody.addEventListener('input', handleRestockQuantityChange);
  }

  function handleRestockProductChange(e) {
    if (e.target.classList.contains('restock-product-select')) {
      const productId = e.target.dataset.productId;
      const quantityInput = document.querySelector(`.restock-quantity[data-product-id="${productId}"]`);

      if (e.target.checked) {
        quantityInput.disabled = false;
        quantityInput.value = 1;
        quantityInput.focus();
      } else {
        quantityInput.disabled = true;
        quantityInput.value = '';
      }

      calculateRestockTotals();
    }
  }

  function handleRestockQuantityChange(e) {
    if (e.target.classList.contains('restock-quantity')) {
      calculateRestockTotals();
    }
  }

  function calculateRestockTotals() {
    let subtotal = 0;

    document.querySelectorAll('.restock-product-select:checked').forEach(checkbox => {
      const productId = checkbox.dataset.productId;
      const unitPrice = parseFloat(checkbox.dataset.unitPrice);
      const quantityInput = document.querySelector(`.restock-quantity[data-product-id="${productId}"]`);
      const lineTotalSpan = document.querySelector(`.line-total[data-product-id="${productId}"]`);

      const quantity = parseInt(quantityInput.value) || 0;
      const lineTotal = quantity * unitPrice;

      lineTotalSpan.textContent = `₱${lineTotal.toFixed(2)}`;
      subtotal += lineTotal;
    });

    const taxRate = 0.12; // 12% tax
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    document.getElementById('restockSubtotal').textContent = `₱${subtotal.toFixed(2)}`;
    document.getElementById('restockTax').textContent = `₱${taxAmount.toFixed(2)}`;
    document.getElementById('restockTotal').textContent = `₱${total.toFixed(2)}`;
  }

  function openRestockOrderModal() {
    // Generate PO number
    document.getElementById('restockPoNumber').value = generatePoNumber();

    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('restockOrderDate').value = today;

    // Clear notes
    document.getElementById('restockNotes').value = '';

    // Render products
    renderRestockProducts();

    // Reset totals
    calculateRestockTotals();

    // Show modal
    restockOrderModal.style.display = 'block';
  }

  // --- RESTOCK ORDER FORM SUBMIT ---
  if (restockOrderForm) {
    restockOrderForm.addEventListener('submit', e => {
      e.preventDefault();

      // Collect selected products
      const selectedProducts = [];
      document.querySelectorAll('.restock-product-select:checked').forEach(checkbox => {
        const productId = checkbox.dataset.productId;
        const quantityInput = document.querySelector(`.restock-quantity[data-product-id="${productId}"]`);
        const quantity = parseInt(quantityInput.value) || 0;

        if (quantity > 0) {
          selectedProducts.push({
            product_id: parseInt(productId),
            product_name: checkbox.dataset.productName,
            description: checkbox.dataset.description,
            quantity: quantity,
            unit_price: parseFloat(checkbox.dataset.unitPrice)
          });
        }
      });

      if (selectedProducts.length === 0) {
        alert('Please select at least one product with a quantity greater than 0.');
        return;
      }

      const submitBtn = document.getElementById('submitRestockOrder');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Order...';

      // Get supplier ID
      const userSupplierId = window.rbac ? window.rbac.userSupplierId : 0;

      const orderData = {
        action: 'create_order',
        supplier_id: userSupplierId,
        po_number: document.getElementById('restockPoNumber').value,
        order_date: document.getElementById('restockOrderDate').value,
        status: 'Confirmed',
        notes: document.getElementById('restockNotes').value,
        tax_rate: 0.12,
        items: selectedProducts
      };

      console.log('Sending order data:', orderData);

      fetch('backend/suppliers.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      })
        .then(r => r.json())
        .then(response => {
          if (response.success) {
            // Show success message with order details
            const successMsg = `Restock order created successfully!\n\nPO Number: ${orderData.po_number}\nTotal Amount: ₱${document.getElementById('restockTotal').textContent.replace('₱', '')}\n\nYou can view the receipt in the Purchase Orders tab.`;
            alert(successMsg);
            restockOrderModal.style.display = 'none';
            fetchOrders(); // Refresh orders list

            // Switch to orders tab to show the new order
            document.querySelector('.tab-btn[data-tab="orders"]').click();
          } else {
            alert('Error creating restock order: ' + (response.error || 'Unknown error'));
          }
        })
        .catch(error => {
          console.error('Error creating restock order:', error);
          alert('Network error occurred while creating restock order. Please check your connection and try again.');
        })
        .finally(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Restock Order';
        });
    });
  }

  // Make openRestockOrderModal available globally
  window.openRestockOrderModal = openRestockOrderModal;

  // --- ORDER DETAILS MODAL ---
  const orderDetailsModal = document.getElementById('orderDetailsModal');
  const closeOrderDetailsModal = document.getElementById('closeOrderDetailsModal');

  if (closeOrderDetailsModal) closeOrderDetailsModal.addEventListener('click', () => orderDetailsModal.style.display = 'none');
  if (orderDetailsModal) orderDetailsModal.addEventListener('click', e => { if (e.target === orderDetailsModal) orderDetailsModal.style.display = 'none'; });

  // Global function for viewing order details
  window.viewOrderDetails = function (orderId) {
    const orderDetailsContent = document.getElementById('orderDetailsContent');
    if (!orderDetailsContent) return;

    orderDetailsContent.innerHTML = '<div style="text-align: center; padding: 20px;">Loading order details...</div>';
    orderDetailsModal.style.display = 'block';

    fetch(`backend/suppliers.php?action=order_details&id=${orderId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.order) {
          const order = data.order;
          const formatCurrency = (amount) => '₱' + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

          orderDetailsContent.innerHTML = `
            <div class="receipt-container" style="max-width: 600px; margin: 0 auto; font-family: 'Inter', sans-serif;">
              <!-- Receipt Header -->
              <div class="receipt-header" style="text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #007bff;">PURCHASE ORDER RECEIPT</h2>
                <p style="margin: 5px 0; color: #666;">Twirly Tails Order Management System</p>
              </div>
              
              <!-- Order Information -->
              <div class="order-info" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div>
                  <h4 style="margin: 0 0 10px 0; color: #333;">Order Information</h4>
                  <div><strong>PO Number:</strong> ${order.po_number}</div>
                  <div><strong>Order Date:</strong> ${formatDate(order.order_date)}</div>
                  <div><strong>Status:</strong> <span class="status-badge status-${order.status.toLowerCase().replace(' ', '-')}" style="padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">${order.status}</span></div>
                  ${order.expected_delivery ? `<div><strong>Expected Delivery:</strong> ${formatDate(order.expected_delivery)}</div>` : ''}
                </div>
                <div>
                  <h4 style="margin: 0 0 10px 0; color: #333;">Supplier Information</h4>
                  <div><strong>${order.supplier_name || 'N/A'}</strong></div>
                  ${order.supplier_contact ? `<div>${order.supplier_contact}</div>` : ''}
                  ${order.supplier_email ? `<div>${order.supplier_email}</div>` : ''}
                  ${order.supplier_phone ? `<div>${order.supplier_phone}</div>` : ''}
                </div>
              </div>
              
              <!-- Order Items -->
              <div class="order-items" style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 15px 0; color: #333;">Order Items</h4>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #dee2e6;">
                  <thead>
                    <tr style="background: #f8f9fa;">
                      <th style="padding: 12px; text-align: left; border: 1px solid #dee2e6;">Product</th>
                      <th style="padding: 12px; text-align: center; border: 1px solid #dee2e6;">Qty</th>
                      <th style="padding: 12px; text-align: right; border: 1px solid #dee2e6;">Unit Price</th>
                      <th style="padding: 12px; text-align: right; border: 1px solid #dee2e6;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${order.items.map(item => `
                      <tr>
                        <td style="padding: 12px; border: 1px solid #dee2e6;">
                          <strong>${item.product_name}</strong>
                          ${item.description ? `<br><small style="color: #666;">${item.description}</small>` : ''}
                        </td>
                        <td style="padding: 12px; text-align: center; border: 1px solid #dee2e6;">${parseInt(item.quantity).toLocaleString()}</td>
                        <td style="padding: 12px; text-align: right; border: 1px solid #dee2e6;">${formatCurrency(item.unit_price)}</td>
                        <td style="padding: 12px; text-align: right; border: 1px solid #dee2e6; font-weight: bold;">${formatCurrency(item.total_price)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              
              <!-- Order Summary -->
              <div class="order-summary" style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 15px 0; color: #333;">Order Summary</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span>Subtotal:</span>
                  <span>${formatCurrency(order.subtotal)}</span>
                </div>
                ${order.tax_amount > 0 ? `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Tax (${(order.tax_rate * 100).toFixed(0)}%):</span>
                    <span>${formatCurrency(order.tax_amount)}</span>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em; border-top: 1px solid #dee2e6; padding-top: 8px; color: #007bff;">
                  <span>Total Amount:</span>
                  <span>${formatCurrency(order.total_amount)}</span>
                </div>
              </div>
              
              <!-- Notes -->
              ${order.notes ? `
                <div class="order-notes" style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
                  <h4 style="margin: 0 0 10px 0; color: #856404;">Notes</h4>
                  <p style="margin: 0; color: #856404;">${order.notes}</p>
                </div>
              ` : ''}
              
              <!-- Footer -->
              <div class="receipt-footer" style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 12px;">
                <p>Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p>Twirly Tails Order Management System</p>
              </div>
            </div>
          `;
        } else {
          orderDetailsContent.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #dc3545;">
              <h3>Error Loading Order Details</h3>
              <p>${data.error || 'Unable to load order details. Please try again.'}</p>
            </div>
          `;
        }
      })
      .catch(error => {
        console.error('Error fetching order details:', error);
        orderDetailsContent.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #dc3545;">
            <h3>Error Loading Order Details</h3>
            <p>Network error occurred. Please check your connection and try again.</p>
          </div>
        `;
      });
  };

  // Implement edit and delete functions
  window.editSupplier = function (id) {
    const supplier = suppliers.find(s => s.id == id);
    if (!supplier) {
      showNotification('Supplier not found', 'error');
      return;
    }



    // Fill the form with supplier data
    if (supplierModalTitle) supplierModalTitle.textContent = 'Edit Supplier';
    supplierForm.supplierId.value = supplier.id;
    supplierForm.supplierName.value = supplier.name || '';
    supplierForm.supplierContactPerson.value = supplier.contact_person || '';
    supplierForm.supplierEmail.value = supplier.email || '';
    supplierForm.supplierPhone.value = supplier.phone || '';
    supplierForm.supplierAddress.value = supplier.address || '';
    supplierForm.supplierCity.value = supplier.city || '';
    supplierForm.supplierState.value = supplier.state || '';
    supplierForm.supplierPostalCode.value = supplier.postal_code || '';
    supplierForm.supplierCountry.value = supplier.country || '';
    supplierForm.supplierWebsite.value = supplier.website || '';
    supplierForm.supplierTaxId.value = supplier.tax_id || '';
    supplierForm.supplierPaymentTerms.value = supplier.payment_terms || '';
    supplierForm.supplierStatus.value = supplier.status || '';
    supplierForm.supplierNotes.value = supplier.notes || '';

    // Fetch and populate products for this supplier
    fetch('backend/suppliers.php?action=products&supplier_id=' + supplier.id)
      .then(r => r.json())
      .then(data => {
        resetSupplierModalProducts(data.products || []);
        supplierModal.style.display = 'block';
      })
      .catch(error => {
        console.error('Error fetching supplier products:', error);
        resetSupplierModalProducts([]);
        supplierModal.style.display = 'block';
      });
  };

  window.deleteSupplier = function (id) {
    if (confirm('Are you sure you want to delete this supplier? This action cannot be undone.')) {
      fetch('backend/suppliers.php', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'id=' + id
      })
        .then(r => r.json())
        .then(response => {
          if (response.success) {
            alert('Supplier deleted successfully');
            fetchSuppliers();
          } else {
            alert('Error deleting supplier: ' + (response.error || 'Unknown error'));
          }
        })
        .catch(error => {
          console.error('Error deleting supplier:', error);
          alert('Error deleting supplier: ' + error.message);
        });
    }
  };

  // Load suppliers when page loads
  fetchSuppliers();

  // --- PENDING REQUESTS FOR SUPPLIER ---
  if (window.rbac && window.rbac.userRole === 3) {
    // Add button to navigation or section header
    document.addEventListener('DOMContentLoaded', function () {
      const sectionHeader = document.querySelector('.section-header');
      if (sectionHeader && !document.getElementById('viewPendingRequestsBtn')) {
        const btn = document.createElement('button');
        btn.id = 'viewPendingRequestsBtn';
        btn.className = 'btn';
        btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Pending Requests';
        btn.style.marginLeft = '10px';
        btn.onclick = showPendingRequestsModal;
        sectionHeader.appendChild(btn);
      }
    });

    async function showPendingRequestsModal() {
      // Remove existing modal if present
      const existing = document.getElementById('pendingRequestsModal');
      if (existing) existing.remove();
      // Fetch pending requests
      let requests = [];
      try {
        const res = await fetch('backend/enhanced_stock_requests.php?action=list');
        const data = await res.json();
        if (data.success) {
          requests = data.requests.filter(r => r.status === 'pending');
        }
      } catch (e) {
        alert('Failed to load pending requests.');
        return;
      }
      // Build modal HTML
      const modal = document.createElement('div');
      modal.id = 'pendingRequestsModal';
      modal.className = 'modal';
      modal.style.display = 'block';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
          <span class="close" id="closePendingRequestsModal" style="float:right;font-size:28px;cursor:pointer;">&times;</span>
          <h2>Pending Stock Requests</h2>
          <div style="max-height:400px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="padding:8px;">Request ID</th>
                  <th style="padding:8px;">Product</th>
                  <th style="padding:8px;">Qty</th>
                  <th style="padding:8px;">Requested By</th>
                  <th style="padding:8px;">Date</th>
                  <th style="padding:8px;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${requests.length === 0 ? `<tr><td colspan='6' style='text-align:center;color:#888;'>No pending requests.</td></tr>` :
          requests.map(r => `
                    <tr>
                      <td style='padding:8px;'>#SR-${r.id}</td>
                      <td style='padding:8px;'>${r.product_name}</td>
                      <td style='padding:8px;'>${r.quantity_requested}</td>
                      <td style='padding:8px;'>${r.requested_by_full_name || r.requested_by_name}</td>
                      <td style='padding:8px;'>${new Date(r.requested_at).toLocaleDateString()}</td>
                      <td style='padding:8px;'><button class='btn btn-secondary' onclick='viewEnhancedRequest(${r.id})'>View</button></td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('closePendingRequestsModal').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    window.viewEnhancedRequest = function (requestId) {
      if (window.enhancedStockRequestManager) {
        window.enhancedStockRequestManager.showEnhancedModal(requestId);
      }
    };
  }
});