<?php
/**
 * Enhanced Stock Requests API with Purchase Order Integration
 * When stock requests are approved, they automatically create purchase orders
 */

session_start();
include 'db.php';
header('Content-Type: application/json');
require_once 'auth_middleware.php';
require_once 'purchase_order_calculations.php';

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
        // List stock requests with purchase order information
        if ($user['role'] === 1 || $user['role'] === 2) {
            // Admin/Staff: See all requests they made with PO details
            $auth->requirePermission('inventory', 'request_stock');
            
            $sql = "
                SELECT sr.*, sp.product_name, s.name as supplier_name, s.contact_person, s.email, s.phone,
                       u.username as requested_by_name, u.full_name as requested_by_full_name,
                       po.po_number, po.order_date, po.status as po_status, po.total_amount as po_total,
                       po.expected_delivery, po.notes as po_notes
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN suppliers s ON sr.supplier_id = s.id
                JOIN users u ON sr.requested_by = u.id
                LEFT JOIN purchase_orders po ON sr.purchase_order_id = po.id
                WHERE sr.requested_by = ?
                ORDER BY sr.requested_at DESC
            ";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("i", $user['user_id']);
            
        } elseif ($user['role'] === 3) {
            // Supplier: See requests for their products with detailed info
            $auth->requirePermission('inventory', 'approve_requests');
            
            $rbac = $auth->getRBAC();
            $supplier_id = $rbac->getUserSupplierId($user['user_id']);
            
            if (!$supplier_id) {
                respond(['error' => 'Supplier account not properly configured'], 400);
            }
            
            $sql = "
                SELECT sr.*, sp.product_name, sp.description, sp.unit_price,
                       s.name as supplier_name, s.contact_person, s.email, s.phone, s.address,
                       u.username as requested_by_name, u.full_name as requested_by_full_name, u.email as requester_email,
                       po.po_number, po.order_date, po.status as po_status, po.total_amount as po_total,
                       po.expected_delivery, po.notes as po_notes,
                       COALESCE(inv_totals.total_stock, 0) as current_stock
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN suppliers s ON sr.supplier_id = s.id
                JOIN users u ON sr.requested_by = u.id
                LEFT JOIN purchase_orders po ON sr.purchase_order_id = po.id
                LEFT JOIN (
                    SELECT supplier_product_id, SUM(quantity) as total_stock
                    FROM inventory
                    GROUP BY supplier_product_id
                ) inv_totals ON sp.id = inv_totals.supplier_product_id
                WHERE sr.supplier_id = ?
                ORDER BY sr.requested_at DESC
            ";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("i", $supplier_id);
        }
        
        $stmt->execute();
        $result = $stmt->get_result();
        $requests = [];
        while ($row = $result->fetch_assoc()) {
            $requests[] = $row;
        }
        $stmt->close();
        
        respond(['success' => true, 'requests' => $requests]);
        
    } elseif ($action === 'receipt') {
        // Get detailed receipt information for a specific request/purchase order
        $request_id = intval($_GET['request_id'] ?? 0);
        
        if (!$request_id) {
            respond(['error' => 'Request ID is required'], 400);
        }
        
        // Get detailed request information
        $sql = "
            SELECT sr.*, sp.product_name, sp.description, sp.unit_price,
                   s.name as supplier_name, s.contact_person, s.email, s.phone, s.address,
                   s.city, s.state, s.postal_code, s.country, s.tax_id,
                   u.username as requested_by_name, u.full_name as requested_by_full_name, u.email as requester_email,
                   po.po_number, po.order_date, po.status as po_status, po.total_amount as po_total,
                   po.expected_delivery, po.notes as po_notes, po.subtotal, po.tax_amount, po.tax_rate,
                   po.created_at as po_created_at, creator.full_name as po_created_by_name
            FROM stock_requests sr
            JOIN supplier_products sp ON sr.product_id = sp.id
            JOIN suppliers s ON sr.supplier_id = s.id
            JOIN users u ON sr.requested_by = u.id
            LEFT JOIN purchase_orders po ON sr.purchase_order_id = po.id
            LEFT JOIN users creator ON po.created_by = creator.id
            WHERE sr.id = ?
        ";
        
        // Check permissions based on user role
        if ($user['role'] === 3) {
            // Supplier can only see their own requests
            $rbac = $auth->getRBAC();
            $supplier_id = $rbac->getUserSupplierId($user['user_id']);
            $sql .= " AND sr.supplier_id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ii", $request_id, $supplier_id);
        } else {
            // Admin/Staff can see their own requests
            $sql .= " AND sr.requested_by = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ii", $request_id, $user['user_id']);
        }
        
        $stmt->execute();
        $result = $stmt->get_result();
        $receipt = $result->fetch_assoc();
        $stmt->close();
        
        if (!$receipt) {
            respond(['error' => 'Request not found or access denied'], 404);
        }
        
        respond(['success' => true, 'receipt' => $receipt]);
    }
    
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? 'create';
    
    if ($action === 'create') {
        // Create new stock request (Admin/Staff only)
        $auth->requirePermission('inventory', 'request_stock');
        
        $product_id = intval($data['product_id'] ?? 0);
        $quantity = intval($data['quantity'] ?? 0);
        $reason = trim($data['reason'] ?? '');
        $priority = trim($data['priority'] ?? 'normal'); // normal, urgent, critical
        $expected_date = $data['expected_date'] ?? null;
        
        if (!$product_id || !$quantity) {
            respond(['error' => 'Product ID and quantity are required'], 400);
        }
        
        // Get supplier ID and product details for this product
        $stmt = $conn->prepare("
            SELECT sp.supplier_id, sp.product_name, sp.unit_price, s.name as supplier_name
            FROM supplier_products sp
            JOIN suppliers s ON sp.supplier_id = s.id
            WHERE sp.id = ?
        ");
        $stmt->bind_param("i", $product_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $product = $result->fetch_assoc();
        $stmt->close();
        
        if (!$product) {
            respond(['error' => 'Product not found'], 404);
        }
        
        // Create the enhanced stock request
        $stmt = $conn->prepare("
            INSERT INTO stock_requests (product_id, supplier_id, requested_by, quantity_requested, reason, priority, expected_date, estimated_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $estimated_cost = $quantity * floatval($product['unit_price']);
        $stmt->bind_param("iiiisssd", $product_id, $product['supplier_id'], $user['user_id'], $quantity, $reason, $priority, $expected_date, $estimated_cost);
        
        if ($stmt->execute()) {
            $request_id = $conn->insert_id;
            $stmt->close();
            
            respond([
                'success' => true, 
                'request_id' => $request_id, 
                'message' => 'Stock request created successfully',
                'estimated_cost' => $estimated_cost,
                'supplier_name' => $product['supplier_name']
            ]);
        } else {
            $stmt->close();
            respond(['error' => 'Failed to create stock request'], 500);
        }
        
    } elseif ($action === 'respond') {
        // Respond to stock request (Supplier only) - This now creates a purchase order
        $auth->requirePermission('inventory', 'approve_requests');
        
        $request_id = intval($data['request_id'] ?? 0);
        $status = trim($data['status'] ?? '');
        $response = trim($data['response'] ?? '');
        $delivery_date = $data['delivery_date'] ?? null;
        $supplier_notes = trim($data['supplier_notes'] ?? '');
        
        if (!$request_id || !in_array($status, ['approved', 'declined'])) {
            respond(['error' => 'Request ID and valid status are required'], 400);
        }
        
        // Verify this request belongs to the supplier
        $rbac = $auth->getRBAC();
        $supplier_id = $rbac->getUserSupplierId($user['user_id']);
        
        if (!$supplier_id) {
            respond(['error' => 'Supplier account not properly configured'], 400);
        }
        
        $conn->begin_transaction();
        
        try {
            // Get request details
            $stmt = $conn->prepare("
                SELECT sr.*, sp.product_name, sp.unit_price, sp.description, s.name as supplier_name
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN suppliers s ON sr.supplier_id = s.id
                WHERE sr.id = ? AND sr.supplier_id = ? AND sr.status = 'pending'
            ");
            $stmt->bind_param("ii", $request_id, $supplier_id);
            $stmt->execute();
            $result = $stmt->get_result();
            $request = $result->fetch_assoc();
            $stmt->close();
            
            if (!$request) {
                throw new Exception('Request not found or already processed');
            }
            
            if ($status === 'approved') {
                // Create purchase order automatically
                $po_number = 'PO-' . date('Y') . '-' . str_pad($request_id, 6, '0', STR_PAD_LEFT);
                $order_date = date('Y-m-d');
                $expected_delivery = $delivery_date ?: date('Y-m-d', strtotime('+7 days'));
                $subtotal = $request['quantity_requested'] * floatval($request['unit_price']);
                $tax_rate = 0.12; // 12% tax
                $tax_amount = $subtotal * $tax_rate;
                $total_amount = $subtotal + $tax_amount;
                
                // Create purchase order
                $stmt = $conn->prepare("
                    INSERT INTO purchase_orders 
                    (supplier_id, po_number, order_date, expected_delivery, status, notes, tax_rate, created_by, subtotal, tax_amount, total_amount)
                    VALUES (?, ?, ?, ?, 'Confirmed', ?, ?, ?, ?, ?, ?)
                ");
                $po_notes = "Auto-generated from stock request #{$request_id}. " . $supplier_notes;
                $stmt->bind_param("issssdiddd", $supplier_id, $po_number, $order_date, $expected_delivery, $po_notes, $tax_rate, $user['user_id'], $subtotal, $tax_amount, $total_amount);
                $stmt->execute();
                $po_id = $conn->insert_id;
                $stmt->close();
                
                // Create purchase order item
                $stmt = $conn->prepare("
                    INSERT INTO purchase_order_items 
                    (purchase_order_id, product_name, description, quantity, unit_price, total_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                $item_total = $request['quantity_requested'] * floatval($request['unit_price']);
                $stmt->bind_param("issidi", $po_id, $request['product_name'], $request['description'], $request['quantity_requested'], $request['unit_price'], $item_total);
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
    }
    
} else {
    respond(['error' => 'Method not allowed'], 405);
}

$conn->close();
?>