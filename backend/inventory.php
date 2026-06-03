<?php
/**
 * Inventory Management API
 * Handles inventory operations with role-based access control
 */

session_start();
include 'db.php';
header('Content-Type: application/json');
require_once 'auth_middleware.php';

$auth = getAuthMiddleware($conn);
$user = $auth->requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'list';
    
    if ($action === 'list') {
        // List inventory based on user role
        if ($user['role'] === 3) {
            // Supplier: Only see their own products
            $auth->requirePermission('inventory', 'read_all');
            
            // Get the supplier's ID
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            
            if (!$user_supplier_id) {
                respond(['success' => false, 'error' => 'Supplier account not properly configured'], 400);
            }
            
            $sql = "
                SELECT sp.*, s.name as supplier_name, 
                       COALESCE(SUM(i.quantity), 0) as current_stock,
                       COALESCE(request_counts.pending_requests, 0) as pending_requests
                FROM supplier_products sp
                JOIN suppliers s ON sp.supplier_id = s.id
                LEFT JOIN inventory i ON sp.id = i.supplier_product_id
                LEFT JOIN (
                    SELECT product_id, COUNT(*) as pending_requests
                    FROM stock_requests 
                    WHERE status = 'pending'
                    GROUP BY product_id
                ) request_counts ON sp.id = request_counts.product_id
                WHERE sp.supplier_id = $user_supplier_id
                GROUP BY sp.id, s.name, sp.product_name, sp.description, sp.unit_price, 
                         sp.min_order_quantity, sp.lead_time_days, sp.is_active, sp.supplier_id,
                         request_counts.pending_requests
                ORDER BY s.name, sp.product_name
            ";
        } else {
            // Admin/Staff: See all products with request capabilities
            $auth->requirePermission('inventory', 'read');
            
            $sql = "
                SELECT sp.*, s.name as supplier_name, 
                       COALESCE(SUM(i.quantity), 0) as current_stock,
                       COALESCE(my_requests.my_pending_requests, 0) as my_pending_requests
                FROM supplier_products sp
                JOIN suppliers s ON sp.supplier_id = s.id
                LEFT JOIN inventory i ON sp.id = i.supplier_product_id
                LEFT JOIN (
                    SELECT product_id, COUNT(*) as my_pending_requests
                    FROM stock_requests 
                    WHERE status = 'pending' AND requested_by = ?
                    GROUP BY product_id
                ) my_requests ON sp.id = my_requests.product_id
                GROUP BY sp.id, s.name, sp.product_name, sp.description, sp.unit_price, 
                         sp.min_order_quantity, sp.lead_time_days, sp.is_active, sp.supplier_id,
                         my_requests.my_pending_requests
                ORDER BY s.name, sp.product_name
            ";
        }
        
        $stmt = $conn->prepare($sql);
        if ($user['role'] !== 3) {
            $stmt->bind_param("i", $user['user_id']);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        
        $inventory = [];
        while ($row = $result->fetch_assoc()) {
            $inventory[] = $row;
        }
        $stmt->close();
        
        respond(['success' => true, 'inventory' => $inventory]);
        
    } elseif ($action === 'stock_requests') {
        // Get stock requests based on user role
        if ($user['role'] === 3) {
            // Supplier: Only see stock requests for their own products
            $auth->requirePermission('inventory', 'approve_requests');
            
            // Get the supplier's ID
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            
            if (!$user_supplier_id) {
                respond(['success' => false, 'error' => 'Supplier account not properly configured'], 400);
            }
            
            $sql = "
                SELECT sr.*, sp.product_name, u.username as requested_by_name,
                       COALESCE(inv_totals.total_stock, 0) as current_stock,
                       sr.quantity_requested as requested_quantity
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN users u ON sr.requested_by = u.id
                LEFT JOIN (
                    SELECT supplier_product_id, SUM(quantity) as total_stock
                    FROM inventory
                    GROUP BY supplier_product_id
                ) inv_totals ON sp.id = inv_totals.supplier_product_id
                WHERE sr.status = 'pending' AND sp.supplier_id = $user_supplier_id
                ORDER BY sr.requested_at DESC
            ";
            $result = $conn->query($sql);
            $requests = [];
            while ($row = $result->fetch_assoc()) {
                $requests[] = $row;
            }
            // Debug output
            error_log("[DEBUG] supplier_id: ALL (TEMP), pending requests found: " . count($requests));
            if (isset($_GET['debug']) && $_GET['debug'] == '1') {
                echo "<pre>supplier_id: ALL (TEMP)\npending requests found: " . count($requests) . "\n" . print_r($requests, true) . "</pre>";
            }
            respond(['success' => true, 'requests' => $requests]);
        
        } else {
            // Admin/Staff: Get their own requests
            $auth->requirePermission('inventory', 'request_stock');
            
            $sql = "
                SELECT sr.*, sp.product_name, s.name as supplier_name,
                       COALESCE(inv_totals.total_stock, 0) as current_stock,
                       sr.quantity_requested as requested_quantity
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN suppliers s ON sr.supplier_id = s.id
                LEFT JOIN (
                    SELECT supplier_product_id, SUM(quantity) as total_stock
                    FROM inventory
                    GROUP BY supplier_product_id
                ) inv_totals ON sp.id = inv_totals.supplier_product_id
                WHERE sr.requested_by = ?
                ORDER BY sr.requested_at DESC
            ";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("i", $user['user_id']);
        }
        
        $stmt->execute();
        $result = $stmt->get_result();
        $requests = [];
        while ($row = $result->fetch_assoc()) {
            $requests[] = $row;
        }
        $stmt->close();
        
        respond(['success' => true, 'requests' => $requests]);
        
    } elseif ($action === 'request_count') {
        // Get pending request count based on user role
        if ($user['role'] === 3) {
            // Restrict to only their own products
            $auth->requirePermission('inventory', 'approve_requests');
            
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            
            if (!$user_supplier_id) {
                respond(['success' => true, 'count' => 0]);
            }
            
            $sql = "
                SELECT COUNT(*) as count
                FROM stock_requests sr
                WHERE sr.status = 'pending' AND sr.supplier_id = ?
            ";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("i", $user_supplier_id);
        } else {
            // Admin/Staff: Count their own pending requests
            $auth->requirePermission('inventory', 'request_stock');
            
            $sql = "
                SELECT COUNT(*) as count
                FROM stock_requests sr
                WHERE sr.requested_by = ? AND sr.status = 'pending'
            ";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("i", $user['user_id']);
        }
        
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $count = intval($row['count']);
        $stmt->close();
        
        respond(['success' => true, 'count' => $count]);
    }
    
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? '';
    
    if ($action === 'request_stock') {
        // Create stock request (Admin/Staff only)
        $auth->requirePermission('inventory', 'request_stock');
        
        $product_id = intval($data['product_id'] ?? 0);
        $quantity = intval($data['quantity'] ?? 0);
        $reason = trim($data['reason'] ?? '');
        
        if (!$product_id || !$quantity) {
            respond(['error' => 'Product ID and quantity are required'], 400);
        }
        
        // Get supplier ID for this product
        $stmt = $conn->prepare("SELECT supplier_id FROM supplier_products WHERE id = ?");
        $stmt->bind_param("i", $product_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $product = $result->fetch_assoc();
        $stmt->close();
        
        if (!$product) {
            respond(['error' => 'Product not found'], 404);
        }
        
        // Allow multiple requests - just create the new request
        // The pending count will be updated automatically in the inventory list
        
        // Create the request
        $stmt = $conn->prepare("
            INSERT INTO stock_requests (product_id, supplier_id, requested_by, quantity_requested, reason)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->bind_param("iiiis", $product_id, $product['supplier_id'], $user['user_id'], $quantity, $reason);
        
        if ($stmt->execute()) {
            $request_id = $conn->insert_id;
            $stmt->close();
            respond(['success' => true, 'request_id' => $request_id, 'message' => 'Restock request successfully sent']);
        } else {
            $stmt->close();
            respond(['error' => 'Failed to create stock request'], 500);
        }
        
    } elseif ($action === 'respond_request') {
        // Respond to stock request (Supplier only)
        $auth->requirePermission('inventory', 'approve_requests');
        
        $request_id = intval($data['request_id'] ?? 0);
        $status = trim($data['status'] ?? '');
        $response = trim($data['response'] ?? '');
        
        if (!$request_id || !in_array($status, ['approved', 'declined'])) {
            respond(['error' => 'Request ID and valid status (approved/declined) are required'], 400);
        }

        // Restrict to only their own requests
        $rbac = $auth->getRBAC();
        $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
        
        if (!$user_supplier_id) {
            respond(['error' => 'Supplier account not properly configured'], 400);
        }

        // Get request details first
        $stmt = $conn->prepare("
            SELECT sr.*, sp.product_name
            FROM stock_requests sr
            JOIN supplier_products sp ON sr.product_id = sp.id
            WHERE sr.id = ? AND sr.status = 'pending' AND sr.supplier_id = ?
        ");
        $stmt->bind_param("ii", $request_id, $user_supplier_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $request = $result->fetch_assoc();
        $stmt->close();
        
        if (!$request) {
            respond(['error' => 'Request not found or access denied'], 404);
        }
        // Enhanced approval process - creates purchase orders when approved
        $conn->begin_transaction();
        try {
            // Get full request details including product info
            $stmt = $conn->prepare("
                SELECT sr.*, sp.product_name, sp.unit_price, sp.description, s.name as supplier_name
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN suppliers s ON sr.supplier_id = s.id
                WHERE sr.id = ? AND sr.status = 'pending' AND sr.supplier_id = ?
            ");
            $stmt->bind_param("ii", $request_id, $user_supplier_id);
            $stmt->execute();
            $result = $stmt->get_result();
            $full_request = $result->fetch_assoc();
            $stmt->close();
            
            if (!$full_request) {
                throw new Exception('Request not found or already processed');
            }
            
            if ($status === 'approved') {
                // Create purchase order automatically
                $po_number = 'PO-' . date('Y') . '-' . str_pad($request_id, 6, '0', STR_PAD_LEFT);
                $order_date = date('Y-m-d');
                $expected_delivery = date('Y-m-d', strtotime('+7 days'));
                $subtotal = $full_request['quantity_requested'] * floatval($full_request['unit_price']);
                $tax_rate = 0.12; // 12% tax
                $tax_amount = $subtotal * $tax_rate;
                $total_amount = $subtotal + $tax_amount;
                // Create purchase order
                $stmt = $conn->prepare("
                    INSERT INTO purchase_orders 
                    (supplier_id, po_number, order_date, expected_delivery, status, notes, tax_rate, created_by, subtotal, tax_amount, total_amount)
                    VALUES (?, ?, ?, ?, 'Confirmed', ?, ?, ?, ?, ?, ?)
                ");
                $po_notes = "Auto-generated from stock request #{$request_id}. " . $response;
                $stmt->bind_param("issssdiddd", $full_request['supplier_id'], $po_number, $order_date, $expected_delivery, $po_notes, $tax_rate, $user['user_id'], $subtotal, $tax_amount, $total_amount);
                $stmt->execute();
                $po_id = $conn->insert_id;
                $stmt->close();
                // Create purchase order item
                $stmt = $conn->prepare("
                    INSERT INTO purchase_order_items 
                    (purchase_order_id, product_name, description, quantity, unit_price, total_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                $item_total = $full_request['quantity_requested'] * floatval($full_request['unit_price']);
                $stmt->bind_param("issidi", $po_id, $full_request['product_name'], $full_request['description'], $full_request['quantity_requested'], $full_request['unit_price'], $item_total);
                $stmt->execute();
                $stmt->close();
                // --- Update inventory quantity ---
                $stmt = $conn->prepare("
                    INSERT INTO inventory (supplier_product_id, quantity)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
                ");
                $stmt->bind_param("ii", $full_request['product_id'], $full_request['quantity_requested']);
                $stmt->execute();
                $stmt->close();
                // Update stock request with purchase order reference
                $stmt = $conn->prepare("
                    UPDATE stock_requests 
                    SET status = ?, supplier_response = ?, responded_at = NOW(), purchase_order_id = ?
                    WHERE id = ?
                ");
                $stmt->bind_param("ssii", $status, $response, $po_id, $request_id);
                $stmt->execute();
                $stmt->close();
                $conn->commit();
                respond([
                    'success' => true, 
                    'message' => 'Request approved and purchase order created successfully',
                    'po_number' => $po_number,
                    'po_id' => $po_id,
                    'total_amount' => $total_amount
                ]);
            } else {
                // Just decline the request
                $stmt = $conn->prepare("
                    UPDATE stock_requests 
                    SET status = ?, supplier_response = ?, responded_at = NOW()
                    WHERE id = ?
                ");
                $stmt->bind_param("ssi", $status, $response, $request_id);
                $stmt->execute();
                $stmt->close();
                $conn->commit();
                respond(['success' => true, 'message' => 'Request declined successfully']);
            }
        } catch (Exception $e) {
            $conn->rollback();
            respond(['error' => $e->getMessage()], 500);
        }
        
    } elseif ($action === 'delete_request') {
        // Delete processed stock request (Supplier only)
        $auth->requirePermission('inventory', 'approve_requests');
        
        $request_id = intval($data['request_id'] ?? 0);
        
        if (!$request_id) {
            respond(['error' => 'Request ID is required'], 400);
        }
        
        // Restrict to only their own requests
        $rbac = $auth->getRBAC();
        $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
        
        if (!$user_supplier_id) {
            respond(['error' => 'Supplier account not properly configured'], 400);
        }

        $stmt = $conn->prepare("
            SELECT id, status FROM stock_requests 
            WHERE id = ? AND status IN ('approved', 'declined') AND supplier_id = ?
        ");
        $stmt->bind_param("ii", $request_id, $user_supplier_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $request = $result->fetch_assoc();
        $stmt->close();
        
        if (!$request) {
            respond(['error' => 'Request not found or cannot be deleted'], 404);
        }
        
        // Delete the request
        $stmt = $conn->prepare("DELETE FROM stock_requests WHERE id = ?");
        $stmt->bind_param("i", $request_id);
        
        if ($stmt->execute()) {
            $stmt->close();
            respond(['success' => true, 'message' => 'Request deleted successfully']);
        } else {
            $stmt->close();
            respond(['error' => 'Failed to delete request'], 500);
        }
        
    } elseif ($action === 'cancel_request') {
        // Cancel stock request (Admin/Staff only - their own requests)
        $auth->requirePermission('inventory', 'request_stock');
        
        $request_id = intval($data['request_id'] ?? 0);
        
        if (!$request_id) {
            respond(['error' => 'Request ID is required'], 400);
        }
        
        // Check if request exists and belongs to the user
        $stmt = $conn->prepare("
            SELECT id, status FROM stock_requests 
            WHERE id = ? AND requested_by = ? AND status = 'pending'
        ");
        $stmt->bind_param("ii", $request_id, $user['user_id']);
        $stmt->execute();
        $result = $stmt->get_result();
        $request = $result->fetch_assoc();
        $stmt->close();
        
        if (!$request) {
            respond(['error' => 'Request not found or cannot be cancelled'], 404);
        }
        
        // Delete the request (cancel = delete for pending requests)
        $stmt = $conn->prepare("DELETE FROM stock_requests WHERE id = ?");
        $stmt->bind_param("i", $request_id);
        
        if ($stmt->execute()) {
            $stmt->close();
            respond(['success' => true, 'message' => 'Request cancelled successfully']);
        } else {
            $stmt->close();
            respond(['error' => 'Failed to cancel request'], 500);
        }
    } elseif ($action === 'add_to_inventory') {
        // Add product to inventory (Admin/Staff only)
        if ($user['role'] !== 1 && $user['role'] !== 2) {
            respond(['error' => 'Only admin and staff users can add products to inventory'], 403);
        }
        
        $auth->requirePermission('inventory', 'create');
        
        $product_id = intval($data['product_id'] ?? 0);
        $quantity = intval($data['quantity'] ?? 0);
        
        if (!$product_id || !$quantity || $quantity <= 0) {
            respond(['error' => 'Valid product ID and quantity are required'], 400);
        }
        
        // Verify the product exists
        $stmt = $conn->prepare("SELECT id, product_name FROM supplier_products WHERE id = ?");
        $stmt->bind_param("i", $product_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $product = $result->fetch_assoc();
        $stmt->close();
        
        if (!$product) {
            respond(['error' => 'Product not found'], 404);
        }
        
        // Check if product is already in inventory
        $stmt = $conn->prepare("SELECT quantity FROM inventory WHERE supplier_product_id = ?");
        $stmt->bind_param("i", $product_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $existing = $result->fetch_assoc();
        $stmt->close();
        
        if ($existing) {
            respond(['error' => 'Product is already in inventory'], 400);
        }
        
        // Add product to inventory
        $stmt = $conn->prepare("INSERT INTO inventory (supplier_product_id, quantity) VALUES (?, ?)");
        $stmt->bind_param("ii", $product_id, $quantity);
        
        if ($stmt->execute()) {
            $stmt->close();
            respond(['success' => true, 'message' => 'Product added to inventory successfully']);
        } else {
            $stmt->close();
            respond(['error' => 'Failed to add product to inventory'], 500);
        }
    }
    
} else {
    respond(['error' => 'Method not allowed'], 405);
}

$conn->close();
?>