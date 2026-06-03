// ordermanagement.js
// All order management code has been moved here from main.js.

// Global notification function
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    
    // Add to page
    const container = document.querySelector('.notification-container') || document.body;
    container.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// --- ORDERS CRUD LOGIC ---
// Complete Order Management System
class OrderManager {
    constructor() {
        this.orders = [];
        this.filteredOrders = [];
        this.products = [];
        // Add these variables to OrderManager
        // this.suppliers = [];
        // this.supplierProducts = [];
    }

    async init() {
        try {
            await this.loadOrders();
            await this.loadProducts();
            this.setupEventListeners();
            this.updateStatistics();
            this.renderOrders();
        } catch (error) {
            console.error('Error initializing OrderManager:', error);
            showNotification('Failed to initialize order management', 'error');
        }
    }

    async loadOrders() {
        if (window.IS_MOCK_MODE) {
            console.log('Loading mock orders');
            this.orders = window.MOCK_DATA.orders;
            this.filteredOrders = [...this.orders];
            return;
        }
        try {
            const response = await fetch('backend/orders.php');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                this.orders = data.orders || [];
                this.filteredOrders = [...this.orders];
                console.log('Orders loaded successfully:', this.orders.length, 'orders');
                console.log('Order IDs and types:', this.orders.map(o => ({ id: o.id, type: typeof o.id })));
            } else {
                console.error('Failed to load orders:', data.message);
                this.orders = [];
                this.filteredOrders = [];
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            this.orders = [];
            this.filteredOrders = [];
            showNotification('Failed to load orders. Using demo data.', 'warning');
        }
    }

