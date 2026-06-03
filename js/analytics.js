// Analytics and Reports JavaScript
let charts = {};
let currentDateRange = 30;
let analyticsData = {};
let isShowingNotification = false;

// Initialize analytics when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (document.body.classList.contains('reports-page') || window.location.pathname.includes('report.html')) {
        initializeAnalytics();
    }
});

function initializeAnalytics() {
    try {
        setupDateFilter();
        setupExportButtons();
        loadAnalyticsData();
    } catch (error) {
        console.error('Error initializing analytics:', error);
        showNotification('Failed to initialize analytics', 'error');
    }
}

function setupDateFilter() {
    const dateRange = document.getElementById('dateRange');
    const customDateRange = document.getElementById('customDateRange');
    const applyCustomRange = document.getElementById('applyCustomRange');

    if (!dateRange) return;

    dateRange.addEventListener('change', function() {
        const value = this.value;
        if (value === 'custom') {
            customDateRange.style.display = 'flex';
            // Set default custom range (last 30 days)
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');
            
            if (startDateInput && endDateInput) {
                startDateInput.value = startDate.toISOString().split('T')[0];
                endDateInput.value = endDate.toISOString().split('T')[0];
            }
        } else {
            customDateRange.style.display = 'none';
            if (value === 'all') {
                currentDateRange = 'all';
            } else {
                currentDateRange = parseInt(value);
            }
            loadAnalyticsData();
        }
    });

    if (applyCustomRange) {
        applyCustomRange.addEventListener('click', function() {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            
            if (startDate && endDate && startDate <= endDate) {
                loadAnalyticsData(startDate, endDate);
            } else {
                showNotification('Please select valid start and end dates.', 'error');
            }
        });
    }
}

function setupExportButtons() {
    const exportSalesCSVBtn = document.getElementById('exportSalesCSV');
    const exportOrdersCSVBtn = document.getElementById('exportOrdersCSV');
    const exportInventoryCSVBtn = document.getElementById('exportInventoryCSV');
    const exportSuppliersCSVBtn = document.getElementById('exportSuppliersCSV');
    const exportFullReportBtn = document.getElementById('exportFullReport');

    if (exportSalesCSVBtn) {
        exportSalesCSVBtn.addEventListener('click', exportSalesCSV);
    }
    if (exportOrdersCSVBtn) {
        exportOrdersCSVBtn.addEventListener('click', exportOrdersCSV);
    }
    if (exportInventoryCSVBtn) {
        exportInventoryCSVBtn.addEventListener('click', exportInventoryCSV);
    }
    if (exportSuppliersCSVBtn) {
        exportSuppliersCSVBtn.addEventListener('click', exportSuppliersCSV);
    }
    if (exportFullReportBtn) {
        exportFullReportBtn.addEventListener('click', exportFullReport);
    }
}

