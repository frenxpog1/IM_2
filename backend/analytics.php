<?php
// Enable error reporting for debugging (disable in production)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');
include 'db.php';
session_start();
if (!isset($_SESSION['role']) || !in_array($_SESSION['role'], [1, 2])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Access denied.']);
    exit;
}

function json_error($msg) {
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

/**
 * Helper to run a query and fetch all results as an array
 * @param string $sql
 * @param bool $singleRow If true, return only the first row
 * @return array|false
 */
function fetch_query($sql, $singleRow = false) {
    global $conn;
    $result = $conn->query($sql);
    if (!$result) json_error($conn->error);
    if ($singleRow) {
        return $result->fetch_assoc();
    }
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    return $rows;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get_data':
        $days = isset($_GET['days']) ? preg_replace('/[^0-9a-zA-Z]/', '', $_GET['days']) : null;
        $startDate = isset($_GET['start_date']) ? preg_replace('/[^0-9\-]/', '', $_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? preg_replace('/[^0-9\-]/', '', $_GET['end_date']) : null;
        
        // Calculate date range
        if ($startDate && $endDate) {
            $dateCondition = "WHERE o.date BETWEEN '$startDate' AND '$endDate'";
        } else if ($days && $days !== 'all') {
            $dateCondition = "WHERE o.date >= DATE_SUB(CURDATE(), INTERVAL $days DAY)";
        } else {
            $dateCondition = ""; // All time
        }
        
        $analyticsData = [
            'total_revenue' => getTotalRevenue($dateCondition),
            'total_orders' => getTotalOrders($dateCondition),
            'avg_order_value' => getAverageOrderValue($dateCondition),
            'active_customers' => getActiveCustomers($dateCondition),
            'revenue_trend' => getRevenueTrend($dateCondition),
            'order_status_distribution' => getOrderStatusDistribution($dateCondition),
            'top_products' => getTopProducts($dateCondition),
            'inventory_data' => getInventoryData(),
            'top_customers' => getTopCustomers($dateCondition),
            'product_performance' => getProductPerformance($dateCondition),
            'sales_data' => getSalesData($dateCondition),
            'orders_data' => getOrdersData($dateCondition),
            'supplier_analytics' => getSupplierAnalytics($dateCondition),
            'recent_orders' => getRecentOrders(),
            'purchase_order_analytics' => getPurchaseOrderAnalytics($dateCondition)
        ];

        // --- Calculate percentage changes for dashboard summary ---
        // For 7-day period, compare to previous 7 days
        $prevDateCondition = '';
        if ($days && $days !== 'all') {
            $prevDateCondition = "WHERE o.date >= DATE_SUB(CURDATE(), INTERVAL " . (2 * intval($days)) . " DAY) AND o.date < DATE_SUB(CURDATE(), INTERVAL $days DAY)";
        }
        // Total Revenue Change
        $currentRevenue = $analyticsData['total_revenue'];
        $prevRevenue = $prevDateCondition ? getTotalRevenue($prevDateCondition) : 0;
        $analyticsData['total_revenue_change'] = $prevRevenue > 0 ? (($currentRevenue - $prevRevenue) / $prevRevenue) * 100 : 0;
        // Total Orders Change
        $currentOrders = $analyticsData['total_orders'];
        $prevOrders = $prevDateCondition ? getTotalOrders($prevDateCondition) : 0;
        $analyticsData['total_orders_change'] = $prevOrders > 0 ? (($currentOrders - $prevOrders) / $prevOrders) * 100 : 0;
        // Active Customers Change
        $currentCustomers = $analyticsData['active_customers'];
        $prevCustomers = $prevDateCondition ? getActiveCustomers($prevDateCondition) : 0;
        $analyticsData['active_customers_change'] = $prevCustomers > 0 ? (($currentCustomers - $prevCustomers) / $prevCustomers) * 100 : 0;
        // Low Stock Change (count of products with stock <= 10 and > 0)
        $currentLowStock = 0;
        if (isset($analyticsData['inventory_data']['data']) && is_array($analyticsData['inventory_data']['data'])) {
            foreach ($analyticsData['inventory_data']['data'] as $stock) {
                if (is_numeric($stock) && $stock <= 10 && $stock > 0) $currentLowStock++;
            }
        }
        $prevLowStock = 0;
        if ($prevDateCondition) {
            $prevInventory = getInventoryData();
            if (isset($prevInventory['data']) && is_array($prevInventory['data'])) {
                foreach ($prevInventory['data'] as $stock) {
                    if (is_numeric($stock) && $stock <= 10 && $stock > 0) $prevLowStock++;
                }
            }
        }
        $analyticsData['low_stock_change'] = $prevLowStock > 0 ? ($currentLowStock - $prevLowStock) : 0;
        // Supplier Analytics Changes
        if (isset($analyticsData['supplier_analytics'])) {
            $currentSuppliers = $analyticsData['supplier_analytics']['total_suppliers'] ?? 0;
            $currentPO = $analyticsData['supplier_analytics']['total_purchase_orders'] ?? 0;
            $prevSuppliers = 0;
            $prevPO = 0;
            if ($prevDateCondition) {
                $prevSupplierAnalytics = getSupplierAnalytics($prevDateCondition);
                $prevSuppliers = $prevSupplierAnalytics['total_suppliers'] ?? 0;
                $prevPO = $prevSupplierAnalytics['total_purchase_orders'] ?? 0;
            }
            $analyticsData['supplier_analytics']['total_suppliers_change'] = $prevSuppliers > 0 ? (($currentSuppliers - $prevSuppliers) / $prevSuppliers) * 100 : 0;
            $analyticsData['supplier_analytics']['total_purchase_orders_change'] = $prevPO > 0 ? (($currentPO - $prevPO) / $prevPO) * 100 : 0;
        }
        echo json_encode(['success' => true, 'data' => $analyticsData]);
        break;
    default:
        json_error('Invalid action');
}

function getTotalRevenue($dateCondition) {
    $row = fetch_query("SELECT SUM(total_amount) as total FROM orders o $dateCondition", true);
    return floatval($row['total'] ?? 0);
}

function getTotalOrders($dateCondition) {
    $row = fetch_query("SELECT COUNT(*) as total FROM orders o $dateCondition", true);
    return intval($row['total'] ?? 0);
}

function getAverageOrderValue($dateCondition) {
    $row = fetch_query("SELECT AVG(total_amount) as avg_value FROM orders o $dateCondition", true);
    return floatval($row['avg_value'] ?? 0);
}

function getActiveCustomers($dateCondition) {
    $row = fetch_query("SELECT COUNT(DISTINCT customer_name) as total FROM orders o $dateCondition", true);
    return intval($row['total'] ?? 0);
}

function getRevenueTrend($dateCondition) {
    $rows = fetch_query("
        SELECT DATE(o.date) as date, SUM(o.total_amount) as revenue
        FROM orders o 
        $dateCondition
        GROUP BY DATE(o.date)
        ORDER BY date
    ");
    $labels = [];
    $data = [];
    foreach ($rows as $row) {
        $labels[] = date('M d', strtotime($row['date']));
        $data[] = floatval($row['revenue']);
    }
    return ['labels' => $labels, 'data' => $data];
}

function getOrderStatusDistribution($dateCondition) {
    $rows = fetch_query("
        SELECT status, COUNT(*) as count
        FROM orders o 
        $dateCondition
        GROUP BY status
        ORDER BY count DESC
    ");
    $labels = [];
    $data = [];
    foreach ($rows as $row) {
        $labels[] = $row['status'];
        $data[] = intval($row['count']);
    }
    return ['labels' => $labels, 'data' => $data];
}

function getTopProducts($dateCondition) {
    $rows = fetch_query("
        SELECT sp.product_name AS name, SUM(oi.quantity) as units_sold, SUM(oi.total_price) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN supplier_products sp ON oi.supplier_product_id = sp.id
        $dateCondition
        GROUP BY sp.id, sp.product_name
        ORDER BY units_sold DESC
        LIMIT 10
    ");
    $labels = [];
    $data = [];
    $products = [];
    foreach ($rows as $row) {
        $labels[] = $row['name'];
        $data[] = intval($row['units_sold']);
        $products[] = [
            'name' => $row['name'],
            'units_sold' => intval($row['units_sold']),
            'revenue' => floatval($row['revenue'])
        ];
    }
    return [
        'labels' => $labels, 
        'data' => $data,
        'products' => $products
    ];
}

function getInventoryData() {
    $rows = fetch_query("
        SELECT sp.product_name AS name, COALESCE(i.quantity, 0) AS stock,
               CASE 
                   WHEN COALESCE(i.quantity, 0) = 0 THEN 'Out of Stock'
                   WHEN COALESCE(i.quantity, 0) <= 10 THEN 'Low Stock'
                   ELSE 'In Stock'
               END as status
        FROM supplier_products sp
        LEFT JOIN inventory i ON i.supplier_product_id = sp.id
        ORDER BY stock ASC
    ");
    $labels = [];
    $data = [];
    foreach ($rows as $row) {
        $labels[] = $row['name'];
        $data[] = intval($row['stock']);
    }
    return ['labels' => $labels, 'data' => $data];
}

function getTopCustomers($dateCondition) {
    $rows = fetch_query("
        SELECT 
            customer_name as name,
            COUNT(*) as orders,
            SUM(total_amount) as total_spent,
            MAX(date) as last_order
        FROM orders o 
        $dateCondition
        GROUP BY customer_name
        ORDER BY total_spent DESC
        LIMIT 10
    ");
    $customers = [];
    foreach ($rows as $row) {
        $customers[] = [
            'name' => $row['name'],
            'orders' => intval($row['orders']),
            'total_spent' => floatval($row['total_spent']),
            'last_order' => $row['last_order']
        ];
    }
    return $customers;
}

function getProductPerformance($dateCondition) {
    $rows = fetch_query("
        SELECT 
            sp.product_name AS name,
            COALESCE(i.quantity, 0) as stock_level,
            COALESCE(SUM(oi.quantity), 0) as units_sold,
            COALESCE(SUM(oi.total_price), 0) as revenue
        FROM supplier_products sp
        LEFT JOIN inventory i ON i.supplier_product_id = sp.id
        LEFT JOIN order_items oi ON oi.supplier_product_id = sp.id
        LEFT JOIN orders o ON oi.order_id = o.id $dateCondition
        GROUP BY sp.id, sp.product_name, i.quantity
        ORDER BY units_sold DESC
    ");
    $products = [];
    foreach ($rows as $row) {
        $products[] = [
            'name' => $row['name'],
            'units_sold' => intval($row['units_sold']),
            'revenue' => floatval($row['revenue']),
            'stock_level' => intval($row['stock_level'])
        ];
    }
    return $products;
}

function getSalesData($dateCondition) {
    $rows = fetch_query("
        SELECT 
            DATE(o.date) as date,
            SUM(o.total_amount) as revenue,
            COUNT(*) as orders,
            AVG(o.total_amount) as avg_order_value
        FROM orders o 
        $dateCondition
        GROUP BY DATE(o.date)
        ORDER BY date
    ");
    $sales = [];
    foreach ($rows as $row) {
        $sales[] = [
            'date' => $row['date'],
            'revenue' => floatval($row['revenue']),
            'orders' => intval($row['orders']),
            'avg_order_value' => floatval($row['avg_order_value'])
        ];
    }
    return $sales;
}

function getOrdersData($dateCondition) {
    $rows = fetch_query("
        SELECT 
            o.id,
            o.customer_name as customer,
            o.date,
            o.status,
            o.total_amount
        FROM orders o 
        $dateCondition
        ORDER BY o.date DESC
    ");
    $orders = [];
    foreach ($rows as $row) {
        $orders[] = [
            'id' => $row['id'],
            'customer' => $row['customer'],
            'date' => $row['date'],
            'status' => $row['status'],
            'total_amount' => floatval($row['total_amount'])
        ];
    }
    return $orders;
}

function getSupplierAnalytics($dateCondition) {
    // Get total suppliers
    $row = fetch_query("SELECT COUNT(*) as total FROM suppliers WHERE status = 'Active'", true);
    $totalSuppliers = $row['total'];
    // Get purchase order statistics
    $poStats = fetch_query("
        SELECT 
            COUNT(*) as total_orders,
            SUM(total_amount) as total_spent,
            AVG(total_amount) as avg_order_value,
            COUNT(CASE WHEN status = 'Delivered' THEN 1 END) as delivered_orders,
            COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_orders
        FROM purchase_orders
    ", true);
    // Get top suppliers by purchase amount
    $suppliers = [];
    $supplierLabels = [];
    $supplierData = [];
    $rows = fetch_query("
        SELECT 
            s.name,
            COUNT(po.id) as orders,
            COALESCE(SUM(po.total_amount), 0) as total_spent,
            COALESCE(AVG(po.total_amount), 0) as avg_order_value
        FROM suppliers s
        LEFT JOIN purchase_orders po ON s.id = po.supplier_id
        WHERE s.status = 'Active'
        GROUP BY s.id, s.name
        HAVING total_spent > 0
        ORDER BY total_spent DESC
        LIMIT 5
    ");
    foreach ($rows as $row) {
        $suppliers[] = [
            'name' => $row['name'],
            'orders' => intval($row['orders']),
            'total_spent' => floatval($row['total_spent']),
            'avg_order_value' => floatval($row['avg_order_value'])
        ];
        $supplierLabels[] = $row['name'];
        $supplierData[] = floatval($row['total_spent']);
    }
    
    // If no suppliers with purchase orders, get top 5 active suppliers anyway
    if (empty($suppliers)) {
        $rows = fetch_query("
            SELECT name, 0 as orders, 0 as total_spent, 0 as avg_order_value
            FROM suppliers 
            WHERE status = 'Active'
            ORDER BY name
            LIMIT 5
        ");
        foreach ($rows as $row) {
            $suppliers[] = [
                'name' => $row['name'],
                'orders' => 0,
                'total_spent' => 0.0,
                'avg_order_value' => 0.0
            ];
            $supplierLabels[] = $row['name'];
            $supplierData[] = 0.0;
        }
    }
    // Get purchase order status distribution
    $rows = fetch_query("
        SELECT status, COUNT(*) as count
        FROM purchase_orders
        GROUP BY status
        ORDER BY count DESC
    ");
    $statusLabels = [];
    $statusData = [];
    foreach ($rows as $row) {
        $statusLabels[] = $row['status'];
        $statusData[] = intval($row['count']);
    }
    // Get supplier products count
    $productCounts = [];
    $rows = fetch_query("
        SELECT 
            s.name,
            COUNT(sp.id) as products_count
        FROM suppliers s
        LEFT JOIN supplier_products sp ON s.id = sp.supplier_id
        WHERE s.status = 'Active'
        GROUP BY s.id, s.name
        ORDER BY products_count DESC
        LIMIT 5
    ");
    foreach ($rows as $row) {
        $productCounts[] = [
            'name' => $row['name'],
            'products_count' => intval($row['products_count'])
        ];
    }
    return [
        'total_suppliers' => intval($totalSuppliers),
        'total_purchase_orders' => intval($poStats['total_orders']),
        'total_spent' => floatval($poStats['total_spent']),
        'avg_purchase_order' => floatval($poStats['avg_order_value']),
        'delivered_orders' => intval($poStats['delivered_orders']),
        'pending_orders' => intval($poStats['pending_orders']),
        'top_suppliers' => [
            'labels' => $supplierLabels,
            'data' => $supplierData,
            'suppliers' => $suppliers
        ],
        'purchase_order_status' => ['labels' => $statusLabels, 'data' => $statusData],
        'supplier_products' => $productCounts
    ];
}

function getRecentOrders() {
    $rows = fetch_query("
        SELECT 
            id,
            customer_name,
            status,
            date,
            total_amount,
            notes
        FROM orders 
        ORDER BY date DESC, id DESC
        LIMIT 10
    ");
    $recent_orders = [];
    foreach ($rows as $row) {
        $recent_orders[] = [
            'id' => intval($row['id']),
            'customer_name' => $row['customer_name'],
            'status' => $row['status'],
            'date' => $row['date'],
            'total_amount' => floatval($row['total_amount'] ?? 0),
            'notes' => $row['notes']
        ];
    }
    return $recent_orders;
}

function getPurchaseOrderAnalytics($dateCondition) {
    // Modify date condition to work with purchase_orders table
    $poDateCondition = str_replace('o.date', 'po.order_date', $dateCondition);
    
    $rows = fetch_query("
        SELECT 
            po.po_number,
            s.name as supplier_name,
            po.order_date,
            po.status,
            po.total_amount,
            DATEDIFF(CURDATE(), po.order_date) as days_since_order
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        $poDateCondition
        ORDER BY po.order_date DESC
        LIMIT 20
    ");
    
    $purchaseOrders = [];
    foreach ($rows as $row) {
        $purchaseOrders[] = [
            'po_number' => $row['po_number'],
            'supplier_name' => $row['supplier_name'],
            'order_date' => $row['order_date'],
            'status' => $row['status'],
            'total_amount' => floatval($row['total_amount']),
            'days_since_order' => intval($row['days_since_order'])
        ];
    }
    
    return $purchaseOrders;
}

$conn->close();
?> 