// User Management JavaScript
let users = [];
let currentUserId = null;

// Initialize user management
window.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('userTable')) return;
  
  // Always re-initialize RBAC from backend session
  if (window.rbac) {
    await window.rbac.initializePermissions();
  }
  
  // Check if user has access to user management
  if (!checkUserManagementAccess()) {
    showAccessDeniedPage();
    return;
  }
  
  setupEventListeners();
  loadUsers();
  loadSuppliers();
  updateUserStats();
});

function setupEventListeners() {
  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) addUserBtn.addEventListener('click', openUserModal);

  const cancelUserBtn = document.getElementById('cancelUserBtn');
  if (cancelUserBtn) cancelUserBtn.addEventListener('click', closeUserModal);

  const cancelDeleteUser = document.getElementById('cancelDeleteUser');
  if (cancelDeleteUser) cancelDeleteUser.addEventListener('click', closeDeleteModal);

  const closeUserModalBtn = document.getElementById('closeUserModal');
  if (closeUserModalBtn) closeUserModalBtn.addEventListener('click', closeUserModal);

  const refreshUsers = document.getElementById('refreshUsers');
  if (refreshUsers) refreshUsers.addEventListener('click', loadUsers);

  const userForm = document.getElementById('userForm');
  if (userForm) userForm.addEventListener('submit', handleUserSubmitEnhanced); // Use enhanced

  const userSearch = document.getElementById('userSearch');
  if (userSearch) userSearch.addEventListener('input', filterUsers);

  const roleFilter = document.getElementById('roleFilter');
  if (roleFilter) roleFilter.addEventListener('change', filterUsers);

  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', filterUsers);

  const confirmDeleteUser = document.getElementById('confirmDeleteUser');
  if (confirmDeleteUser) confirmDeleteUser.onclick = function () { };

  // Add role change listener for supplier selection
  const userRole = document.getElementById('userRole');
  if (userRole) userRole.addEventListener('change', handleRoleChange);
}

function fetchUsers() {
  if (window.IS_MOCK_MODE) {
    console.log('Fetching mock users');
    const mockUsers = Object.values(window.MOCK_DATA.users);
    renderUsers(mockUsers);
    return;
  }
  fetch('backend/users.php')

    .then(response => {
      if (response.status === 401) {
        // Authentication required - redirect to login
        showError('Authentication required. Redirecting to login...');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (!data) return; // Handle case where we redirected to login
      
      if (data.success) {
        users = data.users;
        displayUsers(users);
      } else {
        showError('Error loading users: ' + (data.error || 'Unknown error'));
        
        // If it's an authentication error, redirect to login
        if (data.error && data.error.includes('Authentication required')) {
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 2000);
        }
      }
    })
    .catch(error => {
      console.error('Error loading users:', error);
      showError('Error loading users: ' + error.message);
    });
}

function displayUsers(usersToShow) {
  const tbody = document.querySelector('#userTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!usersToShow || usersToShow.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No users found</td></tr>';
    return;
  }
  usersToShow.forEach(user => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(user.id)}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(roleLabel(user.role))}</td>
      <td>${escapeHtml(user.email || '')}</td>
      <td>${escapeHtml(user.full_name || '')}</td>
      <td>${escapeHtml(user.status || '')}</td>
      <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : ''}</td>
      <td>
        <button onclick="editUserEnhanced(${user.id})" class="btn btn-secondary btn-sm">Edit</button>
        <button onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')" class="btn btn-danger btn-sm">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function roleLabel(role) {
  switch (parseInt(role)) {
    case 1: return 'Admin';
    case 2: return 'Staff';
    case 3: return 'Supplier';
    default: return 'Unknown';
  }
}

function openUserModal() {
  currentUserId = null;
  const userForm = document.getElementById('userForm');
  if (userForm) userForm.reset();
  const userId = document.getElementById('userId');
  if (userId) userId.value = '';
  
  // Load available suppliers for new user
  loadAvailableSuppliers();
  
  // Initialize role change handling to hide supplier selection initially
  setTimeout(() => {
    handleRoleChange();
  }, 50);
  
  const userModal = document.getElementById('userModal');
  if (userModal) {
    userModal.style.display = 'flex';
    // Add click-to-close functionality
    userModal.addEventListener('click', function(e) {
      if (e.target === userModal) {
        closeUserModal();
      }
    });
  }
}

