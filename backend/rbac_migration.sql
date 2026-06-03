-- RBAC Migration Script
-- Creates necessary tables and columns for Role-Based Access Control system

-- Create access_log table for audit trail
CREATE TABLE IF NOT EXISTS access_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100),
    resource VARCHAR(100),
    result ENUM('granted', 'denied'),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Add supplier_id column to users table for supplier role users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS supplier_id INT NULL,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS permissions_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add foreign key constraint for supplier_id if suppliers table exists
-- This will be ignored if the constraint already exists
ALTER TABLE users 
ADD CONSTRAINT fk_users_supplier_id 
FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- Add unique constraint for supplier assignments
-- This ensures each supplier can only be assigned to one user
-- First check if constraint exists, if so drop it to recreate
SET @constraint_exists = (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND CONSTRAINT_NAME = 'unique_supplier_assignment'
);

SET @sql = IF(@constraint_exists > 0,
    'ALTER TABLE users DROP INDEX unique_supplier_assignment',
    'SELECT "Constraint does not exist, proceeding to create"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add the unique constraint (allows NULL but prevents duplicate non-NULL supplier_id values)
ALTER TABLE users 
ADD CONSTRAINT unique_supplier_assignment 
UNIQUE (supplier_id);

-- Create index for better performance on access_log queries
CREATE INDEX IF NOT EXISTS idx_access_log_user_id ON access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_access_log_created_at ON access_log(created_at);
CREATE INDEX IF NOT EXISTS idx_access_log_result ON access_log(result);

-- Insert some sample data if tables are empty
INSERT IGNORE INTO users (username, password, role, email, full_name, status) VALUES
('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1, 'admin@twirlytails.com', 'System Administrator', 'active'),
('staff', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 2, 'staff@twirlytails.com', 'Staff User', 'active'),
('supplier', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 3, 'supplier@twirlytails.com', 'Supplier User', 'active');