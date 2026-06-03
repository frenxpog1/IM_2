<?php
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(0);
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

include 'db.php';
require_once 'auth_middleware.php';

$auth = getAuthMiddleware($conn);
$user = $auth->requireAuth();

// Check view permission for dashboard
if ($user['role'] === 3) {
    // Suppliers should not access dashboard - redirect them
    respond(['error' => 'Access denied: Suppliers should use inventory page', 'redirect' => 'inventory.html'], 403);
} else {
    // Admin and staff need view permission
    $auth->requirePermission('dashboard', 'view');
}

try {
    // Get dashboard statistics based on user role
    $stats = [];
    $role = $user['role'];
    $user_id = $user['user_id'];
    
    if ($role === 1) {
        // Admin - Full access to all statistics
        $result = $conn->query("SELECT COUNT(*) as count FROM orders");
        $stats['total_orders'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT SUM(total_amount) as total FROM orders WHERE status = 'Completed'");
        $stats['total_sales'] = $result ? ($result->fetch_assoc()['total'] ?? 0) : 0;
        
        // Fixed low stock query - count products with total stock between 1-10 (inclusive)
        $result = $conn->query("
            SELECT COUNT(*) as count FROM (
                SELECT sp.id, COALESCE(SUM(i.quantity), 0) as total_stock
                FROM supplier_products sp
                LEFT JOIN inventory i ON sp.id = i.supplier_product_id
                GROUP BY sp.id
                HAVING total_stock > 0 AND total_stock <= 10
            ) as low_stock_products
        ");
        $stats['low_stock'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT COUNT(DISTINCT customer_name) as count FROM orders");
        $stats['active_customers'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT COUNT(*) as count FROM suppliers WHERE status = 'Active'");
        $stats['active_suppliers'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT COUNT(*) as count FROM purchase_orders");
        $stats['purchase_orders'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        // Admin-specific stats
        $result = $conn->query("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
        $stats['active_users'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT COUNT(*) as count FROM access_log WHERE result = 'denied' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)");
        $stats['access_denials_24h'] = $result ? $result->fetch_assoc()['count'] : 0;
        
    } elseif ($role === 2) {
        // Staff - Limited access to operational statistics
        $result = $conn->query("SELECT COUNT(*) as count FROM orders");
        $stats['total_orders'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT SUM(total_amount) as total FROM orders WHERE status = 'Completed'");
        $stats['total_sales'] = $result ? ($result->fetch_assoc()['total'] ?? 0) : 0;
        
        // Fixed low stock query - count products with total stock between 1-10 (inclusive)
        $result = $conn->query("
            SELECT COUNT(*) as count FROM (
                SELECT sp.id, COALESCE(SUM(i.quantity), 0) as total_stock
                FROM supplier_products sp
                LEFT JOIN inventory i ON sp.id = i.supplier_product_id
                GROUP BY sp.id
                HAVING total_stock > 0 AND total_stock <= 10
            ) as low_stock_products
        ");
        $stats['low_stock'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT COUNT(DISTINCT customer_name) as count FROM orders");
        $stats['active_customers'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("SELECT COUNT(*) as count FROM suppliers WHERE status = 'Active'");
        $stats['active_suppliers'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        // Staff-specific stats
        $result = $conn->query("SELECT COUNT(*) as count FROM orders WHERE status = 'Pending'");
        $stats['pending_orders'] = $result ? $result->fetch_assoc()['count'] : 0;
        
        $result = $conn->query("
            SELECT COUNT(DISTINCT sp.id) as count 
            FROM supplier_products sp
            LEFT JOIN (
                SELECT supplier_product_id, SUM(quantity) as total_stock
                FROM inventory
                GROUP BY supplier_product_id
            ) inv_totals ON sp.id = inv_totals.supplier_product_id
            WHERE COALESCE(inv_totals.total_stock, 0) = 0
        ");
        $stats['out_of_stock'] = $result ? $result->fetch_assoc()['count'] : 0;
        
    } elseif ($role === 3) {
        // Supplier - Very limited access, only their own data
        $rbac = $auth->getRBAC();
        $supplier_id = $rbac->getUserSupplierId($user_id);
        
        if ($supplier_id) {
            // Orders containing their products
            $result = $conn->query("
                SELECT COUNT(DISTINCT o.id) as count 
                FROM orders o 
                JOIN order_items oi ON o.id = oi.order_id 
                JOIN supplier_products sp ON oi.supplier_product_id = sp.id 
                WHERE sp.supplier_id = $supplier_id
            ");
            $stats['orders_with_my_products'] = $result ? $result->fetch_assoc()['count'] : 0;
            
            // Their products in inventory
            $result = $conn->query("
                SELECT COUNT(*) as count 
                FROM inventory i 
                JOIN supplier_products sp ON i.supplier_product_id = sp.id 
                WHERE sp.supplier_id = $supplier_id
            ");
            $stats['my_products_in_inventory'] = $result ? $result->fetch_assoc()['count'] : 0;
            
            // Their low stock products
            $result = $conn->query("
                SELECT COUNT(*) as count 
                FROM inventory i 
                JOIN supplier_products sp ON i.supplier_product_id = sp.id 
                WHERE sp.supplier_id = $supplier_id AND i.quantity < 10
            ");
            $stats['my_low_stock_products'] = $result ? $result->fetch_assoc()['count'] : 0;
            
            // Total value of their products sold
            $result = $conn->query("
                SELECT SUM(oi.total_price) as total 
                FROM order_items oi 
                JOIN supplier_products sp ON oi.supplier_product_id = sp.id 
                JOIN orders o ON oi.order_id = o.id
                WHERE sp.supplier_id = $supplier_id AND o.status = 'Completed'
            ");
            $stats['my_total_sales'] = $result ? ($result->fetch_assoc()['total'] ?? 0) : 0;
            
            // Purchase orders for this supplier
            $result = $conn->query("SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = $supplier_id");
            $stats['my_purchase_orders'] = $result ? $result->fetch_assoc()['count'] : 0;
            
        } else {
            // Supplier not properly linked
            $stats['error'] = 'Supplier account not properly configured';
        }
    }
    
    // Add user info and role-specific metadata
    $response = [
        'success' => true,
        'stats' => $stats,
        'user' => [
            'user_id' => $user_id,
            'username' => $user['username'],
            'role' => $role,
            'supplier_id' => ($role === 3) ? $auth->getRBAC()->getUserSupplierId($user_id) : null
        ],
        'user_info' => [
            'role' => $role,
            'role_name' => match($role) {
                1 => 'Administrator',
                2 => 'Staff',
                3 => 'Supplier',
                default => 'Unknown'
            },
            'username' => $user['username'],
            'dashboard_type' => match($role) {
                1 => 'admin_full',
                2 => 'staff_operational', 
                3 => 'supplier_limited',
                default => 'basic'
            }
        ]
    ];
    
    echo json_encode($response);
    
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Database error', 'details' => $e->getMessage()]);
} finally {
    $conn->close();
}
?>