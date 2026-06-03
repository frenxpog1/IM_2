<?php
session_start(); // Start session before any headers
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

function json_error($msg, $code = 500) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

function validateSupplierAssignment($conn, $supplier_id, $user_id = null) {
    if (!$supplier_id) {
        return ['valid' => true]; // No supplier assigned is always valid
    }
    
    // Check if supplier is already assigned to another user
    $sql = "SELECT id, username FROM users WHERE supplier_id = ?";
    $params = [$supplier_id];
    $types = 'i';
    
    if ($user_id) {
        $sql .= " AND id != ?";
        $params[] = $user_id;
        $types .= 'i';
    }
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $existing_user = $result->fetch_assoc();
        $stmt->close();
        return [
            'valid' => false,
            'error' => "This supplier is already assigned to user '{$existing_user['username']}' (ID: {$existing_user['id']})",
            'assigned_to' => $existing_user
        ];
    }
    
    $stmt->close();
    return ['valid' => true];
}
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    // Don't show server errors for session issues - these are authentication problems
    if (strpos($errstr, 'session_start') !== false) {
        json_error("Authentication required. Please log in.", 401);
    }
    json_error("Server error: $errstr", 500);
});
set_exception_handler(function($e) {
    json_error("Exception: " . $e->getMessage(), 500);
});

include 'db.php';
require_once 'auth_middleware.php';

