<?php
/**
 * Permission Matrix Configuration
 * Defines what actions each role can perform on each module
 */

$PERMISSION_MATRIX = [
    'admin' => [
        'dashboard' => ['view', 'update'],
        'orders' => ['create', 'read', 'update', 'delete'],
        'inventory' => ['create', 'read', 'update', 'delete', 'request_stock'],
        'analytics' => ['view', 'export'],
        'users' => ['create', 'read', 'update', 'delete'],
        'suppliers' => ['create', 'read', 'update', 'delete']
    ],
    'staff' => [
        'dashboard' => ['view'],
        'orders' => ['create', 'read', 'update'],
        'inventory' => ['read', 'request_stock'],
        'analytics' => ['view'],
        'suppliers' => ['create', 'read', 'update']
    ],
    'supplier' => [
        'inventory' => ['read_all', 'approve_requests', 'decline_requests'],
        // TEMPORARY: Allow suppliers to read all suppliers for dev/testing
        'suppliers' => ['read', 'read_own', 'update_own']
    ]
];

/**
 * Role definitions for reference
 */
$ROLE_DEFINITIONS = [
    1 => 'admin',
    2 => 'staff', 
    3 => 'supplier'
];

/**
 * Module definitions
 */
$MODULE_DEFINITIONS = [
    'dashboard' => 'Dashboard and Analytics Overview',
    'orders' => 'Order Management',
    'inventory' => 'Inventory Management',
    'analytics' => 'Reports and Analytics',
    'users' => 'User Management',
    'suppliers' => 'Supplier Management'
];

/**
 * Action definitions
 */
$ACTION_DEFINITIONS = [
    'view' => 'View/Read access',
    'view_limited' => 'Limited view access (own data only)',
    'create' => 'Create new records',
    'read' => 'Read existing records',
    'read_own' => 'Read own records only',
    'update' => 'Update existing records',
    'update_own' => 'Update own records only',
    'delete' => 'Delete records',
    'export' => 'Export data'
];