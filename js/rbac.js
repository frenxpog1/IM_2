/**
 * Client-Side RBAC Manager
 * Handles permission-based UI controls and navigation filtering
 */

class RBACManager {
    constructor() {
        this.userPermissions = null;
        this.userRole = null;
        this.username = null;
        this.initialized = false;
    }

    /**
     * Initialize permissions by fetching user data
     */
    async initializePermissions() {
        try {
            const response = await fetch('backend/rbac_init.php');
            const data = await response.json();
            
            if (data.success && data.user_info) {
                this.userRole = data.user_info.role;
                this.username = data.user_info.username;
                this.userPermissions = this.getPermissionMatrix()[this.getRoleKey(this.userRole)] || {};
                // Store user data including user_id and supplier_id
                this.userData = data.user || {};
                this.userId = this.userData.user_id || 0;
                this.userSupplierId = this.userData.supplier_id || 0;
                this.initialized = true;
                
                console.log('RBAC initialized for user:', this.username, 'Role:', this.userRole, 'User ID:', this.userId, 'Supplier ID:', this.userSupplierId);
                return true;
            } else {
                console.warn('Failed to initialize RBAC:', data.error);
                return false;
            }
        } catch (error) {
            console.error('Error initializing RBAC:', error);
            return false;
        }
    }

    /**
     * Check if user has permission for specific module and action
     */
    checkActionPermission(module, action) {
        if (!this.initialized || !this.userPermissions) {
            console.warn('RBAC not initialized');
            return false;
        }

        const modulePermissions = this.userPermissions[module];
        if (!modulePermissions) {
            return false;
        }

        return modulePermissions.includes(action);
    }

    /**
     * Get permission matrix (matches backend configuration)
     */
    getPermissionMatrix() {
        return {
            'admin': {
                'dashboard': ['view', 'update'],
                'orders': ['create', 'read', 'update', 'delete'],
                'inventory': ['create', 'read', 'update', 'delete', 'request_stock'],
                'analytics': ['view', 'export'],
                'users': ['create', 'read', 'update', 'delete'],
                'suppliers': ['create', 'read', 'update', 'delete']
            },
            'staff': {
                'dashboard': ['view'],
                'orders': ['create', 'read', 'update'],
                'inventory': ['read', 'request_stock'],
                'analytics': ['view'],
                'suppliers': ['create', 'read', 'update']
            },
            'supplier': {
                'inventory': ['read_all', 'approve_requests', 'decline_requests'],
                'suppliers': ['read_own', 'update_own']
            }
        };
    }

    /**
     * Convert numeric role to string key
     */
    getRoleKey(role) {
        switch (role) {
            case 1: return 'admin';
            case 2: return 'staff';
            case 3: return 'supplier';
            default: return 'guest';
        }
    }

    /**
     * Get user role name
     */
    getRoleName(role = null) {
        const roleToCheck = role || this.userRole;
        switch (roleToCheck) {
            case 1: return 'Administrator';
            case 2: return 'Staff';
            case 3: return 'Supplier';
            default: return 'Unknown';
        }
    }

    /**
     * Show/hide elements based on permissions
     */
    showHideElements() {
        if (!this.initialized) {
            console.warn('RBAC not initialized, cannot control element visibility');
            return;
        }

        // Hide/show navigation items
        this.updateNavigation();

        // Hide/show action buttons
        this.updateActionButtons();

        // Hide/show form fields
        this.updateFormFields();

        // Update user info display
        this.updateUserInfo();
    }