    async loadProducts() {
        try {
            const response = await fetch('backend/suppliers.php?action=products');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (Array.isArray(data.products)) {
                // Add a unique id for each supplier product (use their DB id)
                this.products = data.products.map(p => ({
                    id: p.id,
                    name: p.product_name,
                    ...p
                }));
            } else {
                this.products = [];
            }
        } catch (error) {
            console.error('Error loading supplier products:', error);
            this.products = [];
        }
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('orderSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.applyFilters();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.applyFilters();
            });
        }

        // Create order button
        const createOrderBtn = document.getElementById('createOrderBtn');
        if (createOrderBtn) {
            createOrderBtn.addEventListener('click', () => {
                this.openOrderModal();
            });
        }

        // Add Product Row button
        const addProductRowBtn = document.getElementById('addProductRow');
        if (addProductRowBtn) {
            addProductRowBtn.onclick = null; // Remove any previous handler
            addProductRowBtn.addEventListener('click', () => {
                this.addProductRow();
            });
        }

        // Order modal events
        this.setupOrderModal();
        
        // Order details modal events
        this.setupOrderDetailsModal();
    }

    applyFilters() {
        const searchInput = document.getElementById('orderSearch');
        const statusSelect = document.getElementById('statusFilter');
        
        if (!searchInput || !statusSelect) {
            return;
        }
        
        const searchTerm = searchInput.value.toLowerCase().trim();
        const statusFilter = statusSelect.value;
        
        let filtered = [...this.orders];
        
        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(order => {
                const customerMatch = order.customer_name && order.customer_name.toLowerCase().includes(searchTerm);
                const idMatch = order.id.toString().includes(searchTerm);
                const contactMatch = order.customer_contact && order.customer_contact.toLowerCase().includes(searchTerm);
                
                return customerMatch || idMatch || contactMatch;
            });
        }
        
        // Apply status filter
        if (statusFilter) {
            filtered = filtered.filter(order => 
                order.status.toLowerCase() === statusFilter.toLowerCase()
            );
        }
        
        this.filteredOrders = filtered;
        this.renderOrders();
    }

    updateStatistics() {
        const totalOrders = document.getElementById('totalOrders');
        const pendingOrders = document.getElementById('pendingOrders');
        const totalRevenue = document.getElementById('totalRevenue');

        if (totalOrders) totalOrders.textContent = this.orders.length;

        if (pendingOrders) {
            const pending = this.orders.filter(order => 
                order.status.toLowerCase() === 'pending'
            ).length;
            pendingOrders.textContent = pending;
        }

        if (totalRevenue) {
            // Calculate total revenue with better error handling
            let revenue = 0;
            this.orders.forEach(order => {
                const amount = order.total_amount;
                if (amount !== null && amount !== undefined && amount !== '') {
                    const numAmount = parseFloat(amount);
                    if (!isNaN(numAmount)) {
                        revenue += numAmount;
                    }
                }
            });
            
            totalRevenue.textContent = `₱${revenue.toFixed(2)}`;
        }
    }

    renderOrders() {
        const tbody = document.querySelector('#ordersTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.filteredOrders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">No orders found</td></tr>';
            return;
        }

        this.filteredOrders.forEach(order => {
            const row = document.createElement('tr');
            const statusClass = order.status.toLowerCase().replace(' ', '-');
            
            // Safe amount formatting
            let amount = 0;
            if (order.total_amount !== null && order.total_amount !== undefined && order.total_amount !== '') {
                const numAmount = parseFloat(order.total_amount);
                if (!isNaN(numAmount)) {
                    amount = numAmount;
                }
            }
            
            row.innerHTML = `
                <td>${order.id}</td>
                <td>
                    <div class="user-info">
                        <span class="user-name">${order.customer_name || order.customer || 'Unknown'}</span>
                        <span class="user-email">${order.customer_contact || ''}</span>
                    </div>
                </td>
                <td><span class="status-badge status-${statusClass}">${order.status}</span></td>
                <td class="date-text">${order.date}</td>
                <td>₱${amount.toFixed(2)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-secondary viewOrderBtn" data-id="${order.id}" title="View Order">
                            <span class="material-icons">visibility</span>
                        </button>
                        <button class="btn btn-sm btn-secondary editOrderBtn" data-id="${order.id}" title="Edit Order">
                            <span class="material-icons">edit</span>
                        </button>
                        <button class="btn btn-sm btn-danger deleteOrderBtn" data-id="${order.id}" title="Delete Order">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });

        // Add event listeners to action buttons
        this.setupActionButtons();
    }

    setupActionButtons() {
        // View buttons
        document.querySelectorAll('.viewOrderBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.currentTarget.dataset.id;
                console.log('View button clicked, orderId from dataset:', orderId, 'type:', typeof orderId);
                await this.viewOrder(orderId);
            });
        });

        // Edit buttons
        document.querySelectorAll('.editOrderBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                console.log('Edit button clicked, orderId from dataset:', orderId, 'type:', typeof orderId);
                this.openOrderModal(orderId);
            });
        });

        // Delete buttons
        document.querySelectorAll('.deleteOrderBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                console.log('Delete button clicked, orderId from dataset:', orderId, 'type:', typeof orderId);
                this.deleteOrder(orderId);
            });
        });
    }

    async viewOrder(orderId) {
        console.log('Viewing order:', orderId, 'type:', typeof orderId);
        console.log('Available orders:', this.orders.map(o => ({ id: o.id, type: typeof o.id })));
        
        // Try to find order with flexible matching
        let order = this.orders.find(o => o.id == orderId); // Use loose equality
        
        if (!order) {
            // Try converting to number if it's a string
            const numericId = parseInt(orderId);
            if (!isNaN(numericId)) {
                order = this.orders.find(o => o.id == numericId);
            }
        }
        
        if (!order) {
            // Try converting to string if it's a number
            const stringId = orderId.toString();
            order = this.orders.find(o => o.id.toString() === stringId);
        }
        
        if (!order) {
            console.error('Order not found:', orderId);
            console.error('Available order IDs:', this.orders.map(o => o.id));
            showNotification(`Order not found: ${orderId}`, 'error');
            return;
        }
        
        console.log('Found order:', order);

        const modal = document.getElementById('orderDetailsModal');
        const content = document.getElementById('orderDetailsContent');

        // Safe amount formatting
        let amount = 0;
        if (order.total_amount !== null && order.total_amount !== undefined && order.total_amount !== '') {
            const numAmount = parseFloat(order.total_amount);
            if (!isNaN(numAmount)) {
                amount = numAmount;
            }
        }

        // Calculate tax and total with tax for header
        let tax = amount * 0.12;
        let totalWithTax = amount + tax;

        // Populate modal content
        document.getElementById('detailOrderId').textContent = order.id;
        document.getElementById('detailStatusBadge').textContent = order.status;
        document.getElementById('detailStatusBadge').className = `order-status-badge ${order.status.toLowerCase()}`;
        document.getElementById('detailDate').textContent = order.date;
        document.getElementById('detailCustomer').textContent = order.customer_name || order.customer || 'Unknown';
        document.getElementById('detailCustomerContact').textContent = order.customer_contact || 'Not provided';
        // Set Order Amount with Tax in header
        const elDetailAmountWithTax = document.getElementById('detailAmountWithTax');
        if (elDetailAmountWithTax) {
            elDetailAmountWithTax.textContent = `₱${totalWithTax.toFixed(2)}`;
        }

        // Populate notes field
        const notesTextarea = document.getElementById('orderDetailsNotes');
        if (notesTextarea) {
            notesTextarea.value = order.notes || '';
        }

        // Set current status in the update status select
        const statusSelect = document.getElementById('updateStatusSelect');
        if (statusSelect) {
            statusSelect.value = order.status;
        }

        // Load order items
        await this.loadOrderItems(orderId);

        // Set current order ID for actions
        modal.dataset.orderId = orderId;

        // Show modal
        modal.style.display = 'block';
    }

    async loadOrderItems(orderId) {
        try {
            const response = await fetch(`backend/orders.php?action=get_items&order_id=${orderId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                this.renderOrderItems(data.items);
                // Calculate and render order summary
                const summaryDiv = document.getElementById('orderSummaryDynamic');
                if (summaryDiv) {
                    let totalItems = 0;
                    let subtotal = 0;
                    (data.items || []).forEach(item => {
                        totalItems += parseInt(item.quantity) || 0;
                        subtotal += parseFloat(item.total_price) || 0;
                    });
                    const tax = subtotal * 0.12; // 12% VAT
                    const totalAmount = subtotal + tax;
                    summaryDiv.innerHTML = `
                        <table style="width:100%; border-collapse:collapse;">
                            <tr><td>Total Items:</td><td style="text-align:right;">${totalItems}</td></tr>
                            <tr><td>Subtotal:</td><td style="text-align:right;">₱${subtotal.toFixed(2)}</td></tr>
                            <tr><td>Tax (12%):</td><td style="text-align:right;">₱${tax.toFixed(2)}</td></tr>
                            <tr style="font-weight:bold;"><td>Total Amount:</td><td style="text-align:right;">₱${totalAmount.toFixed(2)}</td></tr>
                        </table>
                    `;
                }
            } else {
                console.error('Failed to load order items:', data.error);
                this.renderOrderItems([]);
            }
        } catch (error) {
            console.error('Error loading order items:', error);
            this.renderOrderItems([]);
        }
    }

    async loadOrderItemsForEditing(orderId) {
        try {
            const response = await fetch(`backend/orders.php?action=get_items&order_id=${orderId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                this.renderOrderItemsForEditing(data.items);
            } else {
                console.error('Failed to load order items for editing:', data.error);
                this.resetOrderItems();
            }
        } catch (error) {
            console.error('Error loading order items for editing:', error);
            this.resetOrderItems();
        }
    }

    renderOrderItemsForEditing(items) {
        console.log('DEBUG: renderOrderItemsForEditing items:', items);
        const container = document.getElementById('orderItems');
        if (!container) return;
        container.innerHTML = '';
        if (items.length === 0) {
            // Do not add a row here; resetOrderItems will handle it
            return;
        }
        items.forEach(item => {
            console.log('DEBUG: item:', item);
            const row = document.createElement('div');
            row.className = 'order-item-row';
            // Show product name as text and a Change Product button
            let label;
            const product = this.products.find(p => p.id == item.product_id);
            if (product) {
                const priceNum = typeof product.price === 'number' ? product.price : parseFloat(product.price);
                const stockNum = typeof product.stock === 'number' ? product.stock : parseInt(product.stock);
                label = `${product.name} (Stock: ${stockNum}) - ₱${priceNum.toFixed(2)}`;
            } else {
                label = item.product_name ? item.product_name : `Product ID ${item.product_id} (No longer in inventory)`;
            }
            row.innerHTML = `
                <span class="product-name-static" style="font-weight: 500;">${label}</span>
                <button type="button" class="btn btn-sm btn-secondary change-product-btn" title="Change Product" style="margin-left:8px; vertical-align:middle;">
                    <span class="material-icons">edit</span>
                </button>
                <select class="product-select" style="display:none;"></select>
                <input type="number" class="quantity-input" min="1" placeholder="Qty" required value="${item.quantity}">
                <span class="unit-price">₱${parseFloat(item.unit_price).toFixed(2)}</span>
                <span class="line-total">₱${(parseFloat(item.unit_price) * parseInt(item.quantity)).toFixed(2)}</span>
                <button type="button" class="remove-item-btn" title="Remove item">×</button>
            `;
            container.appendChild(row);
            const productNameSpan = row.querySelector('.product-name-static');
            const changeBtn = row.querySelector('.change-product-btn');
            const select = row.querySelector('.product-select');
            const quantityInput = row.querySelector('.quantity-input');
            const removeBtn = row.querySelector('.remove-item-btn');
            // Prepare dropdown but keep hidden
            this.populateProductSelect(select, item.product_id, label);
            select.value = String(item.product_id);
            quantityInput.value = item.quantity;
            // Set correct price and total for editing
            row.querySelector('.unit-price').textContent = `₱${parseFloat(item.unit_price).toFixed(2)}`;
            row.querySelector('.line-total').textContent = `₱${(parseFloat(item.unit_price) * parseInt(item.quantity)).toFixed(2)}`;
            // Change Product button logic
            changeBtn.addEventListener('click', () => {
                productNameSpan.style.display = 'none';
                changeBtn.style.display = 'none';
                select.style.display = '';
                select.disabled = false;
                select.focus();
                this.refreshAllProductSelects(); // Ensure all selects are refreshed when changing product
            });
            select.addEventListener('change', (e) => {
                this.updateProductPrice(e.target);
                this.refreshAllProductSelects();
            });
            quantityInput.addEventListener('input', (e) => {
                this.updateLineTotal(e.target);
            });
            removeBtn.addEventListener('click', () => {
                row.remove();
                this.updateOrderTotal();
                this.refreshAllProductSelects();
            });
        });
        // Ensure all event listeners are set up for all rows (in case of dynamic changes)
        container.querySelectorAll('.quantity-input').forEach(input => {
            input.removeEventListener('input', this._editingQtyListener);
            input.addEventListener('input', this._editingQtyListener = (e) => {
                this.updateLineTotal(e.target);
            });
        });
        container.querySelectorAll('.product-select').forEach(select => {
            select.removeEventListener('change', this._editingSelectListener);
            select.addEventListener('change', this._editingSelectListener = (e) => {
                this.updateProductPrice(e.target);
            });
        });
        this.updateOrderTotal();
        this.refreshAllProductSelects();
    }

    renderOrderItems(items) {
        console.log('Rendering order items:', items); // DEBUG
        const tbody = document.getElementById('orderItemsDetail');
        if (!tbody) {
            showNotification('Order items table body not found in modal. Please check your HTML.', 'error');
            console.error('Order items table body not found: #orderItemsDetail');
            return;
        }
        tbody.innerHTML = '';

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280;">No items found</td></tr>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            const stockStatus = this.getStockStatus(item.stock_level);
            
            row.innerHTML = `
                <td>${item.product_name}</td>
                <td>${item.quantity}</td>
                <td>₱${parseFloat(item.unit_price).toFixed(2)}</td>
                <td>₱${parseFloat(item.total_price).toFixed(2)}</td>
                <td><span class="stock-status ${stockStatus.class}">${stockStatus.text}</span></td>
            `;
            
            tbody.appendChild(row);
        });
    }

    getStockStatus(stockLevel) {
        if (stockLevel === 0) {
            return { text: 'Out of Stock', class: 'out-of-stock' };
        } else if (stockLevel <= 10) {
            return { text: 'Low Stock', class: 'low-stock' };
        } else {
            return { text: 'In Stock', class: 'in-stock' };
        }
    }

    async openOrderModal(orderId = null) {
        console.log('openOrderModal called, orderId:', orderId);
        // Always load products before showing the modal
        await this.loadProducts();
        const modal = document.getElementById('orderModal');
        const form = document.getElementById('createOrderForm');
        const title = document.querySelector('#orderModal h2');
        const submitBtn = form.querySelector('button[type="submit"]');

        if (orderId) {
            // Edit mode
            console.log('Edit mode for order:', orderId);
            let order = this.orders.find(o => o.id == orderId); // Use loose equality
            if (!order) {
                const numericId = parseInt(orderId);
                if (!isNaN(numericId)) {
                    order = this.orders.find(o => o.id == numericId);
                }
            }
            if (!order) {
                const stringId = orderId.toString();
                order = this.orders.find(o => o.id.toString() === stringId);
            }
            if (order) {
                title.textContent = 'Edit Order';
                if (submitBtn) submitBtn.textContent = 'Update Order';
                document.getElementById('orderCustomer').value = order.customer_name || '';
                document.getElementById('orderCustomerContact').value = order.customer_contact || '';
                document.getElementById('orderStatus').value = order.status;
                document.getElementById('orderNotes').value = order.notes || '';
                modal.dataset.editingOrderId = orderId;
                const items = await this.fetchOrderItemsForEditing(orderId);
                this.renderOrderItemsForEditing(items);
                // Force validation after rendering for edit
                if (typeof this._validateStock === 'function') {
                    this._validateStock();
                } else if (typeof window.validateStock === 'function') {
                    window.validateStock();
                }
            } else {
                console.error('Order not found for editing:', orderId);
                console.error('Available order IDs:', this.orders.map(o => o.id));
                showNotification(`Order not found for editing: ${orderId}`, 'error');
                return;
            }
        } else {
            // Add mode
            title.textContent = 'Create New Order';
            if (submitBtn) submitBtn.textContent = 'Create Order';
            form.reset();
            modal.dataset.editingOrderId = '';
            this.resetOrderItems();
            this.setupProductSelection(); // Ensure selects are populated and listeners attached
            if (typeof this._validateStock === 'function') {
                this._validateStock();
            }
            console.log('openOrderModal called, add mode');
        }
        modal.style.display = 'block';
    }

    // Helper to fetch order items for editing and return them
    async fetchOrderItemsForEditing(orderId) {
        try {
            const response = await fetch(`backend/orders.php?action=get_items&order_id=${orderId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.success) {
                return data.items;
            } else {
                console.error('Failed to load order items for editing:', data.error);
                return [];
            }
        } catch (error) {
            console.error('Error loading order items for editing:', error);
            return [];
        }
    }

    setupOrderModal() {
        const modal = document.getElementById('orderModal');
        const closeBtn = document.getElementById('closeOrderModal');
        const cancelBtn = document.getElementById('cancelOrderModal');
        const form = document.getElementById('createOrderForm');
        const createBtn = document.getElementById('createOrderBtn');
        // Validate stock before enabling create button
        const validateStock = () => {
            let valid = true;
            let hasProduct = false;
            // Sum quantities for each product across all rows
            const productQuantities = {};
            document.querySelectorAll('.order-item-row').forEach(row => {
                // Always get the product id from the select, even if hidden
                let select = row.querySelector('.product-select');
                let productId = select.value;
                let quantityInput = row.querySelector('.quantity-input');
                let quantity = parseInt(quantityInput.value) || 0;
                // Check for static product name (edit mode)
                let hasStaticProduct = !!row.querySelector('.product-name-static');
                if ((hasStaticProduct && quantity > 0) || (productId && quantity > 0)) {
                    hasProduct = true;
                    if (productId && quantity > 0) {
                        if (!productQuantities[productId]) productQuantities[productId] = 0;
                        productQuantities[productId] += quantity;
                    }
                }
            });
            // Now check each row for overstock
            document.querySelectorAll('.order-item-row').forEach(row => {
                let select = row.querySelector('.product-select');
                let productId = select.value;
                let quantityInput = row.querySelector('.quantity-input');
                let warningSpan = row.querySelector('.stock-warning-inline');
                if (!warningSpan) {
                    warningSpan = document.createElement('span');
                    warningSpan.className = 'stock-warning-inline';
                    warningSpan.style.color = 'red';
                    warningSpan.style.fontSize = '0.9em';
                    warningSpan.style.display = 'block';
                    warningSpan.style.marginTop = '2px';
                    quantityInput.parentNode.insertBefore(warningSpan, quantityInput.nextSibling);
                }
                warningSpan.textContent = '';
                if (productId && quantityInput.value) {
                    const product = this.products.find(p => p.id == productId);
                    if (product) {
                        const stockNum = typeof product.stock === 'number' ? product.stock : parseInt(product.stock);
                        const totalRequested = productQuantities[productId] || 0;
                        if (totalRequested > stockNum) {
                            warningSpan.textContent = `Max available: ${stockNum} (requested: ${totalRequested})`;
                            valid = false;
                        }
                    }
                }
            });
            // Also check required fields
            const customerName = document.getElementById('orderCustomer').value;
            const status = document.getElementById('orderStatus').value;
            if (!customerName || !status || !hasProduct) valid = false;
            // Debug log
            const createBtn = document.getElementById('createOrderBtn') || document.querySelector('#createOrderForm button[type="submit"]');
        };
        // Expose for debugging
        this._validateStock = validateStock;
        // Attach validation to all relevant events (only once)
        if (!form._validationAttached) {
            // Validate on any input or change in the form
            form.querySelectorAll('input, select, textarea').forEach(el => {
                el.addEventListener('input', validateStock);
                el.addEventListener('change', validateStock);
            });
            form._validationAttached = true;
        }
        // Initial validation
        setTimeout(validateStock, 100);
        // Remove any previous submit event listeners before adding a new one
        if (form._submitHandler) {
            form.removeEventListener('submit', form._submitHandler);
        }
        form._submitHandler = (e) => {
            e.preventDefault();
            validateStock();
            if (createBtn && createBtn.disabled) {
                return false;
            }
            this.saveOrder();
            return false;
        };
        form.addEventListener('submit', form._submitHandler);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        if (cancelBtn) {
            cancelBtn.onclick = () => { modal.style.display = 'none'; };
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
    }

    setupOrderDetailsModal() {
        const modal = document.getElementById('orderDetailsModal');
        const closeBtn = document.getElementById('closeOrderDetailsModal');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }

        // Setup order details modal actions
        this.setupOrderDetailsActions();
    }

    setupOrderDetailsActions() {
        // Update status button
        const updateStatusBtn = document.getElementById('updateStatusBtn');
        if (updateStatusBtn) {
            updateStatusBtn.addEventListener('click', () => {
                this.updateOrderStatus();
            });
        }

        // Save notes button
        const saveNotesBtn = document.getElementById('saveNotesBtn');
        if (saveNotesBtn) {
            saveNotesBtn.addEventListener('click', () => {
                this.saveOrderNotes();
            });
        }

        // Edit order button
        const editOrderBtn = document.getElementById('editOrderBtn');
        if (editOrderBtn) {
            editOrderBtn.addEventListener('click', () => {
                this.editOrderFromDetails();
            });
        }

        // Delete order button
        const deleteOrderBtn = document.getElementById('deleteOrderBtn');
        if (deleteOrderBtn) {
            deleteOrderBtn.addEventListener('click', () => {
                this.deleteOrderFromDetails();
            });
        }
    }

    async updateOrderStatus() {
        const modal = document.getElementById('orderDetailsModal');
        const orderId = modal.dataset.orderId;
        const statusSelect = document.getElementById('updateStatusSelect');
        
        if (!orderId || !statusSelect) {
            showNotification('Error: Order ID or status not found', 'error');
            return;
        }

        const newStatus = statusSelect.value;
        
        if (!newStatus) {
            showNotification('Please select a status', 'error');
            return;
        }
        
        try {
            const response = await fetch('backend/orders.php', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: parseInt(orderId),
                    status: newStatus
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Order status updated successfully!', 'success');
                // Update the status badge in the modal
                const statusBadge = document.getElementById('detailStatusBadge');
                if (statusBadge) {
                    statusBadge.textContent = newStatus;
                    statusBadge.className = `order-status-badge ${newStatus.toLowerCase()}`;
                }
                
                // Refresh orders list
                await this.loadOrders();
                this.updateStatistics();
                this.renderOrders();
            } else {
                showNotification('Failed to update status: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error updating order status:', error);
            showNotification('Failed to update order status: ' + error.message, 'error');
        }
    }

    async saveOrderNotes() {
        const modal = document.getElementById('orderDetailsModal');
        const orderId = modal.dataset.orderId;
        const notesTextarea = document.getElementById('orderDetailsNotes');
        
        if (!orderId || !notesTextarea) {
            showNotification('Error: Order ID or notes field not found', 'error');
            return;
        }

        const notes = notesTextarea.value;
        
        try {
            const response = await fetch('backend/orders.php', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `id=${orderId}&notes=${encodeURIComponent(notes)}`
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Order notes saved successfully!', 'success');
            } else {
                showNotification('Failed to save notes: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error saving order notes:', error);
            showNotification('Failed to save order notes. Please try again.', 'error');
        }
    }

    editOrderFromDetails() {
        const modal = document.getElementById('orderDetailsModal');
        const orderId = modal.dataset.orderId;
        
        if (orderId) {
            modal.style.display = 'none';
            this.openOrderModal(parseInt(orderId));
        }
    }

    deleteOrderFromDetails() {
        const modal = document.getElementById('orderDetailsModal');
        const orderId = modal.dataset.orderId;
        
        if (orderId) {
            modal.style.display = 'none';
            this.deleteOrder(parseInt(orderId));
        }
    }

    setupProductSelection() {
        console.log('Setting up product selection...');
        console.log('Products available:', this.products.length);
        
        // Populate product selects
        const productSelects = document.querySelectorAll('.product-select');
        console.log('Found product selects:', productSelects.length);
        
        productSelects.forEach((select, index) => {
            console.log(`Populating product select ${index + 1}:`, select);
            this.populateProductSelect(select);
        });

        // Add event listeners for quantity changes
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateLineTotal(e.target);
            });
        });

        // Add event listeners for product selection
        document.querySelectorAll('.product-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.updateProductPrice(e.target);
            });
        });
        
        console.log('Product selection setup complete');
    }

    populateProductSelect(select, originalProductId = null, originalProductName = null) {
        select.innerHTML = '';
        // Get all selected product IDs in other rows
        const allSelects = Array.from(document.querySelectorAll('.product-select'));
        const otherSelectedIds = allSelects
            .filter(s => s !== select)
            .map(s => s.value)
            .filter(val => val && val !== originalProductId);

        // Always add a single 'Select Product' option at the top
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Product';
        defaultOption.selected = !select.value;
        defaultOption.disabled = true;
        select.appendChild(defaultOption);

        // If editing and the current value is NOT in the product list, add 'Current: ...' option
        let foundInInventory = false;
        if (originalProductId && originalProductName) {
            foundInInventory = this.products.some(p => String(p.id) === String(originalProductId));
            if (!foundInInventory) {
                const origOption = document.createElement('option');
                origOption.value = String(originalProductId);
                origOption.textContent = `Current: ${originalProductName}`;
                origOption.selected = true;
                origOption.disabled = true;
                select.appendChild(origOption);
            }
        }

        if (this.products.length === 0) {
            const noProductsOption = document.createElement('option');
            noProductsOption.value = '';
            noProductsOption.textContent = 'No products available';
            select.appendChild(noProductsOption);
            return;
        }
        this.products.forEach(product => {
            // Don't duplicate the original product as an option if it's not in inventory
            if (originalProductId && !foundInInventory && String(product.id) === String(originalProductId)) return;
            const option = document.createElement('option');
            option.value = String(product.id);
            const priceNum = typeof product.price === 'number' ? product.price : parseFloat(product.price);
            const stockNum = typeof product.stock === 'number' ? product.stock : parseInt(product.stock);
            // Compose label with stock only (removed supplier name)
            let label = `${product.name} (Stock: ${stockNum}) - ₱${priceNum.toFixed(2)}`;
            option.textContent = label;
            option.dataset.price = priceNum;
            option.dataset.stock = stockNum;
            // Disable if already selected in another row
            if (otherSelectedIds.includes(String(product.id))) {
                option.disabled = true;
            }
            // Mark as selected if this is the current value
            if (select.value && String(product.id) === select.value) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    updateProductPrice(select) {
        const row = select.closest('.order-item-row');
        const unitPriceSpan = row.querySelector('.unit-price');
        const quantityInput = row.querySelector('.quantity-input');
        let warningSpan = row.querySelector('.stock-warning-inline');
        if (!warningSpan) {
            warningSpan = document.createElement('span');
            warningSpan.className = 'stock-warning-inline';
            warningSpan.style.color = 'red';
            warningSpan.style.fontSize = '0.9em';
            warningSpan.style.display = 'block';
            warningSpan.style.marginTop = '2px';
            quantityInput.parentNode.insertBefore(warningSpan, quantityInput.nextSibling);
        }
        warningSpan.textContent = '';
        if (select.value) {
            const product = this.products.find(p => p.id == select.value);
            console.log('updateProductPrice: product', product);
            if (product) {
                const priceNum = typeof product.price === 'number' ? product.price : parseFloat(product.price);
                const stockNum = typeof product.stock === 'number' ? product.stock : parseInt(product.stock);
                unitPriceSpan.textContent = !isNaN(priceNum) ? `₱${priceNum.toFixed(2)}` : '₱0.00';
                if (quantityInput) {
                    quantityInput.max = !isNaN(stockNum) ? stockNum : '';
                    quantityInput.title = !isNaN(stockNum) ? `Max: ${stockNum}` : '';
                    if (parseInt(quantityInput.value) > stockNum) {
                        warningSpan.textContent = `Max available: ${stockNum}`;
                    }
                }
                this.updateLineTotal(quantityInput);
            } else {
                unitPriceSpan.textContent = '₱0.00';
                if (quantityInput) {
                    quantityInput.removeAttribute('max');
                    quantityInput.title = '';
                }
                this.updateLineTotal(quantityInput);
            }
        } else {
            unitPriceSpan.textContent = '₱0.00';
            row.querySelector('.line-total').textContent = '₱0.00';
            if (quantityInput) {
                quantityInput.removeAttribute('max');
                quantityInput.title = '';
            }
        }
        this.updateOrderTotal();
    }

    updateLineTotal(quantityInput) {
        const row = quantityInput.closest('.order-item-row');
        const unitPriceSpan = row.querySelector('.unit-price');
        const lineTotalSpan = row.querySelector('.line-total');
        const select = row.querySelector('.product-select');
        let warningSpan = row.querySelector('.stock-warning-inline');
        if (!warningSpan) {
            warningSpan = document.createElement('span');
            warningSpan.className = 'stock-warning-inline';
            warningSpan.style.color = 'red';
            warningSpan.style.fontSize = '0.9em';
            warningSpan.style.display = 'block';
            warningSpan.style.marginTop = '2px';
            quantityInput.parentNode.insertBefore(warningSpan, quantityInput.nextSibling);
        }
        warningSpan.textContent = '';
        if (select.value) {
            const product = this.products.find(p => p.id == select.value);
            console.log('updateLineTotal: product', product);
            if (product) {
                const priceNum = typeof product.price === 'number' ? product.price : parseFloat(product.price);
                const stockNum = typeof product.stock === 'number' ? product.stock : parseInt(product.stock);
                const quantity = parseInt(quantityInput.value) || 0;
                const total = (!isNaN(quantity) && !isNaN(priceNum)) ? quantity * priceNum : 0;
                console.log('updateLineTotal: priceNum', priceNum, 'quantity', quantity, 'total', total);
                lineTotalSpan.textContent = `₱${total.toFixed(2)}`;
                if (quantity > stockNum) {
                    warningSpan.textContent = `Max available: ${stockNum}`;
                }
            } else {
                lineTotalSpan.textContent = '₱0.00';
            }
        } else {
            lineTotalSpan.textContent = '₱0.00';
        }
        this.updateOrderTotal();
    }

    updateOrderTotal() {
        const lineTotals = document.querySelectorAll('.line-total');
        let total = 0;
        lineTotals.forEach(span => {
            const amount = parseFloat(span.textContent.replace('₱', '')) || 0;
            total += amount;
        });
        console.log('updateOrderTotal: total', total);
        document.getElementById('orderTotalAmount').textContent = `₱${total.toFixed(2)}`;
    }

    refreshAllProductSelects() {
        const selects = document.querySelectorAll('.product-select');
        selects.forEach(select => {
            const currentValue = select.value;
            this.populateProductSelect(select, currentValue, select.options[select.selectedIndex]?.textContent);
            select.value = currentValue;
        });
    }

    addProductRow() {
        console.log('addProductRow called');
        const container = document.getElementById('orderItems');
        // Collect already selected product IDs
        const selectedProductIds = Array.from(container.querySelectorAll('.product-select'))
            .map(select => select.value)
            .filter(val => val);

        // If all products are already selected, prevent adding more
        if (this.products && selectedProductIds.length >= this.products.length) {
            showNotification('All products are already added to the order.', 'error');
            return;
        }

        const newRow = document.createElement('div');
        newRow.className = 'order-item-row';

        // Create select
        const select = document.createElement('select');
        select.className = 'product-select';
        select.required = true;
        this.populateProductSelect(select);
        // Remove already selected options
        selectedProductIds.forEach(id => {
            const option = select.querySelector(`option[value="${id}"]`);
            if (option) option.disabled = true;
        });

        // Create quantity input
        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.className = 'quantity-input';
        quantityInput.min = 1;
        quantityInput.placeholder = 'Qty';
        quantityInput.required = true;

        // Create unit price span
        const unitPriceSpan = document.createElement('span');
        unitPriceSpan.className = 'unit-price';
        unitPriceSpan.textContent = '₱0.00';

        // Create line total span
        const lineTotalSpan = document.createElement('span');
        lineTotalSpan.className = 'line-total';
        lineTotalSpan.textContent = '₱0.00';

        // Create remove button
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-item-btn';
        removeBtn.title = 'Remove item';
        removeBtn.textContent = '×';

        // Append all elements to the row
        newRow.appendChild(select);
        newRow.appendChild(quantityInput);
        newRow.appendChild(unitPriceSpan);
        newRow.appendChild(lineTotalSpan);
        newRow.appendChild(removeBtn);

        container.appendChild(newRow);

        // Event listeners
        select.addEventListener('change', (e) => {
            this.updateProductPrice(e.target);
            this.refreshAllProductSelects(); // Refresh all selects after change
        });
        quantityInput.addEventListener('input', (e) => {
            this.updateLineTotal(e.target);
        });
        removeBtn.addEventListener('click', () => {
            newRow.remove();
            this.updateOrderTotal();
            this.refreshAllProductSelects(); // Refresh all selects after removal
        });
        // Refresh all selects after adding a new row
        this.refreshAllProductSelects();
        if (typeof this._validateStock === 'function') {
            this._validateStock(); // Trigger validation after adding a row
        }
    }

    resetOrderItems() {
        const container = document.getElementById('orderItems');
        // Defensive: Remove all children
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        this.addProductRow();
        console.log('resetOrderItems called, should be only one row now');
    }

    async saveOrder() {
        const form = document.getElementById('createOrderForm');
        const modal = document.getElementById('orderModal');
        const customerName = document.getElementById('orderCustomer').value;
        const customerContact = document.getElementById('orderCustomerContact').value;
        const status = document.getElementById('orderStatus').value;
        const notes = document.getElementById('orderNotes').value;
        
        // Check if we're editing an existing order
        const editingOrderId = modal.dataset.editingOrderId;
        const isEditing = editingOrderId && editingOrderId !== '';
        
        // Validate required fields
        if (!customerName || !status) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        // Collect order items
        const orderItems = [];
        let totalAmount = 0;
        document.querySelectorAll('.order-item-row').forEach(row => {
            const select = row.querySelector('.product-select');
            const quantityInput = row.querySelector('.quantity-input');
            const quantity = parseInt(quantityInput.value);
            const hasStaticProduct = !!row.querySelector('.product-name-static');
            let supplierProductId = select.value;
            let unitPrice = 0;
            // If select is hidden and static product is present, get supplierProductId from data attribute or fallback
            if (hasStaticProduct && (!select.value || select.style.display === 'none')) {
                const label = row.querySelector('.product-name-static').textContent;
                const name = label.split(' (')[0];
                const found = this.products.find(p => p.name === name);
                if (found) supplierProductId = found.id;
            }
            // Defensive: skip if missing product or invalid quantity
            if (!supplierProductId || isNaN(quantity) || quantity <= 0) return;
            const product = this.products.find(p => p.id == supplierProductId);
            if (product) {
                unitPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price);
            } else if (row.querySelector('.unit-price')) {
                const priceText = row.querySelector('.unit-price').textContent.replace(/[^\d.]/g, '');
                unitPrice = parseFloat(priceText) || 0;
            }
            if (isNaN(unitPrice) || unitPrice <= 0) return; // Prevent NaN or invalid
            const totalPrice = quantity * unitPrice;
            orderItems.push({
                supplier_product_id: parseInt(supplierProductId),
                quantity: quantity,
                unit_price: unitPrice,
                total_price: totalPrice
            });
            totalAmount += totalPrice;
        });
        if (orderItems.length === 0) {
            showNotification('Please add at least one valid product to the order', 'error');
            return;
        }
        const orderData = {
            customer_name: customerName,
            customer_contact: customerContact,
            status: status,
            notes: notes,
            total_amount: totalAmount,
            order_items: orderItems,
            date: new Date().toISOString().split('T')[0]
        };
        try {
            let response;
            if (isEditing) {
                orderData.id = editingOrderId;
                response = await fetch('backend/orders.php', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(orderData)
                });
            } else {
                response = await fetch('backend/orders.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(orderData)
                });
            }
            const data = await response.json();
            if (data.success) {
                const action = isEditing ? 'updated' : 'created';
                showNotification(`Order ${action} successfully!`, 'success');
                document.getElementById('orderModal').style.display = 'none';
                modal.dataset.editingOrderId = '';
                await this.loadOrders();
                this.updateStatistics();
                this.renderOrders();
                await this.loadProducts(); // Always reload products from backend after order
                this.setupProductSelection();
                // Refresh inventory stats if on inventory page
                if (typeof window.fetchInventory === 'function') window.fetchInventory();
            } else {
                const action = isEditing ? 'update' : 'create';
                showNotification(`Failed to ${action} order: ` + data.error, 'error');
            }
        } catch (error) {
            showNotification('Failed to save order. Please try again.', 'error');
        }
    }

    async deleteOrder(orderId) {
        if (!confirm('Are you sure you want to delete this order?')) {
            return;
        }
        
        console.log('Deleting order:', orderId, 'type:', typeof orderId);
        
        try {
            const response = await fetch('backend/orders.php', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `id=${orderId}`
            });
            
            console.log('Delete response status:', response.status);
            
            const data = await response.json();
            console.log('Delete response data:', data);
            
            if (data.success) {
                showNotification('Order deleted successfully!', 'success');
                await this.loadOrders();
                this.updateStatistics();
                this.renderOrders();
            } else {
                showNotification('Failed to delete order: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting order:', error);
            showNotification('Failed to delete order. Please try again.', 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (document.body.classList.contains('orders-page') || window.location.pathname.includes('orders.html')) {
        const orderManager = new OrderManager();
        orderManager.init();
    }
});