$auth = getAuthMiddleware($conn);
$user = $auth->requireAuth();

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    $input = $_POST;
}

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        $action = $_GET['action'] ?? 'list';
        
        if ($action === 'available_suppliers') {
            // Check read permission for users module
            $auth->requirePermission('users', 'read');
            
            $user_id = intval($_GET['user_id'] ?? 0);
            
            // Get suppliers that are not assigned to any user, or assigned to the current user being edited
            $sql = "
                SELECT s.id, s.name, s.status,
                       CASE 
                           WHEN u.supplier_id IS NULL THEN 1
                           WHEN u.id = ? THEN 1
                           ELSE 0
                       END as is_available,
                       u.id as assigned_user_id,
                       u.username as assigned_username
                FROM suppliers s
                LEFT JOIN users u ON s.id = u.supplier_id
                WHERE s.status = 'Active'
                ORDER BY is_available DESC, s.name ASC
            ";
            
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('i', $user_id);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if (!$result) json_error($conn->error);
            
            $suppliers = [];
            while ($row = $result->fetch_assoc()) {
                $suppliers[] = [
                    'id' => $row['id'],
                    'name' => $row['name'],
                    'status' => $row['status'],
                    'is_available' => (bool)$row['is_available'],
                    'assigned_user_id' => $row['assigned_user_id'],
                    'assigned_username' => $row['assigned_username']
                ];
            }
            $stmt->close();
            
            echo json_encode(['success' => true, 'suppliers' => $suppliers]);
            break;
        }
        
        // Default action - list users
        // Check read permission for users module
        $auth->requirePermission('users', 'read');
        
        $sql = 'SELECT id, username, role, email, full_name, status, notes, created_at, supplier_id FROM users ORDER BY created_at DESC';
        $result = $conn->query($sql);
        if (!$result) json_error($conn->error);
        $users = [];
        while ($row = $result->fetch_assoc()) {
            $users[] = $row;
        }
        echo json_encode(['success' => true, 'users' => $users]);
        break;
    case 'POST':
        // Check create permission for users module
        $auth->requirePermission('users', 'create');
        
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        $role = intval($input['role'] ?? 0);
        $email = trim($input['email'] ?? '');
        $full_name = trim($input['full_name'] ?? '');
        $status = trim($input['status'] ?? 'active');
        $notes = trim($input['notes'] ?? '');
        $supplier_id = !empty($input['supplier_id']) ? intval($input['supplier_id']) : null;
        
        if (!$username || !$password || !$role) json_error('Username, password, and role are required.', 400);
        
        // Validate supplier assignment if provided
        if ($supplier_id) {
            $validation = validateSupplierAssignment($conn, $supplier_id);
            if (!$validation['valid']) {
                json_error($validation['error'], 400);
            }
        }
        
        $check_stmt = $conn->prepare('SELECT id FROM users WHERE username = ?');
        $check_stmt->bind_param('s', $username);
        $check_stmt->execute();
        if ($check_stmt->get_result()->num_rows > 0) {
            $check_stmt->close();
            json_error('Username already exists.', 400);
        }
        $check_stmt->close();
        
        $hash = password_hash($password, PASSWORD_DEFAULT);
        
        // Include supplier_id in the insert statement
        if ($supplier_id) {
            $stmt = $conn->prepare('INSERT INTO users (username, password, role, email, full_name, status, notes, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->bind_param('ssissssi', $username, $hash, $role, $email, $full_name, $status, $notes, $supplier_id);
        } else {
            $stmt = $conn->prepare('INSERT INTO users (username, password, role, email, full_name, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->bind_param('ssissss', $username, $hash, $role, $email, $full_name, $status, $notes);
        }
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'User created successfully.']);
        } else {
            // Handle unique constraint violation
            if ($conn->errno == 1062) { // Duplicate entry error
                json_error('This supplier is already assigned to another user.', 400);
            } else {
                json_error($stmt->error);
            }
        }
        $stmt->close();
        break;
    case 'PUT':
        // Check update permission for users module
        $auth->requirePermission('users', 'update');
        
        $id = intval($input['id'] ?? 0);
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        $role = intval($input['role'] ?? 0);
        $email = trim($input['email'] ?? '');
        $full_name = trim($input['full_name'] ?? '');
        $status = trim($input['status'] ?? 'active');
        $notes = trim($input['notes'] ?? '');
        $supplier_id = isset($input['supplier_id']) && $input['supplier_id'] !== '' ? intval($input['supplier_id']) : null;
        
        if (!$id || !$username || !$role) json_error('User ID, username, and role are required.', 400);
        
        // Validate supplier assignment if provided
        if ($supplier_id) {
            $validation = validateSupplierAssignment($conn, $supplier_id, $id);
            if (!$validation['valid']) {
                json_error($validation['error'], 400);
            }
        }
        
        $check_stmt = $conn->prepare('SELECT id FROM users WHERE username = ? AND id != ?');
        $check_stmt->bind_param('si', $username, $id);
        $check_stmt->execute();
        if ($check_stmt->get_result()->num_rows > 0) {
            $check_stmt->close();
            json_error('Username already exists.', 400);
        }
        $check_stmt->close();
        
        // Update user with supplier_id handling
        if ($password) {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $conn->prepare('UPDATE users SET username = ?, password = ?, role = ?, email = ?, full_name = ?, status = ?, notes = ?, supplier_id = ? WHERE id = ?');
            $stmt->bind_param('ssissssii', $username, $hash, $role, $email, $full_name, $status, $notes, $supplier_id, $id);
        } else {
            $stmt = $conn->prepare('UPDATE users SET username = ?, role = ?, email = ?, full_name = ?, status = ?, notes = ?, supplier_id = ? WHERE id = ?');
            $stmt->bind_param('sissssii', $username, $role, $email, $full_name, $status, $notes, $supplier_id, $id);
        }
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'User updated successfully.']);
        } else {
            // Handle unique constraint violation
            if ($conn->errno == 1062) { // Duplicate entry error
                json_error('This supplier is already assigned to another user.', 400);
            } else {
                json_error($stmt->error);
            }
        }
        $stmt->close();
        break;
    case 'DELETE':
        // Check delete permission for users module
        $auth->requirePermission('users', 'delete');
        
        $id = intval($input['id'] ?? 0);
        if (!$id) json_error('User ID is required.', 400);
        $admin_count = $conn->query("SELECT COUNT(*) as count FROM users WHERE role = 1")->fetch_assoc()['count'];
        $user_role = $conn->query("SELECT role FROM users WHERE id = $id")->fetch_assoc()['role'];
        if ($admin_count <= 1 && $user_role == 1) json_error('Cannot delete the last admin user.', 400);
        $stmt = $conn->prepare('DELETE FROM users WHERE id = ?');
        $stmt->bind_param('i', $id);
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'User deleted successfully.']);
        } else {
            json_error($stmt->error);
        }
        $stmt->close();
        break;
    default:
        json_error('Invalid request method.', 405);
}
$conn->close(); 