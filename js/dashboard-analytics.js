// Dashboard Analytics JavaScript
let dashboardCharts = {};

// Initialize dashboard analytics when page loads
document.addEventListener('DOMContentLoaded', function () {
    if (document.location.pathname.includes('dashboard.html') || document.location.pathname.endsWith('/')) {
        initializeDashboardAnalytics();
    }
});

function initializeDashboardAnalytics() {
    try {
        loadDashboardData();
        setupDashboardRefresh();
    } catch (error) {
        console.error('Error initializing dashboard analytics:', error);
        dashboardShowNotification('Failed to initialize dashboard analytics', 'error');
    }
}

async function loadDashboardData() {
    try {
        // Load analytics data for the last 7 days with cache busting
        const timestamp = new Date().getTime();
        const response = await fetch(`backend/analytics.php?action=get_data&days=7&_t=${timestamp}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Log the data for debugging
        console.log('Dashboard analytics data:', data);

        if (data.success) {
            // Update summary metrics (fix: call this function)
            updateDashboardMetrics(data.data);
            createDashboardCharts(data.data);

            // Try to update top products, fallback to product performance if needed
            if (data.data.top_products && (data.data.top_products.products || data.data.top_products.length > 0)) {
                updateTopProducts(data.data.top_products);
            } else if (data.data.product_performance && data.data.product_performance.length > 0) {
                updateTopProductsFromPerformance(data.data.product_performance);
            } else {
                updateTopProducts([]);
            }

            // Update supplier data
            if (data.data.supplier_analytics) {
                try {
                    updateTopSuppliers(data.data.supplier_analytics.top_suppliers);
                } catch (error) {
                    console.error('Error updating top suppliers:', error);
                    console.log('Supplier analytics data:', data.data.supplier_analytics);
                    // Show fallback message
                    const container = document.getElementById('topSuppliersList');
                    if (container) {
                        container.innerHTML = '<p style="text-align: center; color: #6c757d;">Error loading supplier data</p>';
                    }
                }
            }

            updateRecentActivity(data.data);
        } else {
            console.error('Failed to load dashboard data:', data.error);
            dashboardShowNotification('Failed to load dashboard data', 'error');
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        dashboardShowNotification('Error loading dashboard data', 'error');
    }
}

function createDashboardCharts(data) {
    // Revenue Trend Chart (mini version)
    createRevenueTrendChart(data.revenue_trend);

    // Order Status Chart (mini version)
    createOrderStatusChart(data.order_status_distribution);

    // Purchase Order Status Chart (mini version)
    if (data.supplier_analytics) {
        createPurchaseOrderStatusChart(data.supplier_analytics.purchase_order_status);
    }
}

function createRevenueTrendChart(revenueData) {
    const canvas = document.getElementById('revenueTrendChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (dashboardCharts.revenueTrend) {
        dashboardCharts.revenueTrend.destroy();
    }

    dashboardCharts.revenueTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: revenueData?.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Revenue',
                data: revenueData?.data || [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
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
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        font: {
                            size: 10
                        },
                        callback: function (value) {
                            return '₱' + value.toLocaleString();
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function createOrderStatusChart(statusData) {
    const canvas = document.getElementById('orderStatusChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (dashboardCharts.orderStatus) {
        dashboardCharts.orderStatus.destroy();
    }

    const colors = ['#ffd700', '#ff6b35', '#4ecdc4', '#45b7d1', '#ff6b6b'];

    dashboardCharts.orderStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: statusData?.labels || ['Pending', 'Processing', 'Shipped', 'Delivered'],
            datasets: [{
                data: statusData?.data || [0, 0, 0, 0],
                backgroundColor: colors,
                borderWidth: 0,
                cutout: '60%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            size: 10
                        },
                        usePointStyle: true,
                        padding: 10
                    }
                }
            }
        }
    });
}

function createPurchaseOrderStatusChart(statusData) {
    const canvas = document.getElementById('purchaseOrderStatusChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (dashboardCharts.purchaseOrderStatus) {
        dashboardCharts.purchaseOrderStatus.destroy();
    }

    const colors = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#6b7280'];

    dashboardCharts.purchaseOrderStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: statusData?.labels || ['Draft', 'Sent', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'],
            datasets: [{
                data: statusData?.data || [0, 0, 0, 0, 0, 0],
                backgroundColor: colors,
                borderWidth: 0,
                cutout: '60%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            size: 10
                        },
                        usePointStyle: true,
                        padding: 8
                    }
                }
            }
        }
    });
}

function updateTopSuppliers(suppliersData) {
    const container = document.getElementById('topSuppliersList');
    if (!container) return;

    container.innerHTML = '';

    // Debug: Log the actual data structure
    console.log('Dashboard updateTopSuppliers received:', suppliersData);

    // Handle new data structure from backend
    let suppliers = [];
    if (suppliersData && typeof suppliersData === 'object') {
        if (suppliersData.suppliers && Array.isArray(suppliersData.suppliers)) {
            suppliers = suppliersData.suppliers;
        } else if (Array.isArray(suppliersData)) {
            suppliers = suppliersData;
        }
    }

    console.log('Dashboard suppliers array:', suppliers);

    if (!suppliers || suppliers.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6c757d;">No supplier data available</p>';
        return;
    }

    // Show top 5 suppliers
    const topSuppliers = suppliers.slice(0, 5);

    topSuppliers.forEach((supplier, index) => {
        const supplierItem = document.createElement('div');
        supplierItem.className = 'supplier-item';

        const rank = index + 1;
        const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

        supplierItem.innerHTML = `
            <div class="supplier-info">
                <div class="supplier-name">${rankIcon} ${supplier.name}</div>
                <div class="supplier-orders">${supplier.orders} orders</div>
            </div>
            <div class="supplier-spent">₱${supplier.total_spent.toFixed(2)}</div>
        `;

        container.appendChild(supplierItem);
    });
}

function updateTopProducts(productsData) {
    const container = document.getElementById('topProductsList');
    if (!container) return;

    container.innerHTML = '';

    let products = [];

    // Handle different data structures
    if (productsData.products && Array.isArray(productsData.products)) {
        products = productsData.products;
    } else if (Array.isArray(productsData)) {
        products = productsData;
    }

    if (!products || products.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6c757d;">No product data available</p>';
        return;
    }

    // Show top 5 products
    const topProducts = products.slice(0, 5);

    topProducts.forEach((product, index) => {
        const productItem = document.createElement('div');
        productItem.className = 'product-item';

        const rank = index + 1;
        const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

        productItem.innerHTML = `
            <div class="product-info">
                <div class="product-name">${rankIcon} ${product.name}</div>
                <div class="product-sales">${product.units_sold || 0} units sold</div>
            </div>
            <div class="product-revenue">₱${(product.revenue || 0).toFixed(2)}</div>
        `;

        container.appendChild(productItem);
    });
}

function updateTopProductsFromPerformance(productPerformanceData) {
    const container = document.getElementById('topProductsList');
    if (!container) return;

    container.innerHTML = '';

    if (!productPerformanceData || productPerformanceData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6c757d;">No product data available</p>';
        return;
    }

    // Show top 5 products by units sold
    const topProducts = productPerformanceData
        .sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0))
        .slice(0, 5);

    topProducts.forEach((product, index) => {
        const productItem = document.createElement('div');
        productItem.className = 'product-item';

        const rank = index + 1;
        const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

        productItem.innerHTML = `
            <div class="product-info">
                <div class="product-name">${rankIcon} ${product.name}</div>
                <div class="product-sales">${product.units_sold || 0} units sold</div>
            </div>
            <div class="product-revenue">₱${(product.revenue || 0).toFixed(2)}</div>
        `;

        container.appendChild(productItem);
    });
}

function updateRecentActivity(data) {
    const container = document.getElementById('recentActivity');
    if (!container) {
        console.log('Recent activity container not found');
        return;
    }

    container.innerHTML = '';

    // Get recent orders
    const recentOrders = data.recent_orders || [];
    console.log('Recent orders data:', recentOrders);
    const recentItems = [];

    // Add recent orders to activity
    recentOrders.forEach(order => {
        recentItems.push({
            type: 'order',
            title: `Order #${order.id} - ${order.customer_name}`,
            time: order.date,
            amount: order.total_amount,
            status: order.status
        });
    });

    // Sort by date (most recent first)
    recentItems.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Show top 5 recent activities
    const topActivities = recentItems.slice(0, 5);

    if (topActivities.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6c757d;">No recent activity</p>';
        return;
    }

    topActivities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = `activity-item ${activity.type}`;

        const statusIcon = getStatusIcon(activity.status);
        const timeAgo = getTimeAgo(activity.time);

        activityItem.innerHTML = `
            <div class="activity-icon ${activity.type}">${statusIcon}</div>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-time">${timeAgo}</div>
            </div>
            <div class="activity-amount">₱${(activity.amount || 0).toFixed(2)}</div>
        `;

        container.appendChild(activityItem);
    });
}

