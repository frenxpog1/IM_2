<?php
/**
 * Purchase Order Calculation Functions
 */

/**
 * Calculate purchase order totals
 * @param int $purchaseOrderId
 * @param float $taxRate (optional, default 0%)
 * @return array with subtotal, tax_amount, total_amount
 */
function calculatePurchaseOrderTotals($conn, $purchaseOrderId, $taxRate = 0.00) {
    // Get all items for this purchase order
    $stmt = $conn->prepare("
        SELECT SUM(total_price) as subtotal 
        FROM purchase_order_items 
        WHERE purchase_order_id = ?
    ");
    $stmt->bind_param("i", $purchaseOrderId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    $subtotal = floatval($row['subtotal'] ?? 0);
    $taxAmount = $subtotal * $taxRate; // taxRate is already a decimal (0.12 for 12%)
    $totalAmount = $subtotal + $taxAmount;
    
    return [
        'subtotal' => $subtotal,
        'tax_rate' => $taxRate,
        'tax_amount' => $taxAmount,
        'total_amount' => $totalAmount
    ];
}

/**
 * Update purchase order totals in database
 * @param int $purchaseOrderId
 * @param float $taxRate (optional, default 0%)
 * @return bool success
 */
function updatePurchaseOrderTotals($conn, $purchaseOrderId, $taxRate = 0.00) {
    $totals = calculatePurchaseOrderTotals($conn, $purchaseOrderId, $taxRate);
    
    $stmt = $conn->prepare("
        UPDATE purchase_orders 
        SET subtotal = ?, 
            tax_rate = ?, 
            tax_amount = ?, 
            total_amount = ?
        WHERE id = ?
    ");
    
    $stmt->bind_param("ddddi", 
        $totals['subtotal'], 
        $totals['tax_rate'], 
        $totals['tax_amount'], 
        $totals['total_amount'], 
        $purchaseOrderId
    );
    
    return $stmt->execute();
}

/**
 * Get purchase order with detailed financial breakdown
 * @param int $purchaseOrderId
 * @return array purchase order with items and totals
 */
function getPurchaseOrderDetails($conn, $purchaseOrderId) {
    // Get purchase order basic info
    $stmt = $conn->prepare("
        SELECT po.*, s.name as supplier_name, s.contact_person, s.email, s.phone,
               u.username as created_by_username
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN users u ON po.created_by = u.id
        WHERE po.id = ?
    ");
    $stmt->bind_param("i", $purchaseOrderId);
    $stmt->execute();
    $result = $stmt->get_result();
    $purchaseOrder = $result->fetch_assoc();
    
    if (!$purchaseOrder) {
        return null;
    }
    
    // Get purchase order items
    $stmt = $conn->prepare("
        SELECT * FROM purchase_order_items 
        WHERE purchase_order_id = ?
        ORDER BY id
    ");
    $stmt->bind_param("i", $purchaseOrderId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $items = [];
    while ($row = $result->fetch_assoc()) {
        $items[] = $row;
    }
    
    $purchaseOrder['items'] = $items;
    
    // Ensure financial calculations are up to date
    $totals = calculatePurchaseOrderTotals($conn, $purchaseOrderId, $purchaseOrder['tax_rate'] ?? 0);
    $purchaseOrder = array_merge($purchaseOrder, $totals);
    
    return $purchaseOrder;
}

/**
 * Format currency for display
 * @param float $amount
 * @return string formatted currency
 */
function formatCurrency($amount) {
    return '₱' . number_format($amount, 2);
}

/**
 * Generate receipt-style HTML for purchase order
 * @param array $purchaseOrder (from getPurchaseOrderDetails)
 * @return string HTML receipt
 */
function generatePurchaseOrderReceipt($purchaseOrder) {
    if (!$purchaseOrder) {
        return '<p>Purchase order not found.</p>';
    }
    
    $html = '
    <div class="purchase-order-receipt">
        <div class="receipt-header">
            <h3>Purchase Order Receipt</h3>
            <div class="receipt-info">
                <div><strong>PO Number:</strong> ' . htmlspecialchars($purchaseOrder['po_number']) . '</div>
                <div><strong>Order Date:</strong> ' . date('M d, Y', strtotime($purchaseOrder['order_date'])) . '</div>
                <div><strong>Status:</strong> <span class="status-' . strtolower($purchaseOrder['status']) . '">' . $purchaseOrder['status'] . '</span></div>
            </div>
        </div>
        
        <div class="supplier-info">
            <h4>Supplier Information</h4>
            <div><strong>' . htmlspecialchars($purchaseOrder['supplier_name']) . '</strong></div>';
    
    if ($purchaseOrder['contact_person']) {
        $html .= '<div>Contact: ' . htmlspecialchars($purchaseOrder['contact_person']) . '</div>';
    }
    if ($purchaseOrder['email']) {
        $html .= '<div>Email: ' . htmlspecialchars($purchaseOrder['email']) . '</div>';
    }
    if ($purchaseOrder['phone']) {
        $html .= '<div>Phone: ' . htmlspecialchars($purchaseOrder['phone']) . '</div>';
    }
    
    $html .= '
        </div>
        
        <div class="items-section">
            <h4>Items Ordered</h4>
            <table class="receipt-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>';
    
    foreach ($purchaseOrder['items'] as $item) {
        $html .= '
                    <tr>
                        <td>
                            <strong>' . htmlspecialchars($item['product_name']) . '</strong>';
        if ($item['description']) {
            $html .= '<br><small>' . htmlspecialchars($item['description']) . '</small>';
        }
        $html .= '
                        </td>
                        <td>' . number_format($item['quantity']) . '</td>
                        <td>' . formatCurrency($item['unit_price']) . '</td>
                        <td>' . formatCurrency($item['total_price']) . '</td>
                    </tr>';
    }
    
    $html .= '
                </tbody>
            </table>
        </div>
        
        <div class="totals-section">
            <div class="total-line">
                <span>Subtotal:</span>
                <span>' . formatCurrency($purchaseOrder['subtotal']) . '</span>
            </div>';
    
    if ($purchaseOrder['tax_amount'] > 0) {
        $html .= '
            <div class="total-line">
                <span>Tax (' . number_format($purchaseOrder['tax_rate'] * 100, 1) . '%):</span>
                <span>' . formatCurrency($purchaseOrder['tax_amount']) . '</span>
            </div>';
    }
    
    $html .= '
            <div class="total-line grand-total">
                <span><strong>Total Amount:</strong></span>
                <span><strong>' . formatCurrency($purchaseOrder['total_amount']) . '</strong></span>
            </div>
        </div>';
    
    if ($purchaseOrder['notes']) {
        $html .= '
        <div class="notes-section">
            <h4>Notes</h4>
            <p>' . nl2br(htmlspecialchars($purchaseOrder['notes'])) . '</p>
        </div>';
    }
    
    $html .= '
    </div>
    
    <style>
    .purchase-order-receipt {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family: Arial, sans-serif;
        line-height: 1.4;
    }
    .receipt-header {
        text-align: center;
        border-bottom: 2px solid #333;
        padding-bottom: 15px;
        margin-bottom: 20px;
    }
    .receipt-info {
        display: flex;
        justify-content: space-around;
        margin-top: 10px;
        font-size: 14px;
    }
    .supplier-info {
        background: #f8f9fa;
        padding: 15px;
        border-radius: 5px;
        margin-bottom: 20px;
    }
    .supplier-info h4 {
        margin-top: 0;
        color: #333;
    }
    .receipt-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
    }
    .receipt-table th,
    .receipt-table td {
        padding: 10px;
        text-align: left;
        border-bottom: 1px solid #ddd;
    }
    .receipt-table th {
        background: #f8f9fa;
        font-weight: bold;
    }
    .receipt-table td:nth-child(2),
    .receipt-table td:nth-child(3),
    .receipt-table td:nth-child(4) {
        text-align: right;
    }
    .totals-section {
        border-top: 2px solid #333;
        padding-top: 15px;
        text-align: right;
    }
    .total-line {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        padding: 0 20px;
    }
    .grand-total {
        font-size: 18px;
        border-top: 1px solid #333;
        padding-top: 10px;
        margin-top: 10px;
    }
    .status-delivered { color: #28a745; }
    .status-confirmed { color: #007bff; }
    .status-shipped { color: #17a2b8; }
    .status-pending { color: #ffc107; }
    .status-cancelled { color: #dc3545; }
    .notes-section {
        margin-top: 20px;
        padding-top: 15px;
        border-top: 1px solid #ddd;
    }
    </style>';
    
    return $html;
}
?>