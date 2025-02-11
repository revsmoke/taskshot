class ErrorService {
    constructor() {
        this.logLevel = localStorage.getItem('log_level') || 'info';
        this.errorStack = [];
        this.errors = [];
        this.maxStackSize = 100;
        this.isHandlingError = false;
        this.errorRateThreshold = 20;
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
            fatal: 4
        };
        this.errorCategories = {
            NETWORK: 'network',
            DATABASE: 'database',
            API: 'api',
            UI: 'ui',
            VALIDATION: 'validation',
            INITIALIZATION: 'initialization',
            RUNTIME: 'runtime'
        };
        this.recoveryStrategies = new Map();
        this.errorPatterns = new Map();
        this.setupErrorContainer();
        this.setupRecoveryStrategies();
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

    setLogLevel(level) {
        if (this.levels[level] !== undefined) {
            this.logLevel = level;
            localStorage.setItem('log_level', level);
        }
    }

    shouldLog(level) {
        return this.levels[level] >= this.levels[this.logLevel];
    }

    formatError(error) {
        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack,
                cause: error.cause
            };
        }
        return error;
    }

    formatMessage(level, message, error = null, context = {}) {
        const timestamp = new Date().toISOString();
        const formattedError = error ? this.formatError(error) : null;
        
        return {
            timestamp,
            level,
            message,
            error: formattedError,
            context: {
                url: window.location.href,
                userAgent: navigator.userAgent,
                ...context
            }
        };
    }

    addToStack(errorInfo) {
        this.errorStack.unshift(errorInfo);
        if (this.errorStack.length > this.maxStackSize) {
            this.errorStack.pop();
        }
        this.persistErrorStack();
    }

    persistErrorStack() {
        try {
            localStorage.setItem('error_stack', JSON.stringify(this.errorStack));
        } catch (e) {
            console.error('Failed to persist error stack:', e);
        }
    }

    loadErrorStack() {
        try {
            const stored = localStorage.getItem('error_stack');
            if (stored) {
                this.errorStack = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load error stack:', e);
            this.errorStack = [];
        }
    }

    log(level, message, error = null, context = {}) {
        if (!this.shouldLog(level)) return;

        const errorInfo = this.formatMessage(level, message, error, context);
        this.addToStack(errorInfo);

        // Console output
        const consoleMethod = level === 'fatal' ? 'error' : level;
        if (error) {
            console[consoleMethod](message, error, context);
        } else {
            console[consoleMethod](message, context);
        }

        // Send to error monitoring service if available
        if (window.reportError && (level === 'error' || level === 'fatal')) {
            window.reportError(errorInfo);
        }

        // Trigger UI notification for warnings and above
        if (this.levels[level] >= this.levels.warn) {
            this.showNotification(level, message);
        }

        return errorInfo;
    }

    debug(message, error = null, context = {}) {
        return this.log('debug', message, error, context);
    }

    info(message, error = null, context = {}) {
        return this.log('info', message, error, context);
    }

    warn(message, error = null, context = {}) {
        return this.log('warn', message, error, context);
    }

    error(message, error = null, context = {}) {
        return this.log('error', message, error, context);
    }

    fatal(message, error = null, context = {}) {
        return this.log('fatal', message, error, context);
    }

    showNotification(level, message) {
        const notification = document.createElement('div');
        notification.className = `error-notification error-${level}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 4px;
            background: ${this.getNotificationColor(level)};
            color: white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 9999;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="text-transform: uppercase; margin-right: 10px;">${level}:</strong>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; margin-left: 10px;">×</button>
            </div>
        `;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    getNotificationColor(level) {
        const colors = {
            debug: '#607d8b',
            info: '#2196f3',
            warn: '#ff9800',
            error: '#f44336',
            fatal: '#d32f2f'
        };
        return colors[level] || colors.info;
    }

    getErrorStack() {
        return [...this.errorStack];
    }

    clearErrorStack() {
        this.errorStack = [];
        this.persistErrorStack();
        this.isHandlingError = false;
    }

    initialize() {
        this.loadErrorStack();
        window.onerror = (message, source, lineno, colno, error) => {
            this.error('Global error caught', error, {
                source,
                lineno,
                colno
            });
        };

        window.addEventListener('unhandledrejection', (event) => {
            this.error('Unhandled promise rejection', event.reason, {
                promise: event.promise
            });
        });
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
        this.errorStack = [];
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
            total: this.errorStack.length,
            byLevel: this.errorStack.reduce((acc, err) => {
                acc[err.level] = (acc[err.level] || 0) + 1;
                return acc;
            }, {}),
            recent: this.errorStack.slice(0, 5)
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

    setupRecoveryStrategies() {
        // Network errors
        this.recoveryStrategies.set(this.errorCategories.NETWORK, async (error) => {
            const retryCount = error.context?.retryCount || 0;
            if (retryCount < 3) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                return true; // Indicate retry is possible
            }
            return false;
        });

        // Database errors
        this.recoveryStrategies.set(this.errorCategories.DATABASE, async (error) => {
            if (error.message.includes('QuotaExceededError')) {
                try {
                    await this.clearOldData();
                    return true;
                } catch {
                    return false;
                }
            }
            return false;
        });

        // API errors
        this.recoveryStrategies.set(this.errorCategories.API, async (error) => {
            if (error.message.includes('rate limit')) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return true;
            }
            return false;
        });
    }

    setupErrorPatterns() {
        // Network error patterns
        this.errorPatterns.set(this.errorCategories.NETWORK, [
            /failed to fetch/i,
            /network error/i,
            /timeout/i
        ]);

        // Database error patterns
        this.errorPatterns.set(this.errorCategories.DATABASE, [
            /indexeddb/i,
            /quota exceeded/i,
            /database error/i
        ]);

        // API error patterns
        this.errorPatterns.set(this.errorCategories.API, [
            /api key/i,
            /rate limit/i,
            /unauthorized/i
        ]);
    }

    categorizeError(error) {
        for (const [category, patterns] of this.errorPatterns) {
            for (const pattern of patterns) {
                if (pattern.test(error.message)) {
                    return category;
                }
            }
        }
        return this.errorCategories.RUNTIME;
    }

    async handleError(error, context = {}) {
        const category = this.categorizeError(error);
        const recoveryStrategy = this.recoveryStrategies.get(category);

        if (recoveryStrategy) {
            try {
                const canRecover = await recoveryStrategy(error);
                if (canRecover) {
                    this.info('Recovery strategy successful', null, {
                        category,
                        error: error.message
                    });
                    return true;
                }
            } catch (recoveryError) {
                this.error('Recovery strategy failed', recoveryError, {
                    originalError: error.message,
                    category
                });
            }
        }

        this.logError(error, category, context);
        return false;
    }

    async clearOldData() {
        // Implementation for clearing old data to free up space
        const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
        const cutoffDate = Date.now() - TWO_WEEKS;

        this.errorStack = this.errorStack.filter(error => 
            new Date(error.timestamp).getTime() > cutoffDate
        );

        this.persistErrorStack();
    }

    aggregateErrors() {
        const aggregation = {
            byCategory: {},
            byTimeWindow: {
                lastHour: 0,
                lastDay: 0,
                lastWeek: 0
            },
            patterns: new Map()
        };

        const now = Date.now();
        const hour = 60 * 60 * 1000;
        const day = 24 * hour;
        const week = 7 * day;

        this.errorStack.forEach(error => {
            // Aggregate by category
            const category = error.category || 'unknown';
            aggregation.byCategory[category] = (aggregation.byCategory[category] || 0) + 1;

            // Aggregate by time window
            const timestamp = new Date(error.timestamp).getTime();
            if (now - timestamp < hour) aggregation.byTimeWindow.lastHour++;
            if (now - timestamp < day) aggregation.byTimeWindow.lastDay++;
            if (now - timestamp < week) aggregation.byTimeWindow.lastWeek++;

            // Identify patterns - safely handle undefined messages
            if (error.message) {
                const pattern = error.message.toString().replace(/[0-9]/g, 'X').replace(/[a-zA-Z]+/g, 'W');
                if (!aggregation.patterns.has(pattern)) {
                    aggregation.patterns.set(pattern, {
                        count: 0,
                        examples: []
                    });
                }
                const patternData = aggregation.patterns.get(pattern);
                patternData.count++;
                if (patternData.examples.length < 3) {
                    patternData.examples.push(error.message);
                }
            }
        });

        return aggregation;
    }

    async logError(error, category, context = {}) {
        if (this.isHandlingError) {
            console.warn('Prevented recursive error logging');
            return;
        }

        this.isHandlingError = true;
        try {
            const errorInfo = {
                ...this.formatMessage('error', error?.message || 'Unknown error', error, context),
                category
            };

            this.addToStack(errorInfo);

            // Check for error patterns and potential system-wide issues
            try {
                const aggregation = this.aggregateErrors();
                if (aggregation.byTimeWindow.lastHour > this.errorRateThreshold && 
                    Object.keys(aggregation.byCategory).length > 1) {
                    this.fatal('High error rate detected', null, {
                        errorRate: aggregation.byTimeWindow.lastHour,
                        timeWindow: '1 hour',
                        categories: Object.entries(aggregation.byCategory)
                            .map(([cat, count]) => `${cat}: ${count}`)
                            .join(', ')
                    });
                }
            } catch (aggregationError) {
                console.error('Error during error aggregation:', aggregationError);
            }

            // Show notification for the error
            this.showNotification('error', error?.message || 'An error occurred');
        } finally {
            this.isHandlingError = false;
        }
    }
}

const errorService = new ErrorService();
errorService.initialize();

export { errorService }; 