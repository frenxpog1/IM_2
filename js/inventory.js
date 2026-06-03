// Clean Inventory Management JS

// Global function references for modal usage
let globalFetchInventory = null;
let globalRenderInventory = null;

document.addEventListener('DOMContentLoaded', async function () {
  const inventoryTableBody = document.querySelector('#inventoryTable tbody');
  console.log('inventoryTableBody:', inventoryTableBody);
  // Only run on inventory.html
  if (!document.body.classList.contains('inventory-page')) return;

  // Initialize RBAC first
  if (window.rbac) {
    await window.rbac.initializePermissions();
    console.log('RBAC initialized. User role:', window.rbac.userRole);
    console.log('User data:', window.rbac.userData);
  } else {
    console.error('RBAC not available');
  }

  const searchInput = document.getElementById('inventorySearch');

  // --- ADD PRODUCT TO INVENTORY BUTTON ---
  const addProductToInventoryBtn = document.getElementById('addProductToInventoryBtn');
  if (addProductToInventoryBtn) {
    // Show add product button only for admin/staff users
    const userRole = window.rbac ? window.rbac.userRole : 0;
    if (userRole === 1 || userRole === 2) {
      addProductToInventoryBtn.style.display = '';
      addProductToInventoryBtn.addEventListener('click', () => {
        openAddProductToInventoryModal();
      });
    } else {
      addProductToInventoryBtn.style.display = 'none';
    }
  }

  function fetchInventory() {
    if (window.IS_MOCK_MODE) {
      console.log('Fetching mock inventory');
      renderInventory(window.MOCK_DATA.inventory);
      return;
    }
    fetch('backend/inventory.php?action=list')
      .then(r => r.json())
      .then(data => {
        if (!data.success || !Array.isArray(data.inventory)) {
          console.error('Failed to fetch inventory:', data);
          return;
        }
        renderInventory(data.inventory);
      })
      .catch(error => {
        console.error('Error fetching inventory:', error);
      });
  }

  function getStockStatus(qty) {
    if (qty === 0) {
      return { text: 'Out of Stock', class: 'out-of-stock' };
    } else if (qty <= 10) {
      return { text: 'Low Stock', class: 'low-stock' };
    } else {
      return { text: 'In Stock', class: 'in-stock' };
    }
  }

  function updateInventoryStats(products) {
    const totalProducts = products.length;
    const lowStockProducts = products.filter(p => {
      const qty = parseInt(p.current_stock) || 0;
      return qty > 0 && qty <= 10;
    }).length;
    const outOfStockProducts = products.filter(p => {
      const qty = parseInt(p.current_stock) || 0;
      return qty === 0;
    }).length;

    const totalProductsEl = document.getElementById('totalProducts');
    const lowStockProductsEl = document.getElementById('lowStockProducts');
    const outOfStockProductsEl = document.getElementById('outOfStockProducts');

    if (totalProductsEl) totalProductsEl.textContent = totalProducts;
    if (lowStockProductsEl) lowStockProductsEl.textContent = lowStockProducts;
    if (outOfStockProductsEl) outOfStockProductsEl.textContent = outOfStockProducts;
  }

  function renderInventory(products) {
    if (!inventoryTableBody) return;

    const fragment = document.createDocumentFragment();
    inventoryTableBody.innerHTML = '';

    products.forEach(product => {
      const qty = parseInt(product.current_stock) || 0;
      let statusText = 'Unknown';
      let statusClass = '';

      if (typeof qty === 'number') {
        const status = getStockStatus(qty);
        statusText = status.text;
        statusClass = status.class;
      }
      console.log(`Status for ${product.product_name}:`, statusText);
      let iconHtml = '';
      if (statusClass === 'in-stock') {
        iconHtml = '<span class="material-icons" style="color:#218838;">check_circle</span>';
      } else if (statusClass === 'low-stock') {
        iconHtml = '<span class="material-icons" style="color:#b8860b;">warning</span>';
      } else if (statusClass === 'out-of-stock') {
        iconHtml = '<span class="material-icons" style="color:#c82333;">cancel</span>';
      }
      // Check permissions based on new RBAC structure
      const canRequestStock = window.rbac && window.rbac.checkActionPermission('inventory', 'request_stock');
      const canApproveRequests = window.rbac && window.rbac.checkActionPermission('inventory', 'approve_requests');
      const isSupplier = window.rbac && window.rbac.userRole === 3;
      const tr = document.createElement('tr');
      
      if (isSupplier) {
        // For suppliers: Show only product name, current stock, and pending requests count
        const pendingRequests = product.pending_requests || 0;
        tr.innerHTML = `
          <td>${product.product_name ? product.product_name : 'Unnamed Product'}</td>
          <td><span class="quantity-text">${qty}</span></td>
          <td class="stock-status ${statusClass}">${iconHtml}${statusText}</td>
          <td>
            <span class="pending-requests-info" style="color: #007bff; font-weight: 600;">
              ${pendingRequests > 0 ? `${pendingRequests} pending request(s)` : 'No pending requests'}
            </span>
          </td>
        `;
      } else {
        // For admin/staff: Show normal view with request button
        tr.innerHTML = `
          <td>${product.product_name ? product.product_name : 'Unnamed Product'}</td>
          <td><span class="quantity-text">${qty}</span></td>
          <td class="stock-status ${statusClass}">${iconHtml}${statusText}</td>
          <td>
            ${canRequestStock ? `<button class="btn btn-sm btn-primary" onclick="showUpdateRequestModal(${product.id}, ${qty})">Request Restock</button>` : ''}
          </td>
        `;
      }

      fragment.appendChild(tr);
    });

    inventoryTableBody.appendChild(fragment);
    updateInventoryStats(products);
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => fetchInventory());
  }

  // Set global reference for modal usage
  globalFetchInventory = fetchInventory;
  
  fetchInventory();

  // Initialize modal functionality and request count
  initializeModalEventListeners();
  initializeUpdateRequestModal();
  initializeRequestCount();
});