async function loadAnalyticsData(startDate = null, endDate = null) {
    try {
        // Show loading state
        document.body.classList.add('loading');
        
        // Calculate date range
        let dateParams = '';
        if (startDate && endDate) {
            dateParams = `&start_date=${startDate}&end_date=${endDate}`;
        } else if (currentDateRange === 'all') {
            dateParams = '';
        } else {
            dateParams = `&days=${currentDateRange}`;
        }

        // Fetch analytics data
        const response = await fetch(`backend/analytics.php?action=get_data${dateParams}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();

        if (data.success) {
            analyticsData = data.data;
            updateMetrics();
            createCharts();
            updateTables();
        } else {
            console.error('Failed to load analytics data:', data.error);
            showNotification('Failed to load analytics data. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error loading analytics data:', error);
        showNotification('Error loading analytics data. Please check your connection.', 'error');
    } finally {
        document.body.classList.remove('loading');
    }
}

function updateMetrics() {
    const data = analyticsData;
    
    // Update metric values
    const totalRevenue = document.getElementById('totalRevenue');
    const totalOrders = document.getElementById('totalOrders');
    const avgOrderValue = document.getElementById('avgOrderValue');
    const activeCustomers = document.getElementById('activeCustomers');

    if (totalRevenue) {
        totalRevenue.textContent = '\u20b1' + (data.total_revenue || 0).toFixed(2);
    }
    if (totalOrders) {
        totalOrders.textContent = data.total_orders || 0;
    }
    if (avgOrderValue) {
        avgOrderValue.textContent = '\u20b1' + (data.avg_order_value || 0).toFixed(2);
    }
    if (activeCustomers) {
        activeCustomers.textContent = data.active_customers || 0;
    }

    // Update supplier metrics
    if (data.supplier_analytics) {
        const activeSuppliers = document.getElementById('activeSuppliers');
        const purchaseOrders = document.getElementById('purchaseOrders');
        
        if (activeSuppliers) {
            activeSuppliers.textContent = data.supplier_analytics.total_suppliers || 0;
        }
        if (purchaseOrders) {
            purchaseOrders.textContent = data.supplier_analytics.total_purchase_orders || 0;
        }
    }

    // Update metric changes (dynamic from backend)
    const revenueChange = document.getElementById('revenueChange');
    const ordersChange = document.getElementById('ordersChange');
    const avgOrderChange = document.getElementById('avgOrderChange');
    const customersChange = document.getElementById('customersChange');
    const suppliersChange = document.getElementById('suppliersChange');
    const purchaseOrdersChange = document.getElementById('purchaseOrdersChange');

    if (revenueChange && typeof data.total_revenue_change !== 'undefined') {
        revenueChange.textContent = (data.total_revenue_change > 0 ? '+' : '') + data.total_revenue_change.toFixed(1) + '%';
        revenueChange.className = 'metric-change ' + (data.total_revenue_change >= 0 ? 'positive' : 'negative');
    }
    if (ordersChange && typeof data.total_orders_change !== 'undefined') {
        ordersChange.textContent = (data.total_orders_change > 0 ? '+' : '') + data.total_orders_change.toFixed(1) + '%';
        ordersChange.className = 'metric-change ' + (data.total_orders_change >= 0 ? 'positive' : 'negative');
    }
    // For avg order value, calculate change if possible
    if (avgOrderChange && typeof data.avg_order_value !== 'undefined' && typeof data.total_orders_change !== 'undefined' && typeof data.total_revenue_change !== 'undefined') {
        // Estimate avg order value change as difference in avg order value between periods
        // (not provided by backend, so fallback to 0)
        avgOrderChange.textContent = '';
        avgOrderChange.className = 'metric-change positive';
    }
    if (customersChange && typeof data.active_customers_change !== 'undefined') {
        customersChange.textContent = (data.active_customers_change > 0 ? '+' : '') + data.active_customers_change.toFixed(1) + '%';
        customersChange.className = 'metric-change ' + (data.active_customers_change >= 0 ? 'positive' : 'negative');
    }
    if (suppliersChange && data.supplier_analytics && typeof data.supplier_analytics.total_suppliers_change !== 'undefined') {
        suppliersChange.textContent = (data.supplier_analytics.total_suppliers_change > 0 ? '+' : '') + data.supplier_analytics.total_suppliers_change.toFixed(1) + '%';
        suppliersChange.className = 'metric-change ' + (data.supplier_analytics.total_suppliers_change >= 0 ? 'positive' : 'negative');
    }
    if (purchaseOrdersChange && data.supplier_analytics && typeof data.supplier_analytics.total_purchase_orders_change !== 'undefined') {
        purchaseOrdersChange.textContent = (data.supplier_analytics.total_purchase_orders_change > 0 ? '+' : '') + data.supplier_analytics.total_purchase_orders_change.toFixed(1) + '%';
        purchaseOrdersChange.className = 'metric-change ' + (data.supplier_analytics.total_purchase_orders_change >= 0 ? 'positive' : 'negative');
    }
}

function createCharts() {
    const data = analyticsData;
    
    // Revenue Trend Chart
    createRevenueChart(data.revenue_trend);
    
    // Order Status Distribution Chart
    createOrderStatusChart(data.order_status_distribution);
    
    // Top Products Chart
    createTopProductsChart(data.top_products);
    
    // Inventory Chart
    createInventoryChart(data.inventory_data);
    
    // Supplier Charts
    if (data.supplier_analytics) {
        createPurchaseOrderStatusChart(data.supplier_analytics.purchase_order_status);
        createTopSuppliersChart(data.supplier_analytics.top_suppliers);
    }
}

function createRevenueChart(revenueData) {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (charts.revenueChart) {
        charts.revenueChart.destroy();
    }

    charts.revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: revenueData?.labels || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Revenue',
                data: revenueData?.data || [0, 0, 0, 0, 0, 0],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '₱' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function createOrderStatusChart(statusData) {
    const canvas = document.getElementById('orderStatusChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (charts.orderStatusChart) {
        charts.orderStatusChart.destroy();
    }

    const colors = ['#ffd700', '#ff6b35', '#4ecdc4', '#45b7d1', '#ff6b6b'];
    
    charts.orderStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: statusData?.labels || ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
            datasets: [{
                data: statusData?.data || [0, 0, 0, 0, 0],
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createTopProductsChart(productsData) {
    const canvas = document.getElementById('topProductsChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (charts.topProductsChart) {
        charts.topProductsChart.destroy();
    }

    charts.topProductsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: productsData?.labels || ['Product A', 'Product B', 'Product C'],
            datasets: [{
                label: 'Sales',
                data: productsData?.data || [0, 0, 0],
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: '#667eea',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function createInventoryChart(inventoryData) {
    const canvas = document.getElementById('inventoryChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (charts.inventoryChart) {
        charts.inventoryChart.destroy();
    }

    const colors = inventoryData?.labels?.map((_, index) => {
        const stock = inventoryData.data[index] || 0;
        if (stock === 0) return '#ff6b6b';
        if (stock <= 10) return '#ffd700';
        return '#4ecdc4';
    }) || ['#4ecdc4'];

    charts.inventoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: inventoryData?.labels || ['Product A', 'Product B', 'Product C'],
            datasets: [{
                label: 'Stock Level',
                data: inventoryData?.data || [0, 0, 0],
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function createPurchaseOrderStatusChart(statusData) {
    const canvas = document.getElementById('purchaseOrderStatusChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (charts.purchaseOrderStatusChart) {
        charts.purchaseOrderStatusChart.destroy();
    }

    const colors = ['#667eea', '#ffd700', '#4ecdc4', '#45b7d1', '#ff6b6b'];
    
    charts.purchaseOrderStatusChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: statusData?.labels || ['Draft', 'Sent', 'Confirmed', 'Shipped', 'Delivered'],
            datasets: [{
                data: statusData?.data || [0, 0, 0, 0, 0],
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createTopSuppliersChart(suppliersData) {
    const canvas = document.getElementById('topSuppliersChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (charts.topSuppliersChart) {
        charts.topSuppliersChart.destroy();
    }

    // Use the properly formatted data from backend
    const labels = suppliersData?.labels || ['No Data'];
    const data = suppliersData?.data || [0];
    
    console.log('Creating Top Suppliers Chart with data:', { labels, data });

    charts.topSuppliersChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Spend',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: '#667eea',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Make the bar chart horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '₱' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateTables() {
    const data = analyticsData;
    
    // Update top customers table
    if (data.top_customers) {
        updateTopCustomersTable(data.top_customers);
    }
    
    // Update product performance table
    if (data.product_performance) {
        updateProductPerformanceTable(data.product_performance);
    }
    
    // Update purchase order analytics table
    if (data.purchase_order_analytics) {
        updatePurchaseOrderTable(data.purchase_order_analytics);
    }
}

function updateTopCustomersTable(customers) {
    const tbody = document.querySelector('#topCustomersTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    customers.forEach(customer => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${customer.name}</td>
            <td>${customer.orders}</td>
            <td>₱${customer.total_spent.toFixed(2)}</td>
            <td>${customer.last_order}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateProductPerformanceTable(products) {
    const tbody = document.querySelector('#productPerformanceTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    products.forEach(product => {
        const row = document.createElement('tr');
        const stockStatus = getStockStatus(product.stock_level);
        
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.units_sold}</td>
            <td>₱${product.revenue.toFixed(2)}</td>
            <td>${product.stock_level}</td>
            <td><span class="stock-status ${stockStatus.class}">${stockStatus.text}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function getStockStatus(stockLevel) {
    if (stockLevel === 0) {
        return { class: 'out-of-stock', text: 'Out of Stock' };
    } else if (stockLevel <= 10) {
        return { class: 'low-stock', text: 'Low Stock' };
    } else {
        return { class: 'in-stock', text: 'In Stock' };
    }
}

function updatePurchaseOrderTable(purchaseOrderData) {
    const tbody = document.querySelector('#purchaseOrderTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!purchaseOrderData || purchaseOrderData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #666;">No purchase orders found</td></tr>';
        return;
    }
    
    purchaseOrderData.forEach(order => {
        const row = document.createElement('tr');
        const orderDate = new Date(order.order_date);
        const daysSinceOrder = Math.floor((new Date() - orderDate) / (1000 * 60 * 60 * 24));
        
        // Status styling
        const statusClass = getOrderStatusClass(order.status);
        
        row.innerHTML = `
            <td><strong>${order.po_number}</strong></td>
            <td>${order.supplier_name}</td>
            <td>${orderDate.toLocaleDateString()}</td>
            <td><span class="status-badge ${statusClass}">${order.status}</span></td>
            <td>₱${parseFloat(order.total_amount).toFixed(2)}</td>
            <td>${daysSinceOrder} days</td>
        `;
        tbody.appendChild(row);
    });
}

function getOrderStatusClass(status) {
    switch (status.toLowerCase()) {
        case 'delivered': return 'status-delivered';
        case 'confirmed': return 'status-confirmed';
        case 'shipped': return 'status-shipped';
        case 'sent': return 'status-sent';
        case 'draft': return 'status-draft';
        case 'cancelled': return 'status-cancelled';
        default: return 'status-pending';
    }
}

function exportSalesCSV() {
    if (analyticsData.sales_data) {
        const csv = generateSalesCSV(analyticsData.sales_data);
        downloadCSV(csv, 'sales_report.csv');
    } else {
        showNotification('No sales data available for export', 'warning');
    }
}

function exportOrdersCSV() {
    if (analyticsData.orders_data) {
        const csv = generateOrdersCSV(analyticsData.orders_data);
        downloadCSV(csv, 'orders_report.csv');
    } else {
        showNotification('No orders data available for export', 'warning');
    }
}

function exportInventoryCSV() {
    if (analyticsData.inventory_data) {
        const csv = generateInventoryCSV(analyticsData.inventory_data);
        downloadCSV(csv, 'inventory_report.csv');
    } else {
        showNotification('No inventory data available for export', 'warning');
    }
}

function exportSuppliersCSV() {
    if (analyticsData.supplier_analytics) {
        const csv = generateSuppliersCSV(analyticsData.supplier_analytics);
        downloadCSV(csv, 'suppliers_report.csv');
    } else {
        showNotification('No suppliers data available for export', 'warning');
    }
}

// Add jsPDF PDF export for full report
function exportFullReport() {
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
        showNotification('PDF export requires jsPDF library. Please add jsPDF to your project.', 'error');
        return;
    }
    // Use jsPDF
    const doc = new (window.jspdf?.jsPDF || window.jsPDF)({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    let y = 40;
    doc.setFontSize(18);
    doc.text('Analytics & Full Report', 40, y);
    y += 30;
    doc.setFontSize(12);
    // Key Metrics
    doc.text('Key Metrics', 40, y);
    y += 20;
    const metrics = [
        ['Total Revenue', '₱' + (analyticsData.total_revenue || 0).toFixed(2)],
        ['Total Orders', analyticsData.total_orders || 0],
        ['Average Order Value', '₱' + (analyticsData.avg_order_value || 0).toFixed(2)],
        ['Active Customers', analyticsData.active_customers || 0],
        ['Active Suppliers', analyticsData.supplier_analytics?.total_suppliers || 0],
        ['Purchase Orders', analyticsData.supplier_analytics?.total_purchase_orders || 0],
    ];
    metrics.forEach(([label, value]) => {
        doc.text(`${label}: ${value}`, 60, y);
        y += 18;
    });
    y += 10;
    // Top Customers Table
    if (analyticsData.top_customers && analyticsData.top_customers.length > 0) {
        doc.setFontSize(14);
        doc.text('Top Customers', 40, y);
        y += 18;
        doc.setFontSize(10);
        doc.text('Customer', 60, y);
        doc.text('Orders', 200, y);
        doc.text('Total Spent', 270, y);
        doc.text('Last Order', 370, y);
        y += 14;
        analyticsData.top_customers.forEach(c => {
            doc.text(String(c.name), 60, y);
            doc.text(String(c.orders), 200, y);
            doc.text('₱' + (c.total_spent || 0).toFixed(2), 270, y);
            doc.text(String(c.last_order), 370, y);
            y += 12;
        });
        y += 10;
    }
    // Product Performance Table
    if (analyticsData.product_performance && analyticsData.product_performance.length > 0) {
        doc.setFontSize(14);
        doc.text('Product Performance', 40, y);
        y += 18;
        doc.setFontSize(10);
        doc.text('Product', 60, y);
        doc.text('Units Sold', 200, y);
        doc.text('Revenue', 270, y);
        doc.text('Stock Level', 350, y);
        doc.text('Status', 420, y);
        y += 14;
        analyticsData.product_performance.forEach(p => {
            doc.text(String(p.name), 60, y);
            doc.text(String(p.units_sold), 200, y);
            doc.text('₱' + (p.revenue || 0).toFixed(2), 270, y);
            doc.text(String(p.stock_level), 350, y);
            doc.text(String(p.status || ''), 420, y);
            y += 12;
        });
        y += 10;
    }
    // Top Suppliers Table
    if (analyticsData.supplier_analytics && analyticsData.supplier_analytics.top_suppliers && analyticsData.supplier_analytics.top_suppliers.suppliers && analyticsData.supplier_analytics.top_suppliers.suppliers.length > 0) {
        doc.setFontSize(14);
        doc.text('Top Suppliers by Spend', 40, y);
        y += 18;
        doc.setFontSize(10);
        doc.text('Supplier', 60, y);
        doc.text('Orders', 200, y);
        doc.text('Total Spent', 270, y);
        doc.text('Avg Order Value', 370, y);
        y += 14;
        analyticsData.supplier_analytics.top_suppliers.suppliers.forEach(s => {
            doc.text(String(s.name), 60, y);
            doc.text(String(s.orders), 200, y);
            doc.text('₱' + (s.total_spent || 0).toFixed(2), 270, y);
            doc.text('₱' + (s.avg_order_value || 0).toFixed(2), 370, y);
            y += 12;
        });
        y += 10;
    }
    doc.save('full_analytics_report.pdf');
    showNotification('PDF exported successfully!', 'success');
}

function generateSalesCSV(salesData) {
    let csv = 'Date,Revenue,Orders,Average Order Value\n';
    salesData.forEach(row => {
        csv += `${row.date},${row.revenue},${row.orders},${row.avg_order_value}\n`;
    });
    return csv;
}

function generateOrdersCSV(ordersData) {
    let csv = 'Order ID,Customer,Status,Date,Amount\n';
    ordersData.forEach(order => {
        csv += `${order.id},${order.customer_name},${order.status},${order.date},${order.total_amount}\n`;
    });
    return csv;
}

function generateInventoryCSV(inventoryData) {
    let csv = 'Product,Stock Level,Status\n';
    inventoryData.labels.forEach((label, index) => {
        const stock = inventoryData.data[index];
        const status = stock === 0 ? 'Out of Stock' : stock <= 10 ? 'Low Stock' : 'In Stock';
        csv += `${label},${stock},${status}\n`;
    });
    return csv;
}

function generateSuppliersCSV(supplierAnalytics) {
    let csv = 'Supplier,Orders,Total Spent,Average Order Value\n';
    if (supplierAnalytics.top_suppliers && supplierAnalytics.top_suppliers.suppliers) {
        supplierAnalytics.top_suppliers.suppliers.forEach(supplier => {
            csv += `${supplier.name},${supplier.orders},${supplier.total_spent},${supplier.avg_order_value}\n`;
        });
    }
    return csv;
}

function generateFullReportCSV(data) {
    let csv = 'Analytics Report\n\n';
    csv += 'Key Metrics\n';
    csv += `Total Revenue,${data.total_revenue}\n`;
    csv += `Total Orders,${data.total_orders}\n`;
    csv += `Average Order Value,${data.avg_order_value}\n`;
    csv += `Active Customers,${data.active_customers}\n\n`;
    
    if (data.top_products) {
        csv += 'Top Products\n';
        data.top_products.labels.forEach((label, index) => {
            csv += `${label},${data.top_products.data[index]}\n`;
        });
    }
    
    return csv;
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('Report exported successfully!', 'success');
}

// Register Chart.js controllers and elements for bar charts (Chart.js v3+)
if (window.Chart) {
    Chart.register(
        Chart.BarElement,
        Chart.CategoryScale,
        Chart.LinearScale,
        Chart.Title,
        Chart.Tooltip,
        Chart.Legend
    );
}

// Fix showNotification infinite recursion and add a simple UI fallback
function showNotification(message, type = 'info') {
    if (isShowingNotification) return;
    isShowingNotification = true;
    try {
        // Fallback: show a simple notification div on the page
        let notif = document.createElement('div');
        notif.textContent = message;
        notif.className = 'notification notification-' + type;
        notif.style.position = 'fixed';
        notif.style.top = '20px';
        notif.style.right = '20px';
        notif.style.zIndex = 9999;
        notif.style.padding = '12px 20px';
        notif.style.borderRadius = '6px';
        notif.style.background = type === 'error' ? '#ff6b6b' : (type === 'warning' ? '#ffd700' : '#333');
        notif.style.color = type === 'warning' ? '#222' : '#fff';
        notif.style.fontSize = '16px';
        notif.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transition = 'opacity 0.5s';
            setTimeout(() => notif.remove(), 500);
        }, 2500);
    } catch (error) {
        console.error('Notification error:', error);
    } finally {
        isShowingNotification = false;
    }
} 