function closeUserModal() {
  const userModal = document.getElementById('userModal');
  if (userModal) userModal.style.display = 'none';
}

function closeDeleteModal() {
  const deleteUserModal = document.getElementById('deleteUserModal');
  if (deleteUserModal) deleteUserModal.style.display = 'none';
}

// --- Refactored: Use only enhanced user management functions ---

// Remove/comment out the basic handleUserSubmit and editUser functions
// function handleUserSubmit(e) { ... }
// function editUser(id) { ... }

// Update event listeners to use enhanced functions
function editUserEnhanced(id) {
  const user = users.find(u => u.id == id);
  if (!user) return;
  currentUserId = id;
  const userId = document.getElementById('userId');
  if (userId) userId.value = user.id;
  const userName = document.getElementById('userName');
  if (userName) userName.value = user.username;
  const userPassword = document.getElementById('userPassword');
  if (userPassword) userPassword.value = '';
  const userPasswordConfirm = document.getElementById('userPasswordConfirm');
  if (userPasswordConfirm) userPasswordConfirm.value = '';
  const userRole = document.getElementById('userRole');
  if (userRole) {
    // Ensure the role field is enabled for editing
    userRole.disabled = false;
    userRole.value = user.role;
    handleRoleChange(); // Show/hide supplier selection based on role
  }
  
  // Load available suppliers for this user (including their current assignment)
  loadAvailableSuppliers(id);
  
  // Set supplier value after suppliers are loaded
  setTimeout(() => {
    const userSupplier = document.getElementById('userSupplier');
    if (userSupplier && user.supplier_id) {
      userSupplier.value = user.supplier_id;
    }
  }, 100);
  
  const userEmail = document.getElementById('userEmail');
  if (userEmail) userEmail.value = user.email || '';
  const userFullName = document.getElementById('userFullName');
  if (userFullName) userFullName.value = user.full_name || '';
  const userStatus = document.getElementById('userStatus');
  if (userStatus) userStatus.value = user.status || 'active';
  const userNotes = document.getElementById('userNotes');
  if (userNotes) userNotes.value = user.notes || '';
  const userModal = document.getElementById('userModal');
  if (userModal) {
    userModal.style.display = 'flex';
    // Add click-to-close functionality
    userModal.addEventListener('click', function(e) {
      if (e.target === userModal) {
        closeUserModal();
      }
    });
  }
}

