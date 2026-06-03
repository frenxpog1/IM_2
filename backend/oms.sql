-- Database: oms

-- Drop tables in order to avoid foreign key issues
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS users;

-- Users table
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role TINYINT NOT NULL, -- 1=admin, 2=staff, 3=supplier
  email VARCHAR(100),
  full_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to users table if upgrading from an old schema
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(100),
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Suppliers table
CREATE TABLE suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(50),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(50) DEFAULT 'Philippines',
  website VARCHAR(200),
  tax_id VARCHAR(50),
  payment_terms VARCHAR(100) DEFAULT 'Net 30',
  status ENUM('Active', 'Inactive', 'Suspended') DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Purchase Orders table
CREATE TABLE purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id INT NOT NULL,
  order_date DATE NOT NULL,
  expected_delivery DATE,
  status ENUM('Draft', 'Sent', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled') DEFAULT 'Draft',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(10,2) DEFAULT 0.00,
  tax_amount DECIMAL(10,2) DEFAULT 0.00,
  tax_rate DECIMAL(5,4) DEFAULT 0.00,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Purchase Order Items table
CREATE TABLE purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  description TEXT,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  received_quantity INT DEFAULT 0,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

-- Supplier Products table (what products each supplier can provide)
CREATE TABLE supplier_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  description TEXT,
  unit_price DECIMAL(10,2) NOT NULL,
  min_order_quantity INT DEFAULT 1,
  lead_time_days INT DEFAULT 7,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

-- Inventory table
DROP TABLE IF EXISTS inventory;
CREATE TABLE inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  FOREIGN KEY (supplier_product_id) REFERENCES supplier_products(id) ON DELETE CASCADE
);

-- Stock Requests table (for restock workflow)
CREATE TABLE IF NOT EXISTS stock_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    supplier_id INT NOT NULL,
    requested_by INT NOT NULL,
    quantity_requested INT NOT NULL,
    reason TEXT,
    status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
    supplier_response TEXT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    FOREIGN KEY (product_id) REFERENCES supplier_products(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Orders table
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_contact VARCHAR(100),
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notes TEXT
);

-- Order items table
DROP TABLE IF EXISTS order_items;
CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  supplier_product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_product_id) REFERENCES supplier_products(id) ON DELETE CASCADE
);

