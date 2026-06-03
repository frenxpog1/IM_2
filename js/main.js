// Highlight active nav link
const navLinks = document.querySelectorAll('.nav-links a');
navLinks.forEach(link => {
  if (window.location.pathname.endsWith(link.getAttribute('href'))) {
    link.classList.add('active');
  }
});

// Check if we are running in a mock/demo environment (like Vercel)
const IS_MOCK_MODE = window.location.hostname.includes('vercel.app') || window.location.hostname.includes('github.io') || window.location.port === '5500';

// Mock Data for Demo
const MOCK_USERS = {
  'admin': { id: 1, username: 'admin', role: 1, full_name: 'Demo Admin', email: 'admin@demo.com' },
  'staff': { id: 2, username: 'staff', role: 2, full_name: 'Demo Staff', email: 'staff@demo.com' },
  'supplier': { id: 3, username: 'supplier', role: 3, full_name: 'Demo Supplier', email: 'supplier@demo.com', supplier_id: 1 }
};

// Login form handler using backend
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Logging in...';
    submitBtn.disabled = true;

    try {
      let data;
      
      if (IS_MOCK_MODE) {
        // --- MOCK LOGIN FOR DEMO ---
        console.log('Running in MOCK MODE');
        await new Promise(resolve => setTimeout(resolve, 800)); // Simulate lag
        
        if (MOCK_USERS[username] && password.includes('123')) {
          data = { success: true, user: MOCK_USERS[username] };
        } else {
          data = { success: false, error: 'Invalid demo credentials. Try admin/admin123' };
        }
      } else {
        // --- REAL LOGIN ---
        const res = await fetch('backend/login.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        data = await res.json();
      }
      console.log('Login response data:', data);
      if (data.success) {
        // Store user data
        localStorage.setItem('oms_role', data.user.role);
        localStorage.setItem('oms_user', JSON.stringify(data.user));
        localStorage.setItem('oms_user_id', data.user.id); // Ensure user ID is set
        // --- RBAC Sync ---
        if (window.rbac) {
          window.rbac.userRole = data.user.role;
          window.rbac.userId = data.user.id;
          window.rbac.username = data.user.username;
          window.rbac.initialized = false;
          await window.rbac.initializePermissions();
        }
        // Show success message
        showNotification('Login successful! Redirecting...', 'success');
        // Redirect based on user role after a short delay
        setTimeout(() => {
          // Role-based redirection
          switch(data.user.role) {
            case 1: // Admin
            case 2: // Staff
              window.location.href = 'dashboard.html';
              break;
            case 3: // Supplier
              window.location.href = 'inventory.html';
              break;
            default:
              window.location.href = 'dashboard.html';
          }
        }, 1000);
      } else {
        console.error('Login failed:', data.error);
        showNotification(data.error || 'Login failed. Please check your credentials.', 'error');
      }
    } catch (err) {
      console.error('Login error:', err);
      showNotification('Network error. Please check your connection.', 'error');
    } finally {
      // Reset button state
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// Logout button logic
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', function() {
    localStorage.removeItem('oms_role');
    localStorage.removeItem('oms_user');
    localStorage.removeItem('oms_user_id');
    window.location.href = 'login.html';
  });
}

// --- Notification System ---
let currentNotifications = [];
let notificationHistory = [];
let unreadCount = 0;

function addNotification(type, title, data = {}) {
  const notification = {
    id: Date.now(),
    type: type,
    title: title,
    data: data,
    timestamp: new Date(),
    read: false
  };
  notificationHistory.unshift(notification);
  unreadCount++;
  // Keep only last 50 notifications
  if (notificationHistory.length > 50) {
    notificationHistory = notificationHistory.slice(0, 50);
  }
  updateNotificationDisplay();
}

