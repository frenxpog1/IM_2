<?php
ob_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Expires: 0');
header('Pragma: no-cache');
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(0);
header('Content-Type: application/json');
include 'db.php';
session_start();

function debug_log($msg) {
    file_put_contents(__DIR__ . '/debug.log', date('Y-m-d H:i:s') . ' ' . $msg . "\n", FILE_APPEND);
}

$debug = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    $ip = $_SERVER['REMOTE_ADDR'];
    $user_id = null;
    $status = 'fail';
    $debug[] = 'POST received';
    $debug[] = 'Username: ' . $username;
    if (!$username || !$password) {
        $debug[] = 'Missing username or password';
        debug_log(json_encode($debug));
        echo json_encode(['success' => false, 'error' => 'Username and password are required.', 'debug' => $debug]);
        ob_end_flush();
        $conn->close();
        exit;
    }
    // Try database authentication
    $stmt = $conn->prepare('SELECT id, username, password, role FROM users WHERE username = ?');
    if (!$stmt) {
        $debug[] = 'Database error: prepare failed';
        debug_log(json_encode($debug));
        echo json_encode(['success' => false, 'error' => 'Database error.', 'debug' => $debug]);
        ob_end_flush();
        $conn->close();
        exit;
    }
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($row = $result->fetch_assoc()) {
        $user_id = $row['id'];
        $debug[] = 'User found in DB';
        if (password_verify($password, $row['password'])) {
            $_SESSION['user_id'] = $row['id'];
            $_SESSION['username'] = $row['username'];
            $_SESSION['role'] = $row['role'];
            $status = 'success';
            $debug[] = 'Password verified';
            debug_log(json_encode($debug));
            echo json_encode(['success' => true, 'user' => [
                'id' => $row['id'],
                'username' => $row['username'],
                'role' => $row['role']
            ], 'debug' => $debug]);
            ob_end_flush();
            $stmt->close();
            // Log the attempt
            $stmt2 = $conn->prepare("INSERT INTO login_report (user_id, status, ip_address) VALUES (?, ?, ?)");
            $stmt2->bind_param("iss", $user_id, $status, $ip);
            $stmt2->execute();
            $stmt2->close();
            $conn->close();
            exit;
        } else {
            $debug[] = 'Invalid password';
            debug_log(json_encode($debug));
            echo json_encode(['success' => false, 'error' => 'Invalid password.', 'debug' => $debug]);
            ob_end_flush();
            $stmt->close();
            // Log the attempt
            $stmt2 = $conn->prepare("INSERT INTO login_report (user_id, status, ip_address) VALUES (?, ?, ?)");
            $stmt2->bind_param("iss", $user_id, $status, $ip);
            $stmt2->execute();
            $stmt2->close();
            $conn->close();
            exit;
        }
    } else {
        $debug[] = 'User not found in DB';
        debug_log(json_encode($debug));
        echo json_encode(['success' => false, 'error' => 'User not found.', 'debug' => $debug]);
        ob_end_flush();
        $stmt->close();
        // Log the attempt
        $stmt2 = $conn->prepare("INSERT INTO login_report (user_id, status, ip_address) VALUES (?, ?, ?)");
        $stmt2->bind_param("iss", $user_id, $status, $ip);
        $stmt2->execute();
        $stmt2->close();
        $conn->close();
        exit;
    }
} else {
    $debug[] = 'Invalid request method';
    debug_log(json_encode($debug));
    echo json_encode(['success' => false, 'error' => 'Invalid request.', 'debug' => $debug]);
    ob_end_flush();
    $conn->close();
    exit;
} 