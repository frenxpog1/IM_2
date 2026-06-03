<?php
session_start(); // Start session before any headers
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
        $auth->requirePermission('suppliers', 'read');
        
        // Restrict supplier users to only see their own supplier record
        if ($user['role'] === 3) {
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            if (!$user_supplier_id) {
                respond(['error' => 'Supplier account not properly configured'], 400);
            }
            $q = $conn->query("SELECT * FROM suppliers WHERE id = $user_supplier_id ORDER BY name");
        } else {
            // Admin/Staff can see all suppliers
            $q = $conn->query("SELECT * FROM suppliers ORDER BY name");
        }
        
        $suppliers = [];
        while ($row = $q->fetch_assoc()) $suppliers[] = $row;
        respond(['suppliers' => $suppliers]);
    } elseif ($action === 'search') {
        $term = $conn->real_escape_string($_GET['q'] ?? '');
        $q = $conn->query("SELECT * FROM suppliers WHERE name LIKE '%$term%' OR contact_person LIKE '%$term%' OR email LIKE '%$term%' OR phone LIKE '%$term%' OR city LIKE '%$term%' OR state LIKE '%$term%' OR notes LIKE '%$term%' ORDER BY name");
        $suppliers = [];
        while ($row = $q->fetch_assoc()) $suppliers[] = $row;
        respond(['suppliers' => $suppliers]);
    } elseif ($action === 'products') {
        $supplier_id = intval($_GET['supplier_id'] ?? 0);
        
        // Restrict supplier users to only see their own products
        if ($user['role'] === 3) {
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            if (!$user_supplier_id) {
                respond(['error' => 'Supplier account not properly configured'], 400);
            }
            // Force supplier_id to be the user's own supplier
            $supplier_id = $user_supplier_id;
        }
        
        if ($supplier_id > 0) {
            $q = $conn->query("
                SELECT sp.*, s.name AS supplier_name, 
                       COALESCE(inv_totals.total_stock, 0) AS stock, 
                       sp.unit_price AS price 
                FROM supplier_products sp 
                LEFT JOIN suppliers s ON sp.supplier_id = s.id 
                LEFT JOIN (
                    SELECT supplier_product_id, SUM(quantity) as total_stock
                    FROM inventory
                    GROUP BY supplier_product_id
                ) inv_totals ON sp.id = inv_totals.supplier_product_id 
                WHERE sp.supplier_id = $supplier_id
            ");
        } else {
            $q = $conn->query("
                SELECT sp.*, s.name AS supplier_name, 
                       COALESCE(inv_totals.total_stock, 0) AS stock, 
                       sp.unit_price AS price 
                FROM supplier_products sp 
                LEFT JOIN suppliers s ON sp.supplier_id = s.id 
                LEFT JOIN (
                    SELECT supplier_product_id, SUM(quantity) as total_stock
                    FROM inventory
                    GROUP BY supplier_product_id
                ) inv_totals ON sp.id = inv_totals.supplier_product_id
            ");
        }
        $products = [];
        while ($row = $q->fetch_assoc()) $products[] = $row;
        respond(['products' => $products]);
    } elseif ($action === 'orders') {
        $supplier_id = intval($_GET['supplier_id'] ?? 0);
        
        // Restrict supplier users to only see their own orders
        if ($user['role'] === 3) {
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            if (!$user_supplier_id) {
                respond(['error' => 'Supplier account not properly configured'], 400);
            }
            // Force supplier_id to be the user's own supplier
            $supplier_id = $user_supplier_id;
        }
        
        if ($supplier_id > 0) {
            $q = $conn->query("SELECT * FROM purchase_orders WHERE supplier_id = $supplier_id ORDER BY order_date DESC");
        } else {
            $q = $conn->query("SELECT * FROM purchase_orders ORDER BY order_date DESC");
        }
        $orders = [];
        while ($row = $q->fetch_assoc()) {
            $order_id = $row['id'];
            $items = [];
            $qi = $conn->query("SELECT * FROM purchase_order_items WHERE purchase_order_id = $order_id");
            while ($item = $qi->fetch_assoc()) $items[] = $item;
            $row['items'] = $items;
            $orders[] = $row;
        }
        error_log("Orders fetched for supplier_id $supplier_id: " . count($orders) . " orders found");
        respond(['orders' => $orders]);
    } elseif ($action === 'order_details') {
        require_once 'purchase_order_calculations.php';
        
        $order_id = intval($_GET['id'] ?? 0);
        if ($order_id > 0) {
            $orderDetails = getPurchaseOrderDetails($conn, $order_id);
            if ($orderDetails) {
                respond(['success' => true, 'order' => $orderDetails]);
            } else {
                respond(['success' => false, 'error' => 'Purchase order not found'], 404);
            }
        } else {
            respond(['success' => false, 'error' => 'Missing order ID'], 400);
        }
    } elseif ($action === 'restock_requests') {
        // Get restock requests for supplier users
        if ($user['role'] === 3) {
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            if (!$user_supplier_id) {
                respond(['error' => 'Supplier account not properly configured'], 400);
            }
            
            // Get pending restock requests for this supplier's products
            $q = $conn->query("
                SELECT sr.*, sp.product_name, sp.unit_price, s.name as supplier_name,
                       u.username as requested_by_username
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN suppliers s ON sp.supplier_id = s.id
                LEFT JOIN users u ON sr.requested_by = u.id
                WHERE sp.supplier_id = $user_supplier_id 
                AND sr.status = 'pending'
                ORDER BY sr.requested_at DESC
            ");
            
            $requests = [];
            while ($row = $q->fetch_assoc()) {
                $requests[] = $row;
            }
            
            respond(['success' => true, 'requests' => $requests]);
        } else {
            // Admin/Staff can see all restock requests
            $q = $conn->query("
                SELECT sr.*, sp.product_name, sp.unit_price, s.name as supplier_name,
                       u.username as requested_by_username
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                JOIN suppliers s ON sp.supplier_id = s.id
                LEFT JOIN users u ON sr.requested_by = u.id
                WHERE sr.status = 'pending'
                ORDER BY sr.requested_at DESC
            ");
            
            $requests = [];
            while ($row = $q->fetch_assoc()) {
                $requests[] = $row;
            }
            
            respond(['success' => true, 'requests' => $requests]);
        }
    } else {
        respond(['error' => 'Unknown action'], 400);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? '';
    
    if ($action === 'create_order') {
        // Check permission for creating restock orders
        if ($user['role'] === 3) {
            // Supplier can create their own restock orders
            $auth->requirePermission('suppliers', 'update_own');
            
            // Verify this supplier belongs to the user
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            
            if (!$user_supplier_id || $user_supplier_id != $data['supplier_id']) {
                respond(['error' => 'Access denied: You can only create orders for your own supplier account'], 403);
            }
        } else {
            // Admin/Staff can create orders for suppliers
            $auth->requirePermission('suppliers', 'update');
        }
        
        require_once 'purchase_order_calculations.php';
        
        $supplier_id = intval($data['supplier_id'] ?? 0);
        $po_number = $conn->real_escape_string($data['po_number'] ?? '');
        $order_date = $conn->real_escape_string($data['order_date'] ?? date('Y-m-d'));
        $status = $conn->real_escape_string($data['status'] ?? 'Draft');
        $notes = $conn->real_escape_string($data['notes'] ?? '');
        $tax_rate = floatval($data['tax_rate'] ?? 0.00);
        $items = $data['items'] ?? [];
        $created_by = $user['user_id'] ?? null;

        if ($supplier_id > 0 && $po_number && !empty($items)) {
            // Start transaction
            $conn->begin_transaction();
            
            try {
                // Create purchase order with initial values
                $stmt = $conn->prepare("
                    INSERT INTO purchase_orders 
                    (supplier_id, po_number, order_date, status, notes, tax_rate, created_by, subtotal, tax_amount, total_amount) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
                ");
                $stmt->bind_param("issssdi", $supplier_id, $po_number, $order_date, $status, $notes, $tax_rate, $created_by);
                
                if (!$stmt->execute()) {
                    throw new Exception("Failed to create purchase order: " . $stmt->error);
                }
                
                $order_id = $conn->insert_id;
                
                // Insert purchase order items
                $stmt = $conn->prepare("
                    INSERT INTO purchase_order_items 
                    (purchase_order_id, product_name, description, quantity, unit_price, total_price) 
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                
                foreach ($items as $item) {
                    $product_name = $conn->real_escape_string($item['product_name'] ?? '');
                    $description = $conn->real_escape_string($item['description'] ?? '');
                    $quantity = intval($item['quantity'] ?? 1);
                    $unit_price = floatval($item['unit_price'] ?? 0);
                    $total_price = $quantity * $unit_price;
                    
                    if ($product_name && $quantity > 0 && $unit_price > 0) {
                        $stmt->bind_param("issidi", $order_id, $product_name, $description, $quantity, $unit_price, $total_price);
                        if (!$stmt->execute()) {
                            throw new Exception("Failed to add item: " . $stmt->error);
                        }
                    }
                }
                
                // Calculate and update totals
                if (!updatePurchaseOrderTotals($conn, $order_id, $tax_rate)) {
                    throw new Exception("Failed to calculate totals");
                }
                
                $conn->commit();
                respond(['success' => true, 'id' => $order_id, 'message' => 'Purchase order created successfully']);
                
            } catch (Exception $e) {
                $conn->rollback();
                respond(['success' => false, 'error' => $e->getMessage()], 500);
            }
        } else {
            respond(['success' => false, 'error' => 'Missing required fields: supplier_id, po_number, or items'], 400);
        }
    } elseif ($action === 'add_product') {
        // Handle adding individual products by supplier users
        if ($user['role'] === 3) {
            // Only suppliers can add products to their own catalog
            $auth->requirePermission('suppliers', 'update_own');
            
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            
            if (!$user_supplier_id) {
                respond(['error' => 'Supplier account not properly configured'], 400);
            }
            
            // Verify the supplier_id matches the user's supplier
            $requested_supplier_id = intval($data['supplier_id'] ?? 0);
            if ($requested_supplier_id != $user_supplier_id) {
                respond(['error' => 'You can only add products to your own supplier catalog'], 403);
            }
            
            $product_name = $conn->real_escape_string($data['product_name'] ?? '');
            $description = $conn->real_escape_string($data['description'] ?? '');
            $unit_price = floatval($data['unit_price'] ?? 0);
            $min_order_quantity = intval($data['min_order_quantity'] ?? 1);
            $lead_time_days = intval($data['lead_time_days'] ?? 0);
            
            if (!$product_name || $unit_price <= 0) {
                respond(['error' => 'Product name and valid unit price are required'], 400);
            }
            
            // Insert the new product
            $stmt = $conn->prepare("
                INSERT INTO supplier_products (supplier_id, product_name, description, unit_price, min_order_quantity, lead_time_days)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->bind_param("issdii", $user_supplier_id, $product_name, $description, $unit_price, $min_order_quantity, $lead_time_days);
            
            if ($stmt->execute()) {
                $product_id = $conn->insert_id;
                $stmt->close();
                respond(['success' => true, 'product_id' => $product_id, 'message' => 'Product added successfully']);
            } else {
                $stmt->close();
                respond(['error' => 'Failed to add product'], 500);
            }
        } else {
            // Admin/Staff can also add products but need different permissions
            $auth->requirePermission('suppliers', 'update');
            
            $supplier_id = intval($data['supplier_id'] ?? 0);
            $product_name = $conn->real_escape_string($data['product_name'] ?? '');
            $description = $conn->real_escape_string($data['description'] ?? '');
            $unit_price = floatval($data['unit_price'] ?? 0);
            $min_order_quantity = intval($data['min_order_quantity'] ?? 1);
            $lead_time_days = intval($data['lead_time_days'] ?? 0);
            
            if (!$supplier_id || !$product_name || $unit_price <= 0) {
                respond(['error' => 'Supplier ID, product name and valid unit price are required'], 400);
            }
            
            // Insert the new product
            $stmt = $conn->prepare("
                INSERT INTO supplier_products (supplier_id, product_name, description, unit_price, min_order_quantity, lead_time_days)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->bind_param("issdii", $supplier_id, $product_name, $description, $unit_price, $min_order_quantity, $lead_time_days);
            
            if ($stmt->execute()) {
                $product_id = $conn->insert_id;
                $stmt->close();
                respond(['success' => true, 'product_id' => $product_id, 'message' => 'Product added successfully']);
            } else {
                $stmt->close();
                respond(['error' => 'Failed to add product'], 500);
            }
        }
    } elseif ($action === 'handle_restock_request') {
        // Handle restock request approval/decline
        if ($user['role'] === 3) {
            // Only suppliers can handle restock requests for their products
            $auth->requirePermission('suppliers', 'update_own');
            
            $rbac = $auth->getRBAC();
            $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
            
            if (!$user_supplier_id) {
                respond(['error' => 'Supplier account not properly configured'], 400);
            }
            
            $request_id = intval($data['request_id'] ?? 0);
            $new_status = $conn->real_escape_string($data['status'] ?? '');
            
            if (!$request_id || !in_array($new_status, ['approved', 'declined'])) {
                respond(['error' => 'Invalid request ID or status'], 400);
            }
            
            // Verify this request belongs to the supplier's products
            $check_query = $conn->query("
                SELECT sr.id 
                FROM stock_requests sr
                JOIN supplier_products sp ON sr.product_id = sp.id
                WHERE sr.id = $request_id AND sp.supplier_id = $user_supplier_id AND sr.status = 'pending'
            ");
            
            if ($check_query->num_rows === 0) {
                respond(['error' => 'Request not found or not accessible'], 404);
            }
            
            // Update the request status
            $update_query = $conn->query("
                UPDATE stock_requests 
                SET status = '$new_status', responded_at = NOW() 
                WHERE id = $request_id
            ");
            
            if ($update_query) {
                respond(['success' => true, 'message' => "Request $new_status successfully"]);
            } else {
                respond(['error' => 'Failed to update request status'], 500);
            }
        } else {
            // Admin/Staff can also handle restock requests
            $auth->requirePermission('suppliers', 'update');
            
            $request_id = intval($data['request_id'] ?? 0);
            $new_status = $conn->real_escape_string($data['status'] ?? '');
            
            if (!$request_id || !in_array($new_status, ['approved', 'declined'])) {
                respond(['error' => 'Invalid request ID or status'], 400);
            }
            
            $update_query = $conn->query("
                UPDATE stock_requests 
                SET status = '$new_status', responded_at = NOW() 
                WHERE id = $request_id AND status = 'pending'
            ");
            
            if ($update_query && $conn->affected_rows > 0) {
                respond(['success' => true, 'message' => "Request $new_status successfully"]);
            } else {
                respond(['error' => 'Request not found or already processed'], 404);
            }
        }
    } else {
        // Handle regular supplier CRUD operations
        $id = intval($data['id'] ?? 0);
        
        if ($id > 0) {
            // Update - check update permission
            if ($user['role'] === 3) {
                // Supplier can only update their own profile
                $auth->requirePermission('suppliers', 'update_own');
                
                // Verify this supplier belongs to the user
                $rbac = $auth->getRBAC();
                $user_supplier_id = $rbac->getUserSupplierId($user['user_id']);
                
                if (!$user_supplier_id || $user_supplier_id != $id) {
                    respond(['error' => 'Access denied: You can only update your own supplier profile. Your supplier ID: ' . ($user_supplier_id ?: 'none') . ', Requested ID: ' . $id], 403);
                }
            } else {
                $auth->requirePermission('suppliers', 'update');
            }
        } else {
            // Create - check create permission (only admin/staff can create)
            $auth->requirePermission('suppliers', 'create');
        }
        
        $fields = [
            'name', 'contact_person', 'email', 'phone', 'address', 'city', 'state', 'postal_code', 'country', 'website', 'tax_id', 'payment_terms', 'status', 'notes'
        ];
        $values = [];
        foreach ($fields as $f) {
            $values[$f] = $conn->real_escape_string($data[$f] ?? '');
        }
        
        if ($id > 0) {
            // Update
            $set = [];
            foreach ($fields as $f) $set[] = "$f='" . $values[$f] . "'";
            $sql = "UPDATE suppliers SET " . implode(',', $set) . ", updated_at=NOW() WHERE id=$id";
            $ok = $conn->query($sql);
            // --- Handle products ---
            $conn->query("DELETE FROM supplier_products WHERE supplier_id=$id");
            if (!empty($data['products']) && is_array($data['products'])) {
                foreach ($data['products'] as $p) {
                    $pn = $conn->real_escape_string($p['product_name'] ?? '');
                    $desc = $conn->real_escape_string($p['description'] ?? '');
                    $price = floatval($p['unit_price'] ?? 0);
                    $min = intval($p['min_order_quantity'] ?? 1);
                    $lead = intval($p['lead_time_days'] ?? 0);
                    if ($pn && $price) {
                        $conn->query("INSERT INTO supplier_products (supplier_id, product_name, description, unit_price, min_order_quantity, lead_time_days) VALUES ($id, '$pn', '$desc', $price, $min, $lead)");
                    }
                }
            }
            respond(['success' => $ok, 'id' => $id]);
        } else {
            // Insert
            $sql = "INSERT INTO suppliers (" . implode(',', $fields) . ") VALUES ('" . implode("','", $values) . "')";
            $ok = $conn->query($sql);
            $newId = $conn->insert_id;
            // --- Handle products ---
            if (!empty($data['products']) && is_array($data['products'])) {
                foreach ($data['products'] as $p) {
                    $pn = $conn->real_escape_string($p['product_name'] ?? '');
                    $desc = $conn->real_escape_string($p['description'] ?? '');
                    $price = floatval($p['unit_price'] ?? 0);
                    $min = intval($p['min_order_quantity'] ?? 1);
                    $lead = intval($p['lead_time_days'] ?? 0);
                    if ($pn && $price) {
                        $conn->query("INSERT INTO supplier_products (supplier_id, product_name, description, unit_price, min_order_quantity, lead_time_days) VALUES ($newId, '$pn', '$desc', $price, $min, $lead)");
                    }
                }
            }
            respond(['success' => $ok, 'id' => $newId]);
        }
    }
} elseif ($method === 'DELETE') {
    // Check delete permission for suppliers
    $auth->requirePermission('suppliers', 'delete');
    
    parse_str(file_get_contents('php://input'), $_DELETE);
    $id = intval($_DELETE['id'] ?? 0);
    if ($id > 0) {
        $ok = $conn->query("DELETE FROM suppliers WHERE id=$id");
        $conn->query("DELETE FROM supplier_products WHERE supplier_id=$id");
        respond(['success' => $ok]);
    } else {
        respond(['error' => 'Missing id'], 400);
    }
} else {
    respond(['error' => 'Unsupported method'], 405);
}
// Catch-all: if script reaches here, return a JSON error
if (!headers_sent()) {
    respond(['error' => 'Unexpected end of input or server error'], 500);
}
// Remove closing PHP tag to prevent accidental whitespace 