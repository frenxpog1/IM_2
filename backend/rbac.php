<?php
/**
 * Role-Based Access Control (RBAC) Manager
 * Handles permission checking and access control for the Twirly Tails OMS
 */

class RBACManager {
    private $conn;
    private $permissions;
    
    public function __construct($database_connection) {
        $this->conn = $database_connection;
        $this->loadPermissions();
    }
    
    /**
     * Load permission matrix from configuration
     */
    private function loadPermissions() {
        require __DIR__ . '/config/permissions.php';
        $this->permissions = $PERMISSION_MATRIX ?? [];
    }
    
    /**
     * Check if a role has permission for a specific module and action
     * @param int $role Role ID (1=admin, 2=staff, 3=supplier)
     * @param string $module Module name (dashboard, orders, inventory, etc.)
     * @param string $action Action name (view, create, read, update, delete)
     * @return bool True if permission granted, false otherwise
     */
    public function checkPermission($role, $module, $action) {
        $roleKey = $this->getRoleKey($role);
        
        if (!isset($this->permissions[$roleKey])) {
            return false;
        }
        
        if (!isset($this->permissions[$roleKey][$module])) {
            return false;
        }
        
        return in_array($action, $this->permissions[$roleKey][$module]);
    }
    
    /**
     * Get all permissions for a specific role
     * @param int $role Role ID
     * @return array Array of module permissions
     */
    public function getModulePermissions($role) {
        $roleKey = $this->getRoleKey($role);
        return $this->permissions[$roleKey] ?? [];
    }
    
    /**
     * Context-aware access checking (for supplier-specific data)
     * @param int $role User role
     * @param string $resource Resource being accessed
     * @param array $context Additional context (user_id, supplier_id, etc.)
     * @return bool True if access granted
     */
    public function hasAccess($role, $resource, $context = []) {
        $roleKey = $this->getRoleKey($role);
        
        // Admin has access to everything
        if ($role === 1) {
            return true;
        }
        
        // For suppliers, check if they're accessing their own data
        if ($role === 3) {
            if (isset($context['supplier_id']) && isset($context['user_supplier_id'])) {
                return $context['supplier_id'] === $context['user_supplier_id'];
            }
        }
        
        return true; // Default allow for staff
    }
    
    /**
     * Log access attempts for audit trail
     * @param int $user_id User ID making the request
     * @param string $action Action attempted
     * @param string $resource Resource accessed
     * @param string $result 'granted' or 'denied'
     */
    public function logAccess($user_id, $action, $resource, $result) {
        $ip_address = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
        
        $stmt = $this->conn->prepare("
            INSERT INTO access_log (user_id, action, resource, result, ip_address, user_agent) 
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        
        if ($stmt) {
            $stmt->bind_param("isssss", $user_id, $action, $resource, $result, $ip_address, $user_agent);
            $stmt->execute();
            $stmt->close();
        }
    }
    
    /**
     * Get the complete permission matrix
     * @return array Permission matrix
     */
    public function getPermissionMatrix() {
        return $this->permissions;
    }
    
    /**
     * Convert numeric role to string key
     * @param int $role Role ID
     * @return string Role key
     */
    private function getRoleKey($role) {
        switch ($role) {
            case 1: return 'admin';
            case 2: return 'staff';
            case 3: return 'supplier';
            default: return 'guest';
        }
    }
    
    /**
     * Get user's supplier ID if they are a supplier
     * @param int $user_id User ID
     * @return int|null Supplier ID or null
     */
    public function getUserSupplierId($user_id) {
        $stmt = $this->conn->prepare("SELECT supplier_id FROM users WHERE id = ?");
        if ($stmt) {
            $stmt->bind_param("i", $user_id);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result->fetch_assoc();
            $stmt->close();
            return $row['supplier_id'] ?? null;
        }
        return null;
    }
    
    /**
     * Check if user has permission and log the attempt
     * @param int $user_id User ID
     * @param int $role User role
     * @param string $module Module name
     * @param string $action Action name
     * @param array $context Additional context
     * @return bool True if permission granted
     */
    public function checkAndLogPermission($user_id, $role, $module, $action, $context = []) {
        $hasPermission = $this->checkPermission($role, $module, $action);
        
        if ($hasPermission && $role === 3) {
            // For suppliers, also check context-aware access
            $context['user_supplier_id'] = $this->getUserSupplierId($user_id);
            $hasPermission = $this->hasAccess($role, $module, $context);
        }
        
        $result = $hasPermission ? 'granted' : 'denied';
        $this->logAccess($user_id, $action, $module, $result);
        
        return $hasPermission;
    }
}

/**
 * Helper function to get RBAC instance
 * @param mysqli $conn Database connection
 * @return RBACManager
 */
function getRBACManager($conn) {
    return new RBACManager($conn);
}