-- Login Report table
CREATE TABLE IF NOT EXISTS login_report (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(10), -- 'success' or 'fail'
  ip_address VARCHAR(45),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sample admin user (password: admin)
INSERT INTO users (username, password, role, email, full_name, status, notes) VALUES (
  'admin',
  '$2y$10$wH6QwQwQwQwQwQwQwQwQwOQwQwQwQwQwQwQwQwQwQwQwQwQwQW',
  1,
  'admin@example.com',
  'Administrator',
  'active',
  'System admin'
);

-- =============================
-- SAMPLE DATA INSERTS (RUN AFTER SCHEMA)
-- =============================

-- STEP 1: SUPPLIERS TABLE (Run this first - MANDATORY)
INSERT INTO suppliers (name, contact_person, email, phone, address, city, state, postal_code, country, website, tax_id, payment_terms, status, notes) VALUES
('ABC Electronics Corp', 'John Santos', 'john@abcelectronics.com', '+63-2-1234-5678', '123 Technology Ave', 'Makati', 'Metro Manila', '1200', 'Philippines', 'www.abcelectronics.com', 'TIN-123456789', 'Net 30', 'Active', 'Reliable electronics supplier'),
('Manila Office Supplies', 'Maria Cruz', 'maria@manilasupplies.ph', '+63-2-9876-5432', '456 Business St', 'Quezon City', 'Metro Manila', '1100', 'Philippines', 'www.manilasupplies.ph', 'TIN-987654321', 'Net 15', 'Active', 'Local office supplies provider'),
('Cebu Food Distributors', 'Pedro Reyes', 'pedro@cebufood.com', '+63-32-123-4567', '789 Market Rd', 'Cebu City', 'Cebu', '6000', 'Philippines', 'www.cebufood.com', 'TIN-456789123', 'Net 30', 'Active', 'Fresh food and beverages'),
('Davao Agricultural Co.', 'Ana Garcia', 'ana@davaoagri.ph', '+63-82-234-5678', '321 Farm Lane', 'Davao City', 'Davao del Sur', '8000', 'Philippines', 'www.davaoagri.ph', 'TIN-789123456', 'Net 45', 'Active', 'Agricultural products and supplies'),
('Iloilo Textile Mills', 'Carlos Mendoza', 'carlos@iloilotextile.com', '+63-33-345-6789', '654 Industrial Blvd', 'Iloilo City', 'Iloilo', '5000', 'Philippines', 'www.iloilotextile.com', 'TIN-321654987', 'Net 30', 'Inactive', 'Textile and fabric supplier');

-- STEP 2: PURCHASE ORDERS TABLE (Run ONLY after suppliers are inserted)
INSERT INTO purchase_orders (po_number, supplier_id, order_date, expected_delivery, status, total_amount, notes, created_by) VALUES
('PO-2024-001', 1, '2024-01-15', '2024-01-30', 'Delivered', 25000.00, 'Urgent order for new laptops', NULL),
('PO-2024-002', 2, '2024-01-20', '2024-02-05', 'Confirmed', 8500.00, 'Monthly office supplies restocking', NULL),
('PO-2024-003', 3, '2024-01-25', '2024-02-10', 'Shipped', 15000.00, 'Food items for company cafeteria', NULL),
('PO-2024-004', 4, '2024-02-01', '2024-02-20', 'Sent', 30000.00, 'Agricultural equipment for new project', NULL),
('PO-2024-005', 1, '2024-02-05', '2024-02-25', 'Draft', 12000.00, 'Additional computer accessories', NULL);

-- STEP 3: PURCHASE ORDER ITEMS TABLE (Run after purchase orders)
INSERT INTO purchase_order_items (purchase_order_id, product_name, description, quantity, unit_price, total_price, received_quantity) VALUES
(1, 'Laptop Computer', 'Dell Inspiron 15 3000 Series', 10, 2500.00, 25000.00, 10),
(2, 'Copy Paper', 'A4 White Bond Paper 80gsm', 50, 150.00, 7500.00, 50),
(2, 'Ballpoint Pens', 'Blue ink ballpoint pens', 100, 10.00, 1000.00, 100),
(3, 'Rice', 'Premium Jasmine Rice 25kg', 20, 750.00, 15000.00, 20),
(4, 'Fertilizer', 'Organic Compost Fertilizer 50kg', 500.00, 60, 30000.00, 0);

-- STEP 4: SUPPLIER PRODUCTS TABLE (Run after suppliers)
INSERT INTO supplier_products (supplier_id, product_name, description, unit_price, min_order_quantity, lead_time_days, is_active) VALUES
(1, 'Laptop Computer', 'Dell Inspiron 15 3000 Series - 8GB RAM, 256GB SSD', 2500.00, 1, 7, TRUE),
(1, 'Desktop Monitor', 'Samsung 24-inch Full HD Monitor', 8000.00, 1, 5, TRUE),
(2, 'Copy Paper', 'A4 White Bond Paper 80gsm - 500 sheets per ream', 150.00, 10, 3, TRUE),
(2, 'Ballpoint Pens', 'Blue ink ballpoint pens - pack of 12', 10.00, 5, 2, TRUE),
(3, 'Rice', 'Premium Jasmine Rice 25kg bag', 750.00, 5, 7, TRUE);

-- STEP 5: INVENTORY TABLE (Run after supplier products)
INSERT INTO inventory (supplier_product_id, quantity) VALUES
(1, 25),
(2, 15),
(3, 200),
(4, 500),
(5, 80);

-- STEP 6: ORDERS TABLE (Run independently)
INSERT INTO orders (date, status, customer_name, customer_contact, total_amount, notes) VALUES
('2024-01-10', 'Completed', 'ABC Corporation', 'manager@abccorp.com', 75000.00, 'Bulk order for office setup'),
('2024-01-12', 'Processing', 'XYZ School', 'principal@xyzschool.edu.ph', 45000.00, 'Computer lab equipment'),
('2024-01-15', 'Pending', 'DEF Restaurant', 'owner@defrestaurant.com', 25000.00, 'Kitchen supplies and ingredients'),
('2024-01-18', 'Completed', 'GHI Construction', 'foreman@ghiconstruction.ph', 120000.00, 'Construction materials'),
('2024-01-20', 'Cancelled', 'JKL Retail Store', 'manager@jklretail.com', 30000.00, 'Order cancelled due to budget constraints');

-- STEP 7: ORDER ITEMS TABLE (Run after orders and supplier products)
INSERT INTO order_items (order_id, supplier_product_id, quantity, unit_price, total_price) VALUES
(1, 1, 3, 25000.00, 75000.00),
(2, 1, 2, 25000.00, 50000.00),
(2, 2, 1, 8000.00, 8000.00),
(3, 5, 20, 750.00, 15000.00),
(3, 3, 50, 150.00, 7500.00);

