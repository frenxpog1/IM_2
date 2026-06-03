<?php
/**
 * Permission Configuration Validator
 * Validates the permission matrix configuration for consistency and completeness
 */

class PermissionConfigValidator {
    private $permissions;
    private $errors = [];
    private $warnings = [];
    
    public function __construct() {
        require __DIR__ . '/permissions.php';
        $this->permissions = $PERMISSION_MATRIX ?? [];
    }
    
    /**
     * Validate the entire permission configuration
     * @return array Validation results
     */
    public function validate() {
        $this->errors = [];
        $this->warnings = [];
        
        $this->validateStructure();
        $this->validateRoles();
        $this->validateModules();
        $this->validateActions();
        $this->validateConsistency();
        
        return [
            'valid' => empty($this->errors),
            'errors' => $this->errors,
            'warnings' => $this->warnings
        ];
    }
    
    /**
     * Validate basic structure
     */
    private function validateStructure() {
        if (!is_array($this->permissions)) {
            $this->errors[] = "Permission matrix must be an array";
            return;
        }
        
        if (empty($this->permissions)) {
            $this->errors[] = "Permission matrix cannot be empty";
            return;
        }
    }
    
    /**
     * Validate role definitions
     */
    private function validateRoles() {
        $expected_roles = ['admin', 'staff', 'supplier'];
        $defined_roles = array_keys($this->permissions);
        
        foreach ($expected_roles as $role) {
            if (!in_array($role, $defined_roles)) {
                $this->errors[] = "Missing role definition: $role";
            }
        }
        
        foreach ($defined_roles as $role) {
            if (!in_array($role, $expected_roles)) {
                $this->warnings[] = "Unknown role definition: $role";
            }
            
            if (!is_array($this->permissions[$role])) {
                $this->errors[] = "Role '$role' permissions must be an array";
            }
        }
    }
    
    /**
     * Validate module definitions
     */
    private function validateModules() {
        $expected_modules = ['dashboard', 'orders', 'inventory', 'analytics', 'users', 'suppliers'];
        
        foreach ($this->permissions as $role => $modules) {
            if (!is_array($modules)) continue;
            
            foreach ($expected_modules as $module) {
                if ($role === 'admin' && !isset($modules[$module])) {
                    $this->warnings[] = "Admin role missing module: $module";
                }
            }
            
            foreach ($modules as $module => $actions) {
                if (!in_array($module, $expected_modules)) {
                    $this->warnings[] = "Unknown module '$module' in role '$role'";
                }
                
                if (!is_array($actions)) {
                    $this->errors[] = "Actions for module '$module' in role '$role' must be an array";
                }
            }
        }
    }
    
    /**
     * Validate action definitions
     */
    private function validateActions() {
        $valid_actions = [
            'view', 'view_limited', 'create', 'read', 'read_own', 
            'update', 'update_own', 'delete', 'export'
        ];
        
        foreach ($this->permissions as $role => $modules) {
            if (!is_array($modules)) continue;
            
            foreach ($modules as $module => $actions) {
                if (!is_array($actions)) continue;
                
                foreach ($actions as $action) {
                    if (!in_array($action, $valid_actions)) {
                        $this->warnings[] = "Unknown action '$action' in module '$module' for role '$role'";
                    }
                }
            }
        }
    }
    
    /**
     * Validate logical consistency
     */
    private function validateConsistency() {
        // Admin should have the most permissions
        if (isset($this->permissions['admin'])) {
            $admin_modules = array_keys($this->permissions['admin']);
            
            foreach (['staff', 'supplier'] as $role) {
                if (!isset($this->permissions[$role])) continue;
                
                foreach ($this->permissions[$role] as $module => $actions) {
                    if (!in_array($module, $admin_modules)) {
                        $this->warnings[] = "Role '$role' has access to module '$module' but admin doesn't";
                    }
                }
            }
        }
        
        // Supplier should have the most restrictive permissions
        if (isset($this->permissions['supplier'])) {
            foreach ($this->permissions['supplier'] as $module => $actions) {
                $has_own_only = false;
                foreach ($actions as $action) {
                    if (strpos($action, '_own') !== false || $action === 'view_limited') {
                        $has_own_only = true;
                        break;
                    }
                }
                
                if (!$has_own_only && !empty($actions)) {
                    $this->warnings[] = "Supplier has unrestricted access to module '$module' - consider using '_own' or '_limited' actions";
                }
            }
        }
    }
    
    /**
     * Get permission summary
     * @return array Summary of permissions by role
     */
    public function getSummary() {
        $summary = [];
        
        foreach ($this->permissions as $role => $modules) {
            $summary[$role] = [
                'modules' => count($modules),
                'total_actions' => 0,
                'modules_list' => []
            ];
            
            foreach ($modules as $module => $actions) {
                $summary[$role]['total_actions'] += count($actions);
                $summary[$role]['modules_list'][$module] = $actions;
            }
        }
        
        return $summary;
    }
}

/**
 * Helper function to validate permissions
 * @return array Validation results
 */
function validatePermissions() {
    $validator = new PermissionConfigValidator();
    return $validator->validate();
}

/**
 * Helper function to get permission summary
 * @return array Permission summary
 */
function getPermissionSummary() {
    $validator = new PermissionConfigValidator();
    return $validator->getSummary();
}