function getStatusIcon(status) {
    switch (status?.toLowerCase()) {
        case 'pending': return '⏳';
        case 'processing': return '⚙️';
        case 'shipped': return '📦';
        case 'delivered': return '✅';
        case 'cancelled': return '❌';
        default: return '📋';
    }
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString();
}

function setupDashboardRefresh() {
    // Refresh dashboard data every 5 minutes
    setInterval(() => {
        loadDashboardData();
    }, 5 * 60 * 1000);
}

// Add/fix updateDashboardMetrics function
function updateDashboardMetrics(data) {
    // Update summary cards
    const totalOrders = document.getElementById('totalOrders');
    const totalSales = document.getElementById('totalSales');
    const activeCustomers = document.getElementById('activeCustomers');
    const lowStock = document.getElementById('lowStock');
    const activeSuppliers = document.getElementById('activeSuppliers');
    const purchaseOrders = document.getElementById('purchaseOrders');

    // Percentage change elements
    const totalOrdersChange = document.querySelector('#totalOrders + .card-change');
    const totalSalesChange = document.querySelector('#totalSales + .card-change');
    const lowStockChange = document.querySelector('#lowStock + .card-change');
    const activeCustomersChange = document.querySelector('#activeCustomers + .card-change');
    const activeSuppliersChange = document.querySelector('#activeSuppliers + .card-change');
    const purchaseOrdersChange = document.querySelector('#purchaseOrders + .card-change');

    if (totalOrders) {
        totalOrders.textContent = Number(data.total_orders) || 0;
        if (totalOrdersChange && typeof data.total_orders_change !== 'undefined') {
            totalOrdersChange.textContent = (data.total_orders_change > 0 ? '+' : '') + data.total_orders_change.toFixed(1) + '%';
            totalOrdersChange.className = 'card-change ' + (data.total_orders_change >= 0 ? 'positive' : 'negative');
        }
    }
    if (totalSales) {
        totalSales.textContent = '₱' + (Number(data.total_revenue) || 0).toFixed(2);
        if (totalSalesChange && typeof data.total_revenue_change !== 'undefined') {
            totalSalesChange.textContent = (data.total_revenue_change > 0 ? '+' : '') + data.total_revenue_change.toFixed(1) + '%';
            totalSalesChange.className = 'card-change ' + (data.total_revenue_change >= 0 ? 'positive' : 'negative');
        }
    }
    if (activeCustomers) {
        activeCustomers.textContent = Number(data.active_customers) || 0;
        if (activeCustomersChange && typeof data.active_customers_change !== 'undefined') {
            activeCustomersChange.textContent = (data.active_customers_change > 0 ? '+' : '') + data.active_customers_change.toFixed(1) + '%';
            activeCustomersChange.className = 'card-change ' + (data.active_customers_change >= 0 ? 'positive' : 'negative');
        }
    }
    // Fix low stock calculation: expects array of numbers
    let lowStockCount = 0;
    if (Array.isArray(data.inventory_data?.data)) {
        lowStockCount = data.inventory_data.data.filter(stock => typeof stock === 'number' && stock <= 10 && stock > 0).length;
    }
    if (lowStock) {
        lowStock.textContent = lowStockCount;
        if (lowStockChange && typeof data.low_stock_change !== 'undefined') {
            lowStockChange.textContent = (data.low_stock_change > 0 ? '+' : '') + data.low_stock_change.toFixed(1) + ' items';
            lowStockChange.className = 'card-change ' + (data.low_stock_change >= 0 ? 'negative' : 'positive'); // More low stock is bad
        }
    }
    // Update supplier metrics
    if (data.supplier_analytics) {
        if (activeSuppliers) {
            activeSuppliers.textContent = Number(data.supplier_analytics.total_suppliers) || 0;
            if (activeSuppliersChange && typeof data.supplier_analytics.total_suppliers_change !== 'undefined') {
                activeSuppliersChange.textContent = (data.supplier_analytics.total_suppliers_change > 0 ? '+' : '') + data.supplier_analytics.total_suppliers_change.toFixed(1) + '%';
                activeSuppliersChange.className = 'card-change ' + (data.supplier_analytics.total_suppliers_change >= 0 ? 'positive' : 'negative');
            }
        }
        if (purchaseOrders) {
            purchaseOrders.textContent = Number(data.supplier_analytics.total_purchase_orders) || 0;
            if (purchaseOrdersChange && typeof data.supplier_analytics.total_purchase_orders_change !== 'undefined') {
                purchaseOrdersChange.textContent = (data.supplier_analytics.total_purchase_orders_change > 0 ? '+' : '') + data.supplier_analytics.total_purchase_orders_change.toFixed(1) + '%';
                purchaseOrdersChange.className = 'card-change ' + (data.supplier_analytics.total_purchase_orders_change >= 0 ? 'positive' : 'negative');
            }
        }
    }
}

// Global notification function fallback
function dashboardShowNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function' && window.showNotification !== dashboardShowNotification) {
        window.showNotification(message, type);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
} 