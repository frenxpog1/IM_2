/**
 * Standardized Error Handling System
 * Handles permission denials, API errors, and user feedback
 */

class ErrorHandler {
    constructor() {
        this.notificationContainer = null;
        this.init();
    }

    /**
     * Initialize error handler
     */
    init() {
        this.createNotificationContainer();
        this.setupGlobalErrorHandlers();
        this.setupAPIErrorInterceptor();
    }

    /**
     * Create notification container for error messages
     */
    createNotificationContainer() {
        let container = document.getElementById('error-notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'error-notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }
        this.notificationContainer = container;
    }

    /**
     * Setup global error handlers
     */
    setupGlobalErrorHandlers() {
        // Handle uncaught JavaScript errors
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            this.showError('An unexpected error occurred. Please refresh the page.');
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.showError('A network or processing error occurred.');
        });
    }

    /**
     * Setup API error interceptor for fetch requests
     */
    setupAPIErrorInterceptor() {
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);
                
                // Handle HTTP error status codes
                if (!response.ok) {
                    const errorData = await this.parseErrorResponse(response.clone());
                    this.handleAPIError(response.status, errorData, args[0]);
                    return response; // Still return response for caller to handle
                }
                
                return response;
            } catch (error) {
                console.error('Fetch error:', error);
                this.showError('Network error: Unable to connect to server');
                throw error;
            }
        };
    }

    /**
     * Parse error response from API
     */
    async parseErrorResponse(response) {
        try {
            const data = await response.json();
            return data;
        } catch {
            return { error: 'Unknown error', message: response.statusText };
        }
    }

    /**
     * Handle API errors based on status code
     */
    handleAPIError(status, errorData, url) {
        switch (status) {
            case 401:
                this.handleUnauthorizedError(errorData);
                break;
            case 403:
                this.handleForbiddenError(errorData);
                break;
            case 404:
                this.handleNotFoundError(errorData, url);
                break;
            case 422:
                this.handleValidationError(errorData);
                break;
            case 500:
                this.handleServerError(errorData);
                break;
            default:
                this.handleGenericError(status, errorData);
        }
    }

    /**
     * Handle 401 Unauthorized errors
     */
    handleUnauthorizedError(errorData) {
        this.showError('Your session has expired. Please log in again.', 'warning');
        
        // Redirect to login after a delay
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);
    }

    /**
     * Handle 403 Forbidden errors (permission denied)
     */
    handleForbiddenError(errorData) {
        const message = errorData.message || 'You don\'t have permission to perform this action';
        const details = errorData.details;
        
        let errorMessage = message;
        if (details && details.required_action && details.module) {
            errorMessage += `\n\nRequired: ${details.required_action} access to ${details.module}`;
            if (details.user_role) {
                errorMessage += `\nYour role: ${details.user_role}`;
            }
        }
        
        this.showError(errorMessage, 'error', 8000);
        
        // Log access denial for debugging
        console.warn('Access denied:', errorData);
    }

    /**
     * Handle 404 Not Found errors
     */
    handleNotFoundError(errorData, url) {
        const resourceName = this.extractResourceFromURL(url);
        this.showError(`${resourceName} not found or has been removed.`, 'warning');
    }

    /**
     * Handle 422 Validation errors
     */
    handleValidationError(errorData) {
        const message = errorData.message || 'Please check your input and try again';
        this.showError(`Validation Error: ${message}`, 'warning');
    }

    /**
     * Handle 500 Server errors
     */
    handleServerError(errorData) {
        this.showError('Server error occurred. Please try again later.', 'error');
        console.error('Server error details:', errorData);
    }

    /**
     * Handle generic errors
     */
    handleGenericError(status, errorData) {
        const message = errorData.message || errorData.error || `HTTP ${status} error`;
        this.showError(`Error: ${message}`, 'error');
    }

    /**
     * Extract resource name from URL for better error messages
     */
    extractResourceFromURL(url) {
        if (typeof url !== 'string') return 'Resource';
        
        if (url.includes('users.php')) return 'User';
        if (url.includes('orders.php')) return 'Order';
        if (url.includes('inventory.php')) return 'Inventory item';
        if (url.includes('suppliers.php')) return 'Supplier';
        if (url.includes('dashboard.php')) return 'Dashboard data';
        
        return 'Resource';
    }

    /**
     * Show error notification
     */
    showError(message, type = 'error', duration = 5000) {
        this.showNotification(message, type, duration);
    }

    /**
     * Show success notification
     */
    showSuccess(message, duration = 3000) {
        this.showNotification(message, 'success', duration);
    }

    /**
     * Show warning notification
     */
    showWarning(message, duration = 4000) {
        this.showNotification(message, 'warning', duration);
    }

    /**
     * Show info notification
     */
    showInfo(message, duration = 3000) {
        this.showNotification(message, 'info', duration);
    }

    /**
     * Show notification with specified type and duration
     */
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `error-notification error-notification-${type}`;
        
        // Handle multi-line messages
        const messageLines = message.split('\n');
        const messageHTML = messageLines.map(line => `<div>${this.escapeHtml(line)}</div>`).join('');
        
        notification.innerHTML = `
            <div class="error-notification-content">
                <div class="error-notification-icon">${this.getNotificationIcon(type)}</div>
                <div class="error-notification-message">${messageHTML}</div>
                <button class="error-notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add styles
        notification.style.cssText = `
            background: ${this.getNotificationColor(type)};
            color: ${this.getNotificationTextColor(type)};
            border: 1px solid ${this.getNotificationBorderColor(type)};
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease-out;
            pointer-events: auto;
            max-width: 100%;
            word-wrap: break-word;
        `;
        
        // Add animation styles if not already added
        this.addAnimationStyles();
        
        this.notificationContainer.appendChild(notification);
        
        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.style.animation = 'slideOutRight 0.3s ease-in';
                    setTimeout(() => {
                        if (notification.parentElement) {
                            notification.remove();
                        }
                    }, 300);
                }
            }, duration);
        }
        
        // Log to console for debugging
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    /**
     * Get notification icon based on type
     */
    getNotificationIcon(type) {
        switch (type) {
            case 'error': return '⚠️';
            case 'success': return '✅';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            default: return 'ℹ️';
        }
    }

    /**
     * Get notification background color
     */
    getNotificationColor(type) {
        switch (type) {
            case 'error': return '#f8d7da';
            case 'success': return '#d4edda';
            case 'warning': return '#fff3cd';
            case 'info': return '#d1ecf1';
            default: return '#e2e3e5';
        }
    }

    /**
     * Get notification text color
     */
    getNotificationTextColor(type) {
        switch (type) {
            case 'error': return '#721c24';
            case 'success': return '#155724';
            case 'warning': return '#856404';
            case 'info': return '#0c5460';
            default: return '#383d41';
        }
    }

    /**
     * Get notification border color
     */
    getNotificationBorderColor(type) {
        switch (type) {
            case 'error': return '#f5c6cb';
            case 'success': return '#c3e6cb';
            case 'warning': return '#ffeaa7';
            case 'info': return '#bee5eb';
            default: return '#d1d3d4';
        }
    }

    /**
     * Add CSS animation styles
     */
    addAnimationStyles() {
        if (document.getElementById('error-handler-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'error-handler-styles';
        styles.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            .error-notification-content {
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }
            
            .error-notification-icon {
                flex-shrink: 0;
                font-size: 16px;
            }
            
            .error-notification-message {
                flex: 1;
                font-size: 14px;
                line-height: 1.4;
            }
            
            .error-notification-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                opacity: 0.7;
                padding: 0;
                margin-left: 8px;
                flex-shrink: 0;
            }
            
            .error-notification-close:hover {
                opacity: 1;
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Clear all notifications
     */
    clearAllNotifications() {
        if (this.notificationContainer) {
            this.notificationContainer.innerHTML = '';
        }
    }
}

// Create global error handler instance
window.errorHandler = new ErrorHandler();

// Export convenience functions
window.showError = (message, duration) => window.errorHandler.showError(message, 'error', duration);
window.showSuccess = (message, duration) => window.errorHandler.showSuccess(message, duration);
window.showWarning = (message, duration) => window.errorHandler.showWarning(message, duration);
window.showInfo = (message, duration) => window.errorHandler.showInfo(message, duration);