// Modal Open/Close Functionality
function openRequestsModal() {
  const modal = document.getElementById('pendingRequestsModal');
  const loadingState = document.getElementById('pendingRequestsLoading');
  const content = document.getElementById('pendingRequestsContent');
  
  if (!modal) return;
  
  // Show modal and loading state
  modal.style.display = 'block';
  loadingState.style.display = 'block';
  content.style.display = 'none';
  
  // Focus management for accessibility
  modal.focus();
  
  // Load modal data
  loadModalRequests();
}

function closeRequestsModal() {
  const modal = document.getElementById('pendingRequestsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function loadModalRequests() {
  const loadingState = document.getElementById('pendingRequestsLoading');
  const content = document.getElementById('pendingRequestsContent');
  const table = document.getElementById('pendingRequestsTable');
  const noRequestsMsg = document.getElementById('noPendingRequests');
  
  try {
    const response = await fetch('backend/inventory.php?action=stock_requests');
    const data = await response.json();
    
    // Hide loading state
    loadingState.style.display = 'none';
    content.style.display = 'block';
    
    if (data.success && Array.isArray(data.requests) && data.requests.length > 0) {
      // Show table and hide no requests message
      table.style.display = 'table';
      noRequestsMsg.style.display = 'none';
      
      // Render requests in modal
      renderModalRequests(data.requests);
    } else {
      // Show no requests message and hide table
      table.style.display = 'none';
      noRequestsMsg.style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading modal requests:', error);
    loadingState.style.display = 'none';
    content.style.display = 'block';
    table.style.display = 'none';
    noRequestsMsg.style.display = 'block';
    noRequestsMsg.innerHTML = '<span class="material-icons">error</span><p>Error loading requests. Please try again.</p>';
  }
}

// Initialize modal event listeners
function initializeModalEventListeners() {
  const pendingRequestsBtn = document.getElementById('pendingRequestsBtn');
  const closeModalBtn = document.getElementById('closePendingRequestsModal');
  const closeModalFooterBtn = document.getElementById('closePendingRequestsModalBtn');
  const modal = document.getElementById('pendingRequestsModal');
  
  // Open modal button
  if (pendingRequestsBtn) {
    pendingRequestsBtn.addEventListener('click', openRequestsModal);
  }
  
  // Close modal buttons
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeRequestsModal);
  }
  
  if (closeModalFooterBtn) {
    closeModalFooterBtn.addEventListener('click', closeRequestsModal);
  }
  
  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeRequestsModal();
      }
    });
  }
  
  // Close modal with ESC key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && modal && modal.style.display === 'block') {
      closeRequestsModal();
    }
  });
}

