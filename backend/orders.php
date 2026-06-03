<?php
header('Content-Type: application/json');
include 'db.php';
require_once 'auth_middleware.php';

$auth = getAuthMiddleware($conn);

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        // Check read permission for orders
        $auth->requirePermission('orders', 'read');
        
        // Get order items or all orders
        if (isset($_GET['action']) && $_GET['action'] === 'get_items' && isset($_GET['order_id'])) {
            $order_id = intval($_GET['order_id']);
            $stmt = $conn->prepare('
                SELECT oi.*, sp.product_name, sp.description, sp.unit_price, sp.min_order_quantity, sp.lead_time_days
                FROM order_items oi
                LEFT JOIN supplier_products sp ON oi.supplier_product_id = sp.id
                WHERE oi.order_id = ?
            ');
            if (!$stmt) {
                echo json_encode(['success' => false, 'error' => $conn->error]);
                break;
            }
            $stmt->bind_param('i', $order_id);
            if (!$stmt->execute()) {
                echo json_encode(['success' => false, 'error' => $stmt->error]);
                break;
            }
            $result = $stmt->get_result();
            $items = [];
            while ($row = $result->fetch_assoc()) {
                $items[] = $row;
            }
            $stmt->close();
            echo json_encode(['success' => true, 'items' => $items]);
        } else {
            $result = $conn->query('SELECT * FROM orders ORDER BY date DESC');
            $orders = [];
            while ($row = $result->fetch_assoc()) {
                $orders[] = $row;
            }
            echo json_encode(['success' => true, 'orders' => $orders]);
        }
        break;
    case 'POST':
        // Check create permission for orders
        $auth->requirePermission('orders', 'create');
        
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);
        if ($data) {
            $status = $data['status'] ?? '';
            $date = $data['date'] ?? '';
            $customer_name = $data['customer_name'] ?? '';
            $customer_contact = $data['customer_contact'] ?? '';
            $notes = $data['notes'] ?? '';
            $total_amount = $data['total_amount'] ?? 0.00;
            $order_items = $data['order_items'] ?? [];
            if (!$status || !$date || !$customer_name || empty($order_items)) {
                echo json_encode(['success' => false, 'error' => 'Missing required fields.']);
                break;
            }
            $supplier_product_ids = [];
            foreach ($order_items as $item) {
                if (in_array($item['supplier_product_id'], $supplier_product_ids)) {
                    echo json_encode(['success' => false, 'error' => 'Duplicate product in order items.']);
                    break 2;
                }
                $supplier_product_ids[] = $item['supplier_product_id'];
            }
            $conn->begin_transaction();
            try {
                $stmt = $conn->prepare('INSERT INTO orders (date, status, customer_name, customer_contact, notes, total_amount) VALUES (?, ?, ?, ?, ?, ?)');
                if (!$stmt) throw new Exception($conn->error);
                $stmt->bind_param('sssssd', $date, $status, $customer_name, $customer_contact, $notes, $total_amount);
                if (!$stmt->execute()) throw new Exception($stmt->error);
                $order_id = $stmt->insert_id;
                $stmt->close();
                foreach ($order_items as $item) {
                    $supplier_product_id = $item['supplier_product_id'];
                    $quantity = $item['quantity'];
                    $unit_price = $item['unit_price'];
                    $total_price = $item['total_price'];
                    $stmt = $conn->prepare('INSERT INTO order_items (order_id, supplier_product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)');
                    if (!$stmt) throw new Exception($conn->error);
                    $stmt->bind_param('iiddd', $order_id, $supplier_product_id, $quantity, $unit_price, $total_price);
                    if (!$stmt->execute()) throw new Exception($stmt->error);
                    $stmt->close();
                    // Decrement inventory quantity - Fixed to handle multiple records properly
                    // First, get the current total stock for this product
                    $checkStockStmt = $conn->prepare('SELECT COALESCE(SUM(quantity), 0) as total_stock FROM inventory WHERE supplier_product_id = ?');
                    if (!$checkStockStmt) throw new Exception($conn->error);
                    $checkStockStmt->bind_param('i', $supplier_product_id);
                    if (!$checkStockStmt->execute()) throw new Exception($checkStockStmt->error);
                    $stockResult = $checkStockStmt->get_result();
                    $currentStock = $stockResult->fetch_assoc()['total_stock'];
                    $checkStockStmt->close();
                    
                    // Calculate new total stock
                    $newTotalStock = $currentStock - $quantity;
                    
                    // Delete all existing inventory records for this product
                    $deleteStmt = $conn->prepare('DELETE FROM inventory WHERE supplier_product_id = ?');
                    if (!$deleteStmt) throw new Exception($conn->error);
                    $deleteStmt->bind_param('i', $supplier_product_id);
                    if (!$deleteStmt->execute()) throw new Exception($deleteStmt->error);
                    $deleteStmt->close();
                    
                    // Insert a single consolidated record with the new quantity
                    if ($newTotalStock != 0) { // Only insert if quantity is not zero
                        $insertStmt = $conn->prepare('INSERT INTO inventory (supplier_product_id, quantity) VALUES (?, ?)');
                        if (!$insertStmt) throw new Exception($conn->error);
                        $insertStmt->bind_param('ii', $supplier_product_id, $newTotalStock);
                        if (!$insertStmt->execute()) throw new Exception($insertStmt->error);
                        $insertStmt->close();
                    }
                }
                $conn->commit();
                echo json_encode(['success' => true, 'id' => $order_id]);
            } catch (Exception $e) {
                $conn->rollback();
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
        } else {
            echo json_encode(['success' => false, 'error' => 'Invalid data.']);
        }
        break;
    case 'PATCH':
        // Handle status updates separately
        $auth->requirePermission('orders', 'update');
        
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);
        if ($data && isset($data['id']) && isset($data['status'])) {
            $id = intval($data['id']);
            $status = trim($data['status']);
            $notes = isset($data['notes']) ? trim($data['notes']) : null;
            
            if ($id > 0 && !empty($status)) {
                try {
                    if ($notes !== null) {
                        // Update both status and notes
                        $stmt = $conn->prepare('UPDATE orders SET status = ?, notes = ? WHERE id = ?');
                        $stmt->bind_param('ssi', $status, $notes, $id);
                    } else {
                        // Update only status
                        $stmt = $conn->prepare('UPDATE orders SET status = ? WHERE id = ?');
                        $stmt->bind_param('si', $status, $id);
                    }
                    
                    if ($stmt->execute()) {
                        echo json_encode(['success' => true, 'message' => 'Order status updated successfully']);
                    } else {
                        echo json_encode(['success' => false, 'error' => 'Failed to update order status: ' . $stmt->error]);
                    }
                    $stmt->close();
                } catch (Exception $e) {
                    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
                }
            } else {
                echo json_encode(['success' => false, 'error' => 'Invalid order ID or status']);
            }
        } else {
            echo json_encode(['success' => false, 'error' => 'Missing required fields (id, status)']);
        }
        break;
    case 'PUT':
        // Check update permission for orders
        $auth->requirePermission('orders', 'update');
        
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);
        if ($data) {
            $id = $data['id'] ?? '';
            $status = $data['status'] ?? '';
            $customer_name = $data['customer_name'] ?? '';
            $customer_contact = $data['customer_contact'] ?? '';
            $notes = $data['notes'] ?? '';
            $total_amount = $data['total_amount'] ?? 0.00;
            $order_items = $data['order_items'] ?? [];
            if (!$id || !$status || !$customer_name || empty($order_items)) {
                echo json_encode(['success' => false, 'error' => 'Missing required fields.']);
                break;
            }
            $supplier_product_ids = [];
            foreach ($order_items as $item) {
                if (in_array($item['supplier_product_id'], $supplier_product_ids)) {
                    echo json_encode(['success' => false, 'error' => 'Duplicate product in order items.']);
                    break 2;
                }
                $supplier_product_ids[] = $item['supplier_product_id'];
            }
            $conn->begin_transaction();
            try {
                // Restore inventory for old items - Fixed to handle multiple records properly
                $stmt = $conn->prepare('SELECT supplier_product_id, quantity FROM order_items WHERE order_id = ?');
                if (!$stmt) throw new Exception($conn->error);
                $stmt->bind_param('i', $id);
                if (!$stmt->execute()) throw new Exception($stmt->error);
                $result = $stmt->get_result();
                while ($row = $result->fetch_assoc()) {
                    $restore_supplier_product_id = $row['supplier_product_id'];
                    $restore_quantity = $row['quantity'];
                    
                    // Get current total stock for this product
                    $checkStockStmt = $conn->prepare('SELECT COALESCE(SUM(quantity), 0) as total_stock FROM inventory WHERE supplier_product_id = ?');
                    if (!$checkStockStmt) throw new Exception($conn->error);
                    $checkStockStmt->bind_param('i', $restore_supplier_product_id);
                    if (!$checkStockStmt->execute()) throw new Exception($checkStockStmt->error);
                    $stockResult = $checkStockStmt->get_result();
                    $currentStock = $stockResult->fetch_assoc()['total_stock'];
                    $checkStockStmt->close();
                    
                    // Calculate restored stock
                    $restoredStock = $currentStock + $restore_quantity;
                    
                    // Delete all existing inventory records for this product
                    $deleteStmt = $conn->prepare('DELETE FROM inventory WHERE supplier_product_id = ?');
                    if (!$deleteStmt) throw new Exception($conn->error);
                    $deleteStmt->bind_param('i', $restore_supplier_product_id);
                    if (!$deleteStmt->execute()) throw new Exception($deleteStmt->error);
                    $deleteStmt->close();
                    
                    // Insert a single consolidated record with the restored quantity
                    if ($restoredStock != 0) { // Only insert if quantity is not zero
                        $insertStmt = $conn->prepare('INSERT INTO inventory (supplier_product_id, quantity) VALUES (?, ?)');
                        if (!$insertStmt) throw new Exception($conn->error);
                        $insertStmt->bind_param('ii', $restore_supplier_product_id, $restoredStock);
                        if (!$insertStmt->execute()) throw new Exception($insertStmt->error);
                        $insertStmt->close();
                    }
                }
                $stmt->close();
                // Delete old order_items
                $stmt = $conn->prepare('DELETE FROM order_items WHERE order_id = ?');
                if (!$stmt) throw new Exception($conn->error);
                $stmt->bind_param('i', $id);
                if (!$stmt->execute()) throw new Exception($stmt->error);
                $stmt->close();
                // Insert new order_items
                foreach ($order_items as $item) {
                    $supplier_product_id = $item['supplier_product_id'];
                    $quantity = $item['quantity'];
                    $unit_price = $item['unit_price'];
                    $total_price = $item['total_price'];
                    $stmt = $conn->prepare('INSERT INTO order_items (order_id, supplier_product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)');
                    if (!$stmt) throw new Exception($conn->error);
                    $stmt->bind_param('iiddd', $id, $supplier_product_id, $quantity, $unit_price, $total_price);
                    if (!$stmt->execute()) throw new Exception($stmt->error);
                    $stmt->close();
                    // Decrement inventory for new items - Fixed to handle multiple records properly
                    // First, get the current total stock for this product
                    $checkStockStmt = $conn->prepare('SELECT COALESCE(SUM(quantity), 0) as total_stock FROM inventory WHERE supplier_product_id = ?');
                    if (!$checkStockStmt) throw new Exception($conn->error);
                    $checkStockStmt->bind_param('i', $supplier_product_id);
                    if (!$checkStockStmt->execute()) throw new Exception($checkStockStmt->error);
                    $stockResult = $checkStockStmt->get_result();
                    $currentStock = $stockResult->fetch_assoc()['total_stock'];
                    $checkStockStmt->close();
                    
                    // Calculate new total stock
                    $newTotalStock = $currentStock - $quantity;
                    
                    // Delete all existing inventory records for this product
                    $deleteStmt = $conn->prepare('DELETE FROM inventory WHERE supplier_product_id = ?');
                    if (!$deleteStmt) throw new Exception($conn->error);
                    $deleteStmt->bind_param('i', $supplier_product_id);
                    if (!$deleteStmt->execute()) throw new Exception($deleteStmt->error);
                    $deleteStmt->close();
                    
                    // Insert a single consolidated record with the new quantity
                    if ($newTotalStock != 0) { // Only insert if quantity is not zero
                        $insertStmt = $conn->prepare('INSERT INTO inventory (supplier_product_id, quantity) VALUES (?, ?)');
                        if (!$insertStmt) throw new Exception($conn->error);
                        $insertStmt->bind_param('ii', $supplier_product_id, $newTotalStock);
                        if (!$insertStmt->execute()) throw new Exception($insertStmt->error);
                        $insertStmt->close();
                    }
                }
                $stmt = $conn->prepare('UPDATE orders SET date = ?, status = ?, customer_name = ?, customer_contact = ?, notes = ?, total_amount = ? WHERE id = ?');
                if (!$stmt) throw new Exception($conn->error);
                $date = $data['date'] ?? date('Y-m-d');
                $stmt->bind_param('sssssdi', $date, $status, $customer_name, $customer_contact, $notes, $total_amount, $id);
                if (!$stmt->execute()) throw new Exception($stmt->error);
                $stmt->close();
                $conn->commit();
                echo json_encode(['success' => true]);
            } catch (Exception $e) {
                $conn->rollback();
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
        } else {
            echo json_encode(['success' => false, 'error' => 'Invalid data.']);
        }
        break;
    case 'DELETE':
        // Check delete permission for orders
        $auth->requirePermission('orders', 'delete');
        
        parse_str(file_get_contents('php://input'), $_DELETE);
        $id = intval($_DELETE['id'] ?? 0);
        if ($id > 0) {
            $ok = $conn->query("DELETE FROM orders WHERE id=$id");
            $conn->query("DELETE FROM order_items WHERE order_id=$id");
            echo json_encode(['success' => $ok]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Missing id']);
        }
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid request.']);
}
$conn->close();
// End of modernized orders.php 