    /**
     * Update navigation menu based on permissions
     */
    updateNavigation() {
        const navItems = {
            'dashboard': { module: 'dashboard', actions: ['view', 'view_limited'] },
            'orders': { module: 'orders', actions: ['read', 'read_own'] },
            'inventory': { module: 'inventory', actions: ['read', 'read_all', 'read_requests'] },
            'analytics': { module: 'analytics', actions: ['view'] },
            'users': { module: 'users', actions: ['read'] },
            'suppliers': { module: 'suppliers', actions: ['read', 'read_own'] }
        };

        Object.keys(navItems).forEach(navId => {
            const navElement = document.getElementById(`nav-${navId}`) || 
                             document.querySelector(`[data-nav="${navId}"]`) ||
                             document.querySelector(`a[href*="${navId}"]`);
            
            if (navElement) {
                const { module, actions } = navItems[navId];
                // Check if user has any of the required actions for this module
                const hasPermission = actions.some(action => this.checkActionPermission(module, action));
                
                if (hasPermission) {
                    navElement.style.display = '';
                    navElement.classList.remove('rbac-hidden');
                    // Show parent li element if it exists
                    const parentLi = navElement.closest('li');
                    if (parentLi) {
                        parentLi.style.display = '';
                        parentLi.classList.remove('rbac-hidden');
                    }
                } else {
                    navElement.style.display = 'none';
                    navElement.classList.add('rbac-hidden');
                    // Hide parent li element if it exists
                    const parentLi = navElement.closest('li');
                    if (parentLi) {
                        parentLi.style.display = 'none';
                        parentLi.classList.add('rbac-hidden');
                    }
                }
            }
        });
    }

    /**
     * Update action buttons based on permissions
     */
    updateActionButtons() {
        // Create buttons
        const createButtons = document.querySelectorAll('[data-action="create"], .btn-create, .create-btn');
        createButtons.forEach(btn => {
            const module = btn.dataset.module || this.getModuleFromPage();
            const hasPermission = this.checkActionPermission(module, 'create');
            this.toggleElement(btn, hasPermission);
        });

        // Edit/Update buttons
        const editButtons = document.querySelectorAll('[data-action="edit"], [data-action="update"], .btn-edit, .edit-btn');
        editButtons.forEach(btn => {
            const module = btn.dataset.module || this.getModuleFromPage();
            const hasPermission = this.checkActionPermission(module, 'update');
            this.toggleElement(btn, hasPermission);
        });

        // Delete buttons
        const deleteButtons = document.querySelectorAll('[data-action="delete"], .btn-delete, .delete-btn');
        deleteButtons.forEach(btn => {
            const module = btn.dataset.module || this.getModuleFromPage();
            const hasPermission = this.checkActionPermission(module, 'delete');
            this.toggleElement(btn, hasPermission);
        });

        // Export buttons
        const exportButtons = document.querySelectorAll('[data-action="export"], .btn-export, .export-btn');
        exportButtons.forEach(btn => {
            const module = btn.dataset.module || 'analytics';
            const hasPermission = this.checkActionPermission(module, 'export');
            this.toggleElement(btn, hasPermission);
        });
    }