// Role-based Modal Content Rendering
function renderModalRequests(requests) {
  const table = document.getElementById('pendingRequestsTable');
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  
  // Clear existing content
  thead.innerHTML = '';
  tbody.innerHTML = '';
  
  const isSupplier = window.rbac && window.rbac.userRole === 3;
  const currentUserId = window.rbac && window.rbac.userData ? window.rbac.userData.user_id : 
                       (window.rbac && window.rbac.userId ? window.rbac.userId : 0);
  
  // Set table headers based on user role
  if (isSupplier) {
    thead.innerHTML = `
      <th>Product Name</th>
      <th>Requested Quantity</th>
      <th>Requested By</th>
      <th>Request Date</th>
      <th>Reason</th>
      <th>Actions</th>
    `;
  } else {
    thead.innerHTML = `
      <th>Product Name</th>
      <th>Requested Quantity</th>
      <th>Supplier Name</th>
      <th>Request Date</th>
      <th>Status</th>
      <th>Actions</th>
    `;
  }
  
  // Render request rows
  requests.forEach(req => {
    const tr = document.createElement('tr');
    const requestDate = new Date(req.requested_at).toLocaleDateString();
    
    let actionsHtml = '';
    
    if (isSupplier) {
      // Supplier view: Approve/Decline pending, show status for processed
      if (req.status === 'pending') {
        actionsHtml = `
          <button class="btn btn-sm btn-success approve-request-btn" data-request-id="${req.id}">Approve</button>
          <button class="btn btn-sm btn-danger decline-request-btn" data-request-id="${req.id}" style="margin-left: 5px;">Decline</button>
        `;
      } else {
        actionsHtml = `<span class="status-text">${req.status.charAt(0).toUpperCase() + req.status.slice(1)}</span>`;
      }
      
      tr.innerHTML = `
        <td>${req.product_name}</td>
        <td>${req.requested_quantity || req.quantity_requested || 'N/A'}</td>
        <td>${req.requested_by_name}</td>
        <td>${requestDate}</td>
        <td>${req.reason || 'No reason provided'}</td>
        <td>${actionsHtml}</td>
      `;
    } else {
      // Staff/Admin view: Cancel their own pending requests, view status for others
      if (req.status === 'pending' && req.requested_by == currentUserId) {
        actionsHtml = `<button class="btn btn-sm btn-warning cancel-request-btn" data-request-id="${req.id}">Cancel</button>`;
      } else {
        actionsHtml = `<span class="status-text">${req.status.charAt(0).toUpperCase() + req.status.slice(1)}</span>`;
      }
      
      tr.innerHTML = `
        <td>${req.product_name}</td>
        <td>${req.requested_quantity || req.quantity_requested || 'N/A'}</td>
        <td>${req.supplier_name}</td>
        <td>${requestDate}</td>
        <td>${req.status.charAt(0).toUpperCase() + req.status.slice(1)}</td>
        <td>${actionsHtml}</td>
      `;
    }
    
    tbody.appendChild(tr);
  });
  
  // Add event listeners for action buttons
  addModalActionListeners();
}

function addModalActionListeners() {
  // Remove existing event listeners by cloning and replacing elements
  const approveButtons = document.querySelectorAll('.approve-request-btn');
  const declineButtons = document.querySelectorAll('.decline-request-btn');
  const cancelButtons = document.querySelectorAll('.cancel-request-btn');
  
  // Approve buttons (suppliers only)
  approveButtons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const requestId = e.target.getAttribute('data-request-id');
      await handleRequestAction('approve', requestId);
    });
  });
  
  // Decline buttons (suppliers only)
  declineButtons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const requestId = e.target.getAttribute('data-request-id');
      const reason = prompt('Please provide a reason for declining this request (optional):');
      await handleRequestAction('decline', requestId, reason);
    });
  });
  
  // Cancel buttons (staff/admin only)
  cancelButtons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const requestId = e.target.getAttribute('data-request-id');
      if (confirm('Are you sure you want to cancel this request?')) {
        await handleRequestAction('cancel', requestId);
      }
    });
  });
}