function handleUserSubmitEnhanced(e) {
  e.preventDefault();

  const userName = document.getElementById('userName');
  const userPassword = document.getElementById('userPassword');
  const userPasswordConfirm = document.getElementById('userPasswordConfirm');
  const userRole = document.getElementById('userRole');
  const userSupplier = document.getElementById('userSupplier');
  const userEmail = document.getElementById('userEmail');
  const userFullName = document.getElementById('userFullName');
  const userStatus = document.getElementById('userStatus');
  const userNotes = document.getElementById('userNotes');

  if (!userName || !userRole) {
    showError('Required form elements not found');
    return;
  }

  // Validate password confirmation
  if (userPassword && userPasswordConfirm && userPassword.value !== userPasswordConfirm.value) {
    showError('Passwords do not match');
    return;
  }

  // Validate supplier selection for supplier role
  if (userRole.value === '3' && userSupplier && !userSupplier.value) {
    showError('Please select a supplier for supplier role users');
    return;
  }

  // Validate that selected supplier is available
  if (userRole.value === '3' && userSupplier && userSupplier.value) {
    const selectedOption = userSupplier.options[userSupplier.selectedIndex];
    if (selectedOption && selectedOption.disabled) {
      showError('The selected supplier is already assigned to another user. Please choose a different supplier.');
      return;
    }
  }

  const formData = {
    username: userName.value,
    password: userPassword ? userPassword.value : '',
    role: userRole.value,
    email: userEmail ? userEmail.value : '',
    full_name: userFullName ? userFullName.value : '',
    status: userStatus ? userStatus.value : 'active',
    notes: userNotes ? userNotes.value : ''
  };

  // Add supplier_id for supplier role users
  if (userRole.value === '3' && userSupplier && userSupplier.value) {
    formData.supplier_id = userSupplier.value;
  }

  if (currentUserId) {
    formData.id = currentUserId;
  }

  fetch('backend/users.php', {
    method: currentUserId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        closeUserModal();
        loadUsers();
        showSuccess(currentUserId ? 'User updated successfully' : 'User created successfully');
      } else {
        showError('Error: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      console.error('Error saving user:', error);
      showError('Error saving user: ' + error.message);
    });
}

function deleteUser(id, username) {
  const deleteUserNameSpan = document.getElementById('deleteUserName');
  if (deleteUserNameSpan) deleteUserNameSpan.textContent = username;
  const deleteUserModal = document.getElementById('deleteUserModal');
  if (deleteUserModal) {
    deleteUserModal.style.display = 'flex';
    // Add click-to-close functionality
    deleteUserModal.addEventListener('click', function(e) {
      if (e.target === deleteUserModal) {
        closeDeleteModal();
      }
    });
  }
  const confirmDeleteUserBtn = document.getElementById('confirmDeleteUser');
  if (confirmDeleteUserBtn) {
    confirmDeleteUserBtn.onclick = function () {
      fetch('backend/users.php', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success) {
            closeDeleteModal();
            loadUsers();
            showSuccess('User deleted successfully');
          } else {
            showError('Error: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(error => {
          console.error('Error deleting user:', error);
          showError('Error deleting user: ' + error.message);
        });
    };
  }
}

function closeDeleteModal() {
  const deleteUserModal = document.getElementById('deleteUserModal');
  if (deleteUserModal) deleteUserModal.style.display = 'none';
}

function filterUsers() {
  const userSearch = document.getElementById('userSearch');
  const roleFilter = document.getElementById('roleFilter');
  const statusFilter = document.getElementById('statusFilter');
  if (!userSearch || !roleFilter || !statusFilter) return;
  const search = userSearch.value.toLowerCase();
  const role = roleFilter.value;
  const status = statusFilter.value;
  const filtered = users.filter(user => {
    const matchesSearch = !search ||
      user.username.toLowerCase().includes(search) ||
      (user.full_name && user.full_name.toLowerCase().includes(search)) ||
      (user.email && user.email.toLowerCase().includes(search));
    const matchesRole = !role || user.role == role;
    const matchesStatus = !status || user.status == status;
    return matchesSearch && matchesRole && matchesStatus;
  });
  displayUsers(filtered);
}

// Helper functions for notifications
function showError(message) {
  showNotification(message, 'error');
}

function showSuccess(message) {
  showNotification(message, 'success');
}

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
// RBAC Enhancement Functions

let suppliers = [];

/**
 * Load available suppliers for supplier role selection
 * @param {number|null} currentUserId - ID of user being edited (null for new users)
 */
function loadAvailableSuppliers(currentUserId = null) {
  const url = currentUserId 
    ? `backend/users.php?action=available_suppliers&user_id=${currentUserId}`
    : 'backend/users.php?action=available_suppliers';
    
  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success && data.suppliers) {
        suppliers = data.suppliers;
        populateSupplierSelect();
      } else {
        showError('Error loading available suppliers: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      console.error('Error loading available suppliers:', error);
      showError('Failed to load available suppliers. Please try again.');
    });
}

/**
 * Load suppliers for supplier role selection (legacy function - kept for compatibility)
 */
function loadSuppliers() {
  loadAvailableSuppliers();
}

/**
 * Populate supplier select dropdown with enhanced visual indicators
 */
