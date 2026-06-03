<?php
/**
 * Standardized Backend Error Handler
 * Provides consistent error responses and logging
 */

class ErrorHandler {
    private static $logFile = __DIR__ . '/error.log';
    
    /**
     * Send standardized JSON error response
     */
    public static function sendError($message, $code = 500, $details = null) {
        http_response_code($code);
        
        $response = [
            'success' => false,
            'error' => self::getErrorTitle($code),
            'message' => $message,
            'timestamp' => date('c')
        ];
        
        if ($details) {
            $response['details'] = $details;
        }
        
        // Log error for debugging
        self::logError($code, $message, $details);
        
        header('Content-Type: application/json');
        echo json_encode($response);
        exit;
    }
    
    /**
     * Send permission denied error
     */
    public static function sendPermissionDenied($module, $action, $userRole = null) {
        $message = "You don't have permission to perform this action";
        
        $details = [
            'required_action' => $action,
            'module' => $module,
            'user_role' => self::getRoleName($userRole)
        ];
        
        self::sendError($message, 403, $details);
    }
    
    /**
     * Send authentication required error
     */
    public static function sendAuthRequired($message = 'Authentication required') {
        self::sendError($message, 401);
    }
    
    /**
     * Send validation error
     */
    public static function sendValidationError($message, $fields = null) {
        $details = null;
        if ($fields) {
            $details = ['invalid_fields' => $fields];
        }
        
        self::sendError($message, 422, $details);
    }
    
    /**
     * Send not found error
     */
    public static function sendNotFound($resource = 'Resource') {
        self::sendError("$resource not found", 404);
    }
    
    /**
     * Send server error
     */
    public static function sendServerError($message = 'Internal server error') {
        self::sendError($message, 500);
    }
    
    /**
     * Get error title based on HTTP code
     */
    private static function getErrorTitle($code) {
        switch ($code) {
            case 400: return 'Bad Request';
            case 401: return 'Unauthorized';
            case 403: return 'Forbidden';
            case 404: return 'Not Found';
            case 422: return 'Validation Error';
            case 500: return 'Server Error';
            default: return 'Error';
        }
    }
    
    /**
     * Get role name from role ID
     */
    private static function getRoleName($role) {
        switch ($role) {
            case 1: return 'Administrator';
            case 2: return 'Staff';
            case 3: return 'Supplier';
            default: return 'Unknown';
        }
    }
    
    /**
     * Log error to file
     */
    private static function logError($code, $message, $details = null) {
        $logEntry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'code' => $code,
            'message' => $message,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
            'request_uri' => $_SERVER['REQUEST_URI'] ?? 'unknown',
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'unknown'
        ];
        
        if ($details) {
            $logEntry['details'] = $details;
        }
        
        $logLine = json_encode($logEntry) . "\n";
        
        // Ensure log directory exists
        $logDir = dirname(self::$logFile);
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
        
        file_put_contents(self::$logFile, $logLine, FILE_APPEND | LOCK_EX);
    }
    
    /**
     * Setup global error handlers
     */
    public static function setupGlobalHandlers() {
        // Handle PHP errors
        set_error_handler([self::class, 'handlePHPError']);
        
        // Handle uncaught exceptions
        set_exception_handler([self::class, 'handleException']);
        
        // Handle fatal errors
        register_shutdown_function([self::class, 'handleFatalError']);
    }
    
    /**
     * Handle PHP errors
     */
    public static function handlePHPError($severity, $message, $file, $line) {
        // Don't handle suppressed errors
        if (!(error_reporting() & $severity)) {
            return false;
        }
        
        $errorType = self::getErrorType($severity);
        $errorMessage = "$errorType: $message in $file on line $line";
        
        self::logError(500, $errorMessage);
        
        // For API endpoints, send JSON error response
        if (self::isAPIRequest()) {
            self::sendServerError('An error occurred while processing your request');
        }
        
        return true;
    }
    
    /**
     * Handle uncaught exceptions
     */
    public static function handleException($exception) {
        $message = $exception->getMessage();
        $file = $exception->getFile();
        $line = $exception->getLine();
        
        $errorMessage = "Uncaught Exception: $message in $file on line $line";
        
        self::logError(500, $errorMessage, [
            'trace' => $exception->getTraceAsString()
        ]);
        
        if (self::isAPIRequest()) {
            self::sendServerError('An unexpected error occurred');
        }
    }
    
    /**
     * Handle fatal errors
     */
    public static function handleFatalError() {
        $error = error_get_last();
        
        if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
            $errorMessage = "Fatal Error: {$error['message']} in {$error['file']} on line {$error['line']}";
            
            self::logError(500, $errorMessage);
            
            if (self::isAPIRequest()) {
                self::sendServerError('A fatal error occurred');
            }
        }
    }
    
    /**
     * Get error type name
     */
    private static function getErrorType($severity) {
        switch ($severity) {
            case E_ERROR: return 'Fatal Error';
            case E_WARNING: return 'Warning';
            case E_PARSE: return 'Parse Error';
            case E_NOTICE: return 'Notice';
            case E_CORE_ERROR: return 'Core Error';
            case E_CORE_WARNING: return 'Core Warning';
            case E_COMPILE_ERROR: return 'Compile Error';
            case E_COMPILE_WARNING: return 'Compile Warning';
            case E_USER_ERROR: return 'User Error';
            case E_USER_WARNING: return 'User Warning';
            case E_USER_NOTICE: return 'User Notice';
            case E_STRICT: return 'Strict Standards';
            case E_RECOVERABLE_ERROR: return 'Recoverable Error';
            case E_DEPRECATED: return 'Deprecated';
            case E_USER_DEPRECATED: return 'User Deprecated';
            default: return 'Unknown Error';
        }
    }
    
    /**
     * Check if current request is an API request
     */
    private static function isAPIRequest() {
        // Check if we're in a backend PHP file
        $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
        if (strpos($scriptName, '/backend/') !== false) {
            return true;
        }
        
        // Check for JSON content type
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (strpos($contentType, 'application/json') !== false) {
            return true;
        }
        
        // Check for AJAX request
        $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
        if (strtolower($requestedWith) === 'xmlhttprequest') {
            return true;
        }
        
        return false;
    }
    
    /**
     * Get recent error logs
     */
    public static function getRecentErrors($limit = 50) {
        if (!file_exists(self::$logFile)) {
            return [];
        }
        
        $lines = file(self::$logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $lines = array_slice($lines, -$limit);
        
        $errors = [];
        foreach ($lines as $line) {
            $error = json_decode($line, true);
            if ($error) {
                $errors[] = $error;
            }
        }
        
        return array_reverse($errors);
    }
    
    /**
     * Clear error log
     */
    public static function clearErrorLog() {
        if (file_exists(self::$logFile)) {
            unlink(self::$logFile);
        }
    }
}

// Helper functions for easy use
function sendError($message, $code = 500, $details = null) {
    ErrorHandler::sendError($message, $code, $details);
}

function sendPermissionDenied($module, $action, $userRole = null) {
    ErrorHandler::sendPermissionDenied($module, $action, $userRole);
}

function sendAuthRequired($message = 'Authentication required') {
    ErrorHandler::sendAuthRequired($message);
}

function sendValidationError($message, $fields = null) {
    ErrorHandler::sendValidationError($message, $fields);
}

function sendNotFound($resource = 'Resource') {
    ErrorHandler::sendNotFound($resource);
}

function sendServerError($message = 'Internal server error') {
    ErrorHandler::sendServerError($message);
}