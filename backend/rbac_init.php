<?php
/**
 * RBAC Initialization Endpoint
 * Provides user role and permission data for frontend RBAC
 */

session_start();
include 'db.php';
header('Content-Type: application/json');
require_once 'auth_middleware.php';

$auth = getAuthMiddleware($conn);
$user = $auth->requireAuth();

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

try {
    $role = $user['role'];
    $user_id = $user['user_id'];
    
    // Get supplier_id for supplier users
    $supplier_id = null;
    if ($role === 3) {
        $rbac = $auth->getRBAC();
        $supplier_id = $rbac->getUserSupplierId($user_id);
    }
    
    // Return user info for RBAC initialization
    $response = [
        'success' => true,
        'user' => [
            'user_id' => $user_id,
            'username' => $user['username'],
            'role' => $role,
            'supplier_id' => $supplier_id
        ],
        'user_info' => [
            'role' => $role,
            'role_name' => match($role) {
                1 => 'Administrator',
                2 => 'Staff',
                3 => 'Supplier',
                default => 'Unknown'
            },
            'username' => $user['username']
        ]
    ];
    
    respond($response);
    
} catch (Exception $e) {
    respond(['success' => false, 'error' => 'Authentication error', 'details' => $e->getMessage()], 401);
} finally {
    $conn->close();
}
?>