function updateNotificationDisplay() {
  const notificationCount = document.getElementById('notificationCount');
  const notificationList = document.getElementById('notificationList');
  if (notificationCount) {
    if (unreadCount > 0) {
      notificationCount.textContent = unreadCount > 99 ? '99+' : unreadCount;
      notificationCount.style.display = 'flex';
    } else {
      notificationCount.style.display = 'none';
    }
  }
  if (notificationList) {
    const recentNotifications = notificationHistory.slice(0, 10);
    if (recentNotifications.length === 0) {
      notificationList.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">No notifications</div>';
    } else {
      notificationList.innerHTML = recentNotifications.map(notification => {
        const timeAgo = getTimeAgo(notification.timestamp);
        const icon = getNotificationIcon(notification.type);
        const iconClass = getNotificationIconClass(notification.type);
        return `
          <div class="notification-item ${notification.read ? 'read' : 'unread'}" onclick="handleNotificationClick('${notification.type}', ${notification.id})">
            <div class="notification-icon ${iconClass}">${icon}</div>
            <div class="notification-content">
              <div class="notification-title">${notification.title}</div>
              <div class="notification-time">${timeAgo}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function getNotificationIcon(type) {
  switch (type) {
    case 'order-created': return '📦';
    case 'order-updated': return '✏️';
    case 'order-deleted': return '🗑️';
    case 'inventory-low': return '⚠️';
    case 'inventory-updated': return '📊';
    case 'user-created': return '👤';
    case 'user-updated': return '✏️';
    default: return '🔔';
  }
}

function getNotificationIconClass(type) {
  switch (type) {
    case 'order-created':
    case 'order-updated':
    case 'order-deleted':
      return 'order';
    case 'inventory-low':
    case 'inventory-updated':
      return 'inventory';
    default:
      return 'order';
  }
}

function handleNotificationClick(type, id) {
  const notification = notificationHistory.find(n => n.id === id);
  if (!notification) return;
  // Mark as read
  notification.read = true;
  unreadCount = Math.max(0, unreadCount - 1);
  updateNotificationDisplay();
  // Handle navigation based on type
  switch (type) {
    case 'order-created':
    case 'order-updated':
    case 'order-deleted':
      if (notification.data.orderId) {
        if (window.location.pathname.includes('orders.html')) {
          const orderRow = document.querySelector(`tr[data-id="${notification.data.orderId}"]`);
          if (orderRow) {
            const viewBtn = orderRow.querySelector('.viewOrderBtn');
            if (viewBtn) viewBtn.click();
          }
        } else {
          window.location.href = 'orders.html';
        }
      }
      break;
    case 'inventory-low':
    case 'inventory-updated':
      if (notification.data.itemId) {
        if (window.location.pathname.includes('inventory.html')) {
          const itemRow = document.querySelector(`tr[data-id="${notification.data.itemId}"]`);
          if (itemRow) {
            itemRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            itemRow.style.background = 'rgba(255, 193, 7, 0.3)';
            setTimeout(() => itemRow.style.background = '', 3000);
          }
        } else {
          window.location.href = 'inventory.html';
        }
      }
      break;
  }
  // Close dropdown
  toggleNotificationDropdown();
}

function toggleNotificationDropdown() {
  const dropdown = document.getElementById('notificationDropdown');
  if (dropdown) {
    dropdown.classList.toggle('show');
  }
}

function clearAllNotifications() {
  notificationHistory = [];
  unreadCount = 0;
  updateNotificationDisplay();
  toggleNotificationDropdown();
}

function viewAllNotifications() {
  alert('View all notifications feature coming soon!');
  toggleNotificationDropdown();
}

// Global notification function (replaces alert)
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <span>${message}</span>
    <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  // Add to page
  const container = document.querySelector('.notification-container') || document.body;
  container.appendChild(notification);
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// Global error handler
window.addEventListener('error', function(e) {
  console.error('Global error:', e.error);
  let message = 'An error occurred. Please try again.';
  if (e.error && e.error.message) {
    message += '\n' + e.error.message;
  } else if (e.message) {
    message += '\n' + e.message;
  }
  showNotification(message, 'error');
});

// Global fetch error handler
window.addEventListener('unhandledrejection', function(e) {
  console.error('Unhandled promise rejection:', e.reason);
  let message = 'Network error. Please check your connection.';
  if (e.reason && e.reason.message) {
    message += '\n' + e.reason.message;
  } else if (typeof e.reason === 'string') {
    message += '\n' + e.reason;
  }
  showNotification(message, 'error');
});

// --- Notification Bell Dropdown and Initialization ---
document.addEventListener('DOMContentLoaded', function() {
  // --- Notification Bell Dropdown ---
  const notificationBell = document.getElementById('notificationBell');
  const notificationDropdown = document.getElementById('notificationDropdown');
  if (notificationBell && notificationDropdown) {
    notificationBell.addEventListener('click', function(e) {
      e.stopPropagation();
      notificationDropdown.classList.toggle('show');
    });
    document.addEventListener('click', function(e) {
      if (!notificationBell.contains(e.target) && !notificationDropdown.contains(e.target)) {
        notificationDropdown.classList.remove('show');
      }
    });
  }
});