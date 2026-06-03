<?php
/**
 * Authentication Middleware
 * Handles session validation and permission checking for all protected endpoints
 */

require_once __DIR__ . '/rbac.php';

class AuthMiddleware {
    private $rbac;
    private $conn;
    
    public function __construct($database_connection) {
        $this->conn = $database_connection;
        $this->rbac = new RBACManager($database_connection);
    }
    
    /**
     * Check if user is authenticated
     * @return array User session data or null
     */
    public function checkAuthentication() {
        // Only start session if not already started
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        if (!isset($_SESSION['user_id']) || !isset($_SESSION['role'])) {
            return null;
        }
        
        return [
            'user_id' => $_SESSION['user_id'],
            'username' => $_SESSION['username'] ?? '',
            'role' => $_SESSION['role']
        ];
    }
    
    /**
     * Require authentication and return user data
     * @return array User data
     */
    public function requireAuth() {
        $user = $this->checkAuthentication();
        
        if (!$user) {
            $this->sendUnauthorizedResponse();
        }
        
        return $user;
    }
    
    /**
     * Check if user has permission for specific module and action
     * @param string $module Module name
     * @param string $action Action name
     * @param array $context Additional context for permission checking
     * @return bool True if authorized
     */
    public function checkPermission($module, $action, $context = []) {
        $user = $this->requireAuth();
        
        $hasPermission = $this->rbac->checkAndLogPermission(
            $user['user_id'],
            $user['role'],
            $module,
            $action,
            $context
        );
        
        if (!$hasPermission) {
            $this->sendForbiddenResponse($user['role'], $module, $action);
        }
        
        return true;
    }
    
    /**
     * Require specific permission or send error response
     * @param string $module Module name
     * @param string $action Action name
     * @param array $context Additional context
     */
    public function requirePermission($module, $action, $context = []) {
        $this->checkPermission($module, $action, $context);
    }
    
    /**
     * Get filtered data based on user role and context
     * @param int $role User role
     * @param string $module Module name
     * @param array $data Data to filter
     * @param array $context Context for filtering
     * @return array Filtered data
     */
    public function filterDataByRole($role, $module, $data, $context = []) {
        // Admin sees everything
        if ($role === 1) {
            return $data;
        }
        
        // Supplier sees only their own data
        if ($role === 3) {
            $user_supplier_id = $this->rbac->getUserSupplierId($context['user_id'] ?? 0);
            
            if ($module === 'suppliers' && $user_supplier_id) {
                // Filter to show only their supplier record
                return array_filter($data, function($item) use ($user_supplier_id) {
                    return isset($item['id']) && $item['id'] == $user_supplier_id;
                });
            }
            
            if ($module === 'inventory' && $user_supplier_id) {
                // Filter to show only their products
                return array_filter($data, function($item) use ($user_supplier_id) {
                    return isset($item['supplier_id']) && $item['supplier_id'] == $user_supplier_id;
                });
            }
            
            if ($module === 'orders' && $user_supplier_id) {
                // Filter orders to show only those containing their products
                // This would require more complex logic in the actual endpoint
                return $data;
            }
        }
        
        // Staff sees everything (same as admin for most modules)
        return $data;
    }
    
    /**
     * Send 401 Unauthorized response
     */
    private function sendUnauthorizedResponse() {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Unauthorized',
            'message' => 'Authentication required. Please log in.'
        ]);
        exit;
    }
    
    /**
     * Send 403 Forbidden response
     * @param int $user_role User's role
     * @param string $module Module attempted
     * @param string $action Action attempted
     */
    private function sendForbiddenResponse($user_role, $module, $action) {
        $role_names = [1 => 'Admin', 2 => 'Staff', 3 => 'Supplier'];
        $user_role_name = $role_names[$user_role] ?? 'Unknown';
        
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Access denied',
            'message' => "You don't have permission to perform this action",
            'details' => [
                'required_action' => $action,
                'module' => $module,
                'user_role' => $user_role_name
            ]
        ]);
        exit;
    }
    
    /**
     * Get RBAC manager instance
     * @return RBACManager
     */
    public function getRBAC() {
        return $this->rbac;
    }
}

/**
 * Helper function to create auth middleware instance
 * @param mysqli $conn Database connection
 * @return AuthMiddleware
 */
function getAuthMiddleware($conn) {
    return new AuthMiddleware($conn);
}