function populateSupplierSelect() {
  const userSupplier = document.getElementById('userSupplier');
  if (!userSupplier) return;

  // Clear existing options except the first one
  userSupplier.innerHTML = '<option value="">Select Supplier</option>';

  // Separate available and unavailable suppliers
  const availableSuppliers = suppliers.filter(s => s.is_available);
  const unavailableSuppliers = suppliers.filter(s => !s.is_available);

  // Add available suppliers first
  availableSuppliers.forEach(supplier => {
    const option = document.createElement('option');
    option.value = supplier.id;
    option.textContent = `✓ ${supplier.name}`;
    option.style.color = '#28a745'; // Green for available
    option.style.fontWeight = 'normal';
    userSupplier.appendChild(option);
  });

  // Add separator if there are unavailable suppliers
  if (unavailableSuppliers.length > 0 && availableSuppliers.length > 0) {
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '─────────────────────';
    separator.style.color = '#ccc';
    userSupplier.appendChild(separator);
  }

  // Add unavailable suppliers with clear indicators
  unavailableSuppliers.forEach(supplier => {
    const option = document.createElement('option');
    option.value = supplier.id;
    option.textContent = `✗ ${supplier.name} (Assigned to: ${supplier.assigned_username})`;
    option.style.color = '#dc3545'; // Red for unavailable
    option.style.fontStyle = 'italic';
    option.disabled = true;
    option.title = `This supplier is already assigned to ${supplier.assigned_username}`;
    userSupplier.appendChild(option);
  });

  // Update supplier info display
  updateSupplierInfo();
}

/**
 * Update supplier availability info display
 */
function updateSupplierInfo() {
  // Remove existing info if present
  const existingInfo = document.getElementById('supplierAvailabilityInfo');
  if (existingInfo) {
    existingInfo.remove();
  }

  const userSupplier = document.getElementById('userSupplier');
  if (!userSupplier) return;

  // Create info display
  const infoDiv = document.createElement('div');
  infoDiv.id = 'supplierAvailabilityInfo';
  infoDiv.style.cssText = `
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.4;
  `;

  const availableCount = suppliers.filter(s => s.is_available).length;
  const totalCount = suppliers.length;
  const unavailableCount = totalCount - availableCount;

  if (unavailableCount > 0) {
    infoDiv.style.backgroundColor = '#fff3cd';
    infoDiv.style.border = '1px solid #ffeaa7';
    infoDiv.style.color = '#856404';
    infoDiv.innerHTML = `
      <strong>Supplier Availability:</strong><br>
      ✓ ${availableCount} available for assignment<br>
      ✗ ${unavailableCount} already assigned to other users
    `;
  } else {
    infoDiv.style.backgroundColor = '#d4edda';
    infoDiv.style.border = '1px solid #c3e6cb';
    infoDiv.style.color = '#155724';
    infoDiv.innerHTML = `
      <strong>✓ All ${totalCount} suppliers are available for assignment</strong>
    `;
  }

  // Insert after the supplier select element
  userSupplier.parentNode.insertBefore(infoDiv, userSupplier.nextSibling);
}

/**
 * Handle role change to show/hide supplier selection
 */
function handleRoleChange() {
  const userRole = document.getElementById('userRole');
  const supplierSelectionLabel = document.getElementById('supplierSelectionLabel');
  const userSupplier = document.getElementById('userSupplier');
  const supplierAvailabilityInfo = document.getElementById('supplierAvailabilityInfo');

  if (!userRole || !supplierSelectionLabel) return;

  if (userRole.value === '3') { // Supplier role
    supplierSelectionLabel.style.display = 'block';
    if (userSupplier) userSupplier.required = true;
    // Show supplier availability info if it exists
    if (supplierAvailabilityInfo) {
      supplierAvailabilityInfo.style.display = 'block';
    }
  } else {
    supplierSelectionLabel.style.display = 'none';
    if (userSupplier) {
      userSupplier.required = false;
      userSupplier.value = '';
    }
    // Hide supplier availability info
    if (supplierAvailabilityInfo) {
      supplierAvailabilityInfo.style.display = 'none';
    }
  }
}

// Removed duplicate function - using the one above

// Duplicate function removed - using the one above
/**

 * Check if current user has access to user management
 */
function checkUserManagementAccess() {
  // First check if RBAC is initialized
  if (!window.rbac || !window.rbac.initialized) {
    console.warn('RBAC not initialized, checking session directly');
    // Fallback: check session directly for admin role
    return checkSessionForAdmin();
  }
  
  // Check if user is admin (role 1)
  if (window.rbac.userRole === 1) {
    return true;
  }
  
  // For other roles, check specific permission
  return window.rbac.checkActionPermission('users', 'read');
}

