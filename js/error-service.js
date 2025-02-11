class ErrorService {
    constructor() {
        this.errors = [];
        this.maxErrors = 100; // Keep last 100 errors
        this.debugMode = localStorage.getItem('taskshot_debug') === 'true';
        this.setupErrorContainer();
    }

    setupErrorContainer() {
        // Create error container if it doesn't exist
        let container = document.getElementById('error-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'error-container';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                max-width: 400px;
                max-height: 300px;
                overflow-y: auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 1000;
                display: none;
            `;
            document.body.appendChild(container);
        }
    }

    log(level, message, error = null, context = {}) {
        const timestamp = new Date().toISOString();
        const errorObj = {
            timestamp,
            level,
            message,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                cause: error.cause
            } : null,
            context: {
                url: window.location.href,
                userAgent: navigator.userAgent,
                ...context
            }
        };

        this.errors.unshift(errorObj);
        if (this.errors.length > this.maxErrors) {
            this.errors.pop();
        }

        // Console logging
        const consoleMsg = `[${level}] ${message}`;
        switch (level) {
            case 'ERROR':
                console.error(consoleMsg, error, context);
                break;
            case 'WARN':
                console.warn(consoleMsg, context);
                break;
            case 'INFO':
                console.info(consoleMsg, context);
                break;
            default:
                console.log(consoleMsg, context);
        }

        // Show in UI if debug mode is on
        if (this.debugMode) {
            this.showInUI(errorObj);
        }

        // Store in localStorage for persistence
        this.persistErrors();
    }

    error(message, error = null, context = {}) {
        this.log('ERROR', message, error, context);
    }

    warn(message, context = {}) {
        this.log('WARN', message, null, context);
    }

    info(message, context = {}) {
        this.log('INFO', message, null, context);
    }

    debug(message, context = {}) {
        if (this.debugMode) {
            this.log('DEBUG', message, null, context);
        }
    }

    showInUI(errorObj) {
        const container = document.getElementById('error-container');
        container.style.display = 'block';

        const errorElement = document.createElement('div');
        errorElement.className = 'error-item';
        errorElement.style.cssText = `
            padding: 10px;
            border-bottom: 1px solid #eee;
            font-family: monospace;
            font-size: 12px;
        `;

        const levelColor = {
            ERROR: '#ff4444',
            WARN: '#ffbb33',
            INFO: '#00C851',
            DEBUG: '#33b5e5'
        };

        errorElement.innerHTML = `
            <div style="color: ${levelColor[errorObj.level]}; font-weight: bold;">
                [${errorObj.level}] ${new Date(errorObj.timestamp).toLocaleTimeString()}
            </div>
            <div>${errorObj.message}</div>
            ${errorObj.error ? `
                <div style="color: #666; margin-top: 5px;">
                    ${errorObj.error.message}
                    ${errorObj.error.stack ? `
                        <pre style="font-size: 10px; margin: 5px 0; overflow-x: auto;">
                            ${errorObj.error.stack}
                        </pre>
                    ` : ''}
                </div>
            ` : ''}
            ${Object.keys(errorObj.context).length > 0 ? `
                <div style="color: #666; margin-top: 5px; font-size: 10px;">
                    Context: ${JSON.stringify(errorObj.context, null, 2)}
                </div>
            ` : ''}
        `;

        container.insertBefore(errorElement, container.firstChild);

        // Keep only last 10 errors in UI
        while (container.children.length > 10) {
            container.removeChild(container.lastChild);
        }
    }

    persistErrors() {
        try {
            localStorage.setItem('taskshot_errors', JSON.stringify(this.errors));
        } catch (e) {
            console.warn('Failed to persist errors to localStorage', e);
        }
    }

    loadErrors() {
        try {
            const stored = localStorage.getItem('taskshot_errors');
            if (stored) {
                this.errors = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load errors from localStorage', e);
        }
    }

    clearErrors() {
        this.errors = [];
        localStorage.removeItem('taskshot_errors');
        const container = document.getElementById('error-container');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    }

    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        localStorage.setItem('taskshot_debug', this.debugMode);
        const container = document.getElementById('error-container');
        container.style.display = this.debugMode ? 'block' : 'none';
    }

    getErrorSummary() {
        return {
            total: this.errors.length,
            byLevel: this.errors.reduce((acc, err) => {
                acc[err.level] = (acc[err.level] || 0) + 1;
                return acc;
            }, {}),
            recent: this.errors.slice(0, 5)
        };
    }

    downloadErrorLog() {
        const blob = new Blob([JSON.stringify(this.errors, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `taskshot_error_log_${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

export const errorService = new ErrorService(); 