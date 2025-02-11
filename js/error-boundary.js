class ErrorBoundary {
    constructor(containerId, errorService) {
        this.container = document.getElementById(containerId);
        this.errorService = errorService;
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
        this.originalContent = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.recoveryTimeout = null;
    }

    preserveState() {
        if (this.container) {
            this.originalContent = this.container.innerHTML;
            this.originalDisplay = this.container.style.display;
        }
    }

    restoreState() {
        if (this.container && this.originalContent) {
            this.container.innerHTML = this.originalContent;
            this.container.style.display = this.originalDisplay;
            this.state.hasError = false;
            this.state.error = null;
            this.state.errorInfo = null;
        }
    }

    async captureError(callback) {
        try {
            const result = await callback();
            return result;
        } catch (error) {
            this.preserveState();
            
            this.state = {
                hasError: true,
                error,
                errorInfo: {
                    componentStack: error.stack || '',
                    retryCount: this.retryCount
                }
            };

            // Show fallback UI
            this.renderFallback();

            // Log the error without trying to handle it recursively
            this.errorService.error(error.message || 'An error occurred in component', error, {
                containerId: this.container?.id,
                retryCount: this.retryCount
            });

            throw error; // Re-throw to maintain error boundary chain
        }
    }

    renderFallback() {
        if (!this.container) return;

        const fallbackUI = document.createElement('div');
        fallbackUI.className = 'error-boundary-fallback';
        fallbackUI.innerHTML = `
            <div class="error-message">
                <h3>Something went wrong</h3>
                <p>${this.state.error?.message || 'An error occurred in this component'}</p>
                ${this.retryCount < this.maxRetries ? `
                    <button onclick="this.closest('.error-boundary-fallback').dispatchEvent(new CustomEvent('retry'))">
                        Try Again
                    </button>
                ` : `
                    <p>Max retry attempts reached. Please refresh the page.</p>
                `}
            </div>
        `;

        fallbackUI.addEventListener('retry', () => this.retry());
        
        this.container.innerHTML = '';
        this.container.appendChild(fallbackUI);
    }

    async retry() {
        if (this.retryCount >= this.maxRetries) {
            return;
        }

        this.retryCount++;
        try {
            await new Promise(resolve => {
                this.recoveryTimeout = setTimeout(resolve, Math.pow(2, this.retryCount) * 1000);
            });
            this.restoreState();
        } catch (error) {
            this.errorService.error('Retry failed', error);
        }
    }

    reset() {
        this.retryCount = 0;
        if (this.recoveryTimeout) {
            clearTimeout(this.recoveryTimeout);
        }
        this.restoreState();
    }
}

// Export the ErrorBoundary class
export default ErrorBoundary; 