/**
 * Fallback function to check session for admin access
 */
function checkSessionForAdmin() {
  // Make a synchronous check to the backend
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'backend/debug_session.php', false); // Synchronous
    xhr.send();
    
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      return data.current_user && data.current_user.role === 1;
    }
  } catch (error) {
    console.error('Error checking session:', error);
  }
  
  return false;
}

/**
 * Show access denied page for non-admin users
 */
function showAccessDeniedPage() {
  const main = document.querySelector('main');
  if (main) {
    main.innerHTML = `
      <div style="text-align: center; padding: 50px; color: #721c24; background: #f8d7da; margin: 20px; border-radius: 4px;">
        <h2>Access Denied</h2>
        <p>You don't have permission to access user management.</p>
        <p>Administrator privileges are required.</p>
        <a href="dashboard.html" class="btn btn-primary" style="margin-top: 20px;">Return to Dashboard</a>
      </div>
    `;
  }
  
  // Add admin-access class to body if user is admin
  if (window.rbac && window.rbac.userRole === 1) {
    document.body.classList.add('admin-access');
  }
  
  // Also check session directly as fallback
  if (checkSessionForAdmin()) {
    document.body.classList.add('admin-access');
  }
}

/**
 * Update user statistics
 */
function updateUserStats() {
  if (!users || users.length === 0) return;
  
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active').length;
  const adminUsers = users.filter(u => u.role === 1).length;
  
  const totalUsersEl = document.getElementById('totalUsers');
  const activeUsersEl = document.getElementById('activeUsers');
  const adminUsersEl = document.getElementById('adminUsers');
  
  if (totalUsersEl) totalUsersEl.textContent = totalUsers;
  if (activeUsersEl) activeUsersEl.textContent = activeUsers;
  if (adminUsersEl) adminUsersEl.textContent = adminUsers;
}

/**
 * Enhanced display users with RBAC controls
 */
function displayUsersEnhanced(usersToShow) {
  const tbody = document.querySelector('#userTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (!usersToShow || usersToShow.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No users found</td></tr>';
    return;
  }
  
  usersToShow.forEach(user => {
    const tr = document.createElement('tr');
    
    // Check if current user can edit/delete this user
    const canEdit = window.rbac && window.rbac.checkActionPermission('users', 'update');
    const canDelete = window.rbac && window.rbac.checkActionPermission('users', 'delete');
    
    // Prevent deleting the last admin or current user
    const adminCount = usersToShow.filter(u => u.role === 1).length;
    const isLastAdmin = user.role === 1 && adminCount <= 1;
    const isCurrentUser = window.rbac && window.rbac.userRole && user.id === window.rbac.userId;
    
    const editButton = canEdit ? 
      `<button onclick="editUserEnhanced(${user.id})" class="btn btn-secondary btn-sm" data-action="update" data-module="users">Edit</button>` : 
      `<button class="btn btn-secondary btn-sm rbac-disabled" disabled>Edit</button>`;
      
    const deleteButton = (canDelete && !isLastAdmin && !isCurrentUser) ? 
      `<button onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')" class="btn btn-danger btn-sm" data-action="delete" data-module="users">Delete</button>` : 
      `<button class="btn btn-danger btn-sm rbac-disabled" disabled>Delete</button>`;
    
    tr.innerHTML = `
      <td>${escapeHtml(user.id)}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>
        <span class="role-badge role-${user.role}">
          ${escapeHtml(roleLabel(user.role))}
        </span>
      </td>
      <td>${escapeHtml(user.email || '')}</td>
      <td>${escapeHtml(user.full_name || '')}</td>
      <td>
        <span class="status-badge status-${user.status}">
          ${escapeHtml(user.status || 'active')}
        </span>
      </td>
      <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : ''}</td>
      <td class="action-buttons">
        ${editButton}
        ${deleteButton}
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // Update stats after displaying users
  updateUserStats();
}

// Override the original displayUsers function
displayUsers = displayUsersEnhanced;