    /**
     * Update form fields based on permissions
     */
    updateFormFields() {
        // Disable form fields for read-only access
        const forms = document.querySelectorAll('form[data-module]');
        forms.forEach(form => {
            const module = form.dataset.module;
            const hasUpdatePermission = this.checkActionPermission(module, 'update');

            // Patch: If supplier is editing their own supplier profile, always enable fields
            if (module === 'suppliers' && this.userRole === 3) {
                const inputs = form.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    input.disabled = false;
                    input.classList.remove('rbac-readonly');
                });
            } else if (!hasUpdatePermission) {
                const inputs = form.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    input.disabled = true;
                    input.classList.add('rbac-readonly');
                });
            }
        });

        // Hide sensitive fields for suppliers
        if (this.userRole === 3) {
            const sensitiveFields = document.querySelectorAll('.admin-only, .staff-only');
            sensitiveFields.forEach(field => {
                field.style.display = 'none';
                field.classList.add('rbac-hidden');
            });
        }
    }

    /**
     * Update user info display
     */
    updateUserInfo() {
        const userInfoElements = document.querySelectorAll('.user-info, #user-info');
        userInfoElements.forEach(element => {
            element.innerHTML = `
                <span class="username">${this.username}</span>
                <span class="role">(${this.getRoleName()})</span>
            `;
        });

        // Update page title if exists
        const pageTitle = document.querySelector('.page-title, h1');
        if (pageTitle && this.userRole === 3) {
            pageTitle.textContent += ' - Supplier View';
        }

        // Add admin-access class to body for user management page
        if (this.userRole === 1 && window.location.pathname.includes('user')) {
            document.body.classList.add('admin-access');
        }
    }

    /**
     * Toggle element visibility/state
     */
    toggleElement(element, show) {
        if (show) {
            element.style.display = '';
            element.disabled = false;
            element.classList.remove('rbac-hidden', 'rbac-disabled');
        } else {
            element.style.display = 'none';
            element.disabled = true;
            element.classList.add('rbac-hidden', 'rbac-disabled');
        }
    }

    /**
     * Get current module from page URL or context
     */
    getModuleFromPage() {
        const path = window.location.pathname;
        if (path.includes('order')) return 'orders';
        if (path.includes('inventory')) return 'inventory';
        if (path.includes('supplier')) return 'suppliers';
        if (path.includes('user')) return 'users';
        if (path.includes('analytics') || path.includes('report')) return 'analytics';
        return 'dashboard';
    }

    /**
     * Check if user can access a specific page
     */
    canAccessPage(module) {
        if (!this.initialized) return false;
        
        // Check if user has any permission for the module
        const modulePermissions = this.userPermissions[module];
        return modulePermissions && modulePermissions.length > 0;
    }

    /**
     * Redirect to appropriate page if access denied
     */
    enforcePageAccess() {
        const currentModule = this.getModuleFromPage();
        
        if (!this.canAccessPage(currentModule)) {
            console.warn(`Access denied to ${currentModule} module`);
            
            // Redirect to dashboard or login
            if (this.canAccessPage('dashboard')) {
                window.location.href = 'dashboard.html';
            } else {
                window.location.href = 'login.html';
            }
        }
    }

    /**
     * Add permission-aware event listeners
     */
    addPermissionAwareListeners() {
        // Intercept form submissions
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form.dataset.module) {
                const module = form.dataset.module;
                const action = form.dataset.action || 'update';
                
                if (!this.checkActionPermission(module, action)) {
                    e.preventDefault();
                    this.showAccessDeniedMessage(`You don't have permission to ${action} ${module}`);
                }
            }
        });

        // Intercept button clicks
        document.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (button && button.dataset.module) {
                const module = button.dataset.module;
                const action = button.dataset.action;
                
                if (!this.checkActionPermission(module, action)) {
                    e.preventDefault();
                    this.showAccessDeniedMessage(`You don't have permission to ${action} ${module}`);
                }
            }
        });
    }

    /**
     * Show access denied message
     */
    showAccessDeniedMessage(message) {
        // Create or update notification
        let notification = document.getElementById('rbac-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'rbac-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f8d7da;
                color: #721c24;
                padding: 15px;
                border: 1px solid #f5c6cb;
                border-radius: 4px;
                z-index: 9999;
                max-width: 300px;
            `;
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        notification.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }
}

// Global RBAC instance
window.rbac = new RBACManager();

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const initialized = await window.rbac.initializePermissions();
    
    if (initialized) {
        // Add admin-access class immediately for user management page
        if (window.rbac.userRole === 1 && window.location.pathname.includes('user')) {
            document.body.classList.add('admin-access');
        }
        
        window.rbac.showHideElements();
        window.rbac.addPermissionAwareListeners();
        window.rbac.enforcePageAccess();
        
        console.log('RBAC client-side manager initialized successfully');
    } else {
        console.warn('RBAC initialization failed - user may need to login');
        
        // Redirect to login if not on login page
        if (!window.location.pathname.includes('login')) {
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    }
});

// Utility functions for manual permission checks
window.checkPermission = (module, action) => {
    return window.rbac.checkActionPermission(module, action);
};

window.getUserRole = () => {
    return window.rbac.userRole;
};

window.getUserRoleName = () => {
    return window.rbac.getRoleName();
};