async function handleRequestAction(action, requestId, reason = null) {
  try {
    let apiAction, payload;
    
    if (action === 'approve') {
      apiAction = 'respond_request';
      payload = {
        action: apiAction,
        request_id: parseInt(requestId),
        status: 'approved',
        response: 'Request approved by supplier'
      };
    } else if (action === 'decline') {
      apiAction = 'respond_request';
      payload = {
        action: apiAction,
        request_id: parseInt(requestId),
        status: 'declined',
        response: reason || 'Request declined by supplier'
      };
    } else if (action === 'cancel') {
      apiAction = 'cancel_request';
      payload = {
        action: apiAction,
        request_id: parseInt(requestId)
      };
    }
    
    const response = await fetch('backend/inventory.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (data.success) {
      const actionText = action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'cancelled';
      showNotification(`Request ${actionText} successfully!`, 'success');
      
      // Refresh modal content and main page
      loadModalRequests();
      refreshRequestCount();
      if (globalFetchInventory) globalFetchInventory();
    } else {
      showNotification(`Failed to ${action}: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    showNotification(`Network error: ${error}`, 'error');
    console.error(`Error ${action}ing request:`, error);
  }
}

// Request Count Management Functions
async function fetchRequestCount() {
  try {
    const response = await fetch('backend/inventory.php?action=request_count');
    const data = await response.json();
    if (data.success) {
      return data.count;
    } else {
      console.error('Failed to fetch request count:', data.error);
      return 0;
    }
  } catch (error) {
    console.error('Error fetching request count:', error);
    return 0;
  }
}

function updateRequestCount(count) {
  const btn = document.getElementById('pendingRequestsBtn');
  const badge = document.getElementById('pendingRequestsBadge');
  const btnText = document.getElementById('pendingRequestsBtnText');
  
  if (!btn || !badge || !btnText) return;
  
  // Update button text based on user role
  const isSupplier = window.rbac && window.rbac.userRole === 3;
  const baseText = isSupplier ? 'Manage Requests' : 'View My Requests';
  
  if (count > 0) {
    btnText.textContent = `${baseText} (${count})`;
    badge.textContent = count;
    badge.style.display = 'flex';
    btn.style.display = 'flex';
  } else {
    btnText.textContent = baseText;
    badge.style.display = 'none';
    // Still show button but without badge
    btn.style.display = 'flex';
  }
}

async function refreshRequestCount() {
  const count = await fetchRequestCount();
  updateRequestCount(count);
  return count;
}

// Initialize request count on page load
async function initializeRequestCount() {
  console.log('Initializing request count...');
  
  // Only show button for users who can see requests
  const canRequestStock = window.rbac && window.rbac.checkActionPermission('inventory', 'request_stock');
  const canApproveRequests = window.rbac && window.rbac.checkActionPermission('inventory', 'approve_requests');
  
  console.log('Permission check results:');
  console.log('- canRequestStock:', canRequestStock);
  console.log('- canApproveRequests:', canApproveRequests);
  console.log('- userRole:', window.rbac ? window.rbac.userRole : 'undefined');
  
  if (canRequestStock || canApproveRequests) {
    console.log('User has permissions, refreshing request count...');
    await refreshRequestCount();
  } else {
    console.log('User does not have permissions to see requests');
    // Hide the button if no permissions
    const btn = document.getElementById('pendingRequestsBtn');
    if (btn) {
      btn.style.display = 'none';
    }
  }
}

// Initialize update request modal event listeners
function initializeUpdateRequestModal() {
  const updateRequestModal = document.getElementById('updateRequestModal');
  const closeUpdateRequestModal = document.getElementById('closeUpdateRequestModal');
  
  if (closeUpdateRequestModal) {
    closeUpdateRequestModal.addEventListener('click', () => {
      if (updateRequestModal) {
        updateRequestModal.style.display = 'none';
      }
    });
  }
  
  // Close modal when clicking outside
  if (updateRequestModal) {
    updateRequestModal.addEventListener('click', function(event) {
      if (event.target === updateRequestModal) {
        updateRequestModal.style.display = 'none';
      }
    });
  }
}

// Modal function for update requests
function showUpdateRequestModal(supplierProductId, currentQty) {
  const updateRequestModal = document.getElementById('updateRequestModal');
  const updateRequestSupplierProductId = document.getElementById('updateRequestSupplierProductId');
  const updateRequestQuantity = document.getElementById('updateRequestQuantity');
  
  if (!updateRequestModal || !updateRequestSupplierProductId || !updateRequestQuantity) {
    console.error('Update request modal elements not found');
    return;
  }
  
  updateRequestSupplierProductId.value = supplierProductId;
  updateRequestQuantity.value = currentQty;
  updateRequestModal.style.display = 'block';
  
  // Handle form submission
  const updateRequestForm = document.getElementById('updateRequestForm');
  if (updateRequestForm) {
    updateRequestForm.onsubmit = async function(e) {
      e.preventDefault();
      const supplierProductId = parseInt(updateRequestSupplierProductId.value);
      const requestedQty = parseInt(updateRequestQuantity.value);
      
      console.log('Restock Request Data:', { supplierProductId, requestedQty });
      if (!supplierProductId || isNaN(requestedQty) || requestedQty <= 0) {
        showNotification('Error: Please enter a valid product ID and quantity.', 'error');
        return;
      }
      
      try {
        const response = await fetch('backend/inventory.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'request_stock',
            product_id: supplierProductId,
            quantity: requestedQty,
            reason: 'Stock replenishment request'
          })
        });
        
        const data = await response.json();
        if (data.success) {
          showNotification('Restock request successfully sent!', 'success');
          updateRequestModal.style.display = 'none';
          if (globalFetchInventory) globalFetchInventory();
        } else {
          showNotification('Failed to add stock: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        console.error('Error submitting restock request:', error);
        showNotification('Error submitting request: ' + error.message, 'error');
      }
    };
  }
}

// --- ADD PRODUCT TO INVENTORY MODAL FUNCTIONS ---
function openAddProductToInventoryModal() {
  // Create the modal for adding products to inventory
  const modal = document.createElement('div');
  modal.id = 'addProductToInventoryModal';
  modal.className = 'modal';
  modal.style.display = 'block';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px;">
      <span class="close" onclick="closeAddProductToInventoryModal()">&times;</span>
      <h2>Add Product to Inventory</h2>
      
      <div class="form-row">
        <label>Select Supplier:
          <select id="supplierSelect" required>
            <option value="">Choose a supplier...</option>
          </select>
        </label>
      </div>
      
      <div id="supplierProductsSection" style="display: none; margin-top: 20px;">
        <h3>Available Products</h3>
        <div style="overflow-x: auto;">
          <table id="availableProductsTable" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 10px; border: 1px solid #dee2e6;">Product Name</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Description</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Unit Price</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Status</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Initial Quantity</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Action</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="form-actions" style="margin-top: 20px;">
        <button type="button" class="btn btn-secondary" onclick="closeAddProductToInventoryModal()">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Load suppliers
  loadSuppliersForInventory();
  
  // Close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeAddProductToInventoryModal();
    }
  });
}

function closeAddProductToInventoryModal() {
  const modal = document.getElementById('addProductToInventoryModal');
  if (modal) {
    modal.remove();
  }
}

function loadSuppliersForInventory() {
  fetch('backend/suppliers.php?action=list')
    .then(r => r.json())
    .then(data => {
      const supplierSelect = document.getElementById('supplierSelect');
      if (!supplierSelect) return;
      
      // Clear existing options except the first one
      supplierSelect.innerHTML = '<option value="">Choose a supplier...</option>';
      
      if (data.suppliers && data.suppliers.length > 0) {
        data.suppliers.forEach(supplier => {
          const option = document.createElement('option');
          option.value = supplier.id;
          option.textContent = supplier.name;
          supplierSelect.appendChild(option);
        });
        
        // Add change event listener
        supplierSelect.addEventListener('change', function() {
          if (this.value) {
            loadSupplierProducts(this.value);
          } else {
            document.getElementById('supplierProductsSection').style.display = 'none';
          }
        });
      }
    })
    .catch(error => {
      console.error('Error loading suppliers:', error);
      showNotification('Error loading suppliers', 'error');
    });
}

function loadSupplierProducts(supplierId) {
  const productsSection = document.getElementById('supplierProductsSection');
  const tableBody = document.querySelector('#availableProductsTable tbody');
  
  if (!productsSection || !tableBody) return;
  
  // Show loading state
  productsSection.style.display = 'block';
  tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading products...</td></tr>';
  
  // Fetch supplier's products
  fetch(`backend/suppliers.php?action=products&supplier_id=${supplierId}`)
    .then(r => r.json())
    .then(data => {
      tableBody.innerHTML = '';
      
      if (data.products && data.products.length > 0) {
        data.products.forEach(product => {
          const tr = document.createElement('tr');
          const currentStock = parseInt(product.stock) || 0;
          const isInInventory = currentStock > 0;
          
          // Status indicator
          let statusHtml = '';
          if (isInInventory) {
            statusHtml = `<span style="color: #28a745; font-weight: bold;">✓ In Inventory (${currentStock})</span>`;
          } else {
            statusHtml = `<span style="color: #dc3545; font-weight: bold;">✗ Not in Inventory</span>`;
          }
          
          tr.innerHTML = `
            <td style="padding: 10px; border: 1px solid #dee2e6;">
              <strong>${product.product_name}</strong>
            </td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">
              ${product.description || 'No description'}
            </td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">
              ₱${parseFloat(product.unit_price).toFixed(2)}
            </td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">
              ${statusHtml}
            </td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">
              <input type="number" 
                     id="quantity_${product.id}" 
                     min="1" 
                     value="${isInInventory ? '' : '10'}" 
                     placeholder="Enter quantity"
                     style="width: 100px;"
                     ${isInInventory ? 'disabled' : ''}>
            </td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">
              ${isInInventory ? 
                '<span style="color: #6c757d;">Already in inventory</span>' : 
                `<button class="btn btn-sm btn-primary" onclick="addProductToInventory(${product.id}, '${product.product_name}')">Add to Inventory</button>`
              }
            </td>
          `;
          tableBody.appendChild(tr);
        });
      } else {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No products found for this supplier</td></tr>';
      }
    })
    .catch(error => {
      console.error('Error loading supplier products:', error);
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #dc3545;">Error loading products</td></tr>';
    });
}

function addProductToInventory(productId, productName) {
  const quantityInput = document.getElementById(`quantity_${productId}`);
  if (!quantityInput) return;
  
  const quantity = parseInt(quantityInput.value);
  if (!quantity || quantity <= 0) {
    showNotification('Please enter a valid quantity', 'error');
    return;
  }
  
  // Add product to inventory
  fetch('backend/inventory.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add_to_inventory',
      product_id: productId,
      quantity: quantity
    })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        showNotification(`${productName} added to inventory successfully!`, 'success');
        
        // Refresh the supplier products list to update status
        const supplierSelect = document.getElementById('supplierSelect');
        if (supplierSelect && supplierSelect.value) {
          loadSupplierProducts(supplierSelect.value);
        }
        
        // Refresh main inventory list
        if (globalFetchInventory) {
          globalFetchInventory();
        }
      } else {
        showNotification('Error: ' + (data.error || 'Unknown error'), 'error');
      }
    })
    .catch(error => {
      console.error('Error adding product to inventory:', error);
      showNotification('Error adding product to inventory', 'error');
    });
}

// Make functions globally available
window.openAddProductToInventoryModal = openAddProductToInventoryModal;
window.closeAddProductToInventoryModal = closeAddProductToInventoryModal;
window.addProductToInventory = addProductToInventory;

// Add a simple notification function
function showNotification(message, type = 'info') {
  console.log('showNotification called:', message, type);
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  const notif = document.createElement('div');
  notif.className = 'notification notification-' + type;
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    max-width: 300px;
    word-wrap: break-word;
  `;
  
  if (type === 'success') {
    notif.style.backgroundColor = '#28a745';
  } else if (type === 'error') {
    notif.style.backgroundColor = '#dc3545';
  } else {
    notif.style.backgroundColor = '#17a2b8';
  }
  
  document.body.appendChild(notif);
  setTimeout(() => {
    if (notif.parentNode) {
      notif.parentNode.removeChild(notif);
    }
  }, 5000);
}