/**
 * Error Reporting Client
 * BLACKONN E-Commerce Platform
 */

class ErrorReporter {
  constructor(config = {}) {
    this.config = {
      endpoint: config.endpoint || '/api/errors',
      enabled: config.enabled !== false,
      includeStackTrace: config.includeStackTrace !== false,
      includeUserAgent: config.includeUserAgent !== false,
      includeUrl: config.includeUrl !== false,
      maxErrors: config.maxErrors || 100,
      flushInterval: config.flushInterval || 5000, // 5 seconds
      ...config
    };

    this.errorQueue = [];
    this.errorCount = 0;
    this.sessionId = this.generateSessionId();

    if (this.config.enabled) {
      this.init();
    }
  }

  init() {
    // Catch global errors
    window.addEventListener('error', (event) => {
      this.captureError({
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
        type: 'javascript'
      });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        message: event.reason?.message || 'Unhandled Promise Rejection',
        error: event.reason,
        type: 'promise'
      });
    });

    // Catch console errors
    this.interceptConsoleError();

    // Start flush interval
    setInterval(() => this.flush(), this.config.flushInterval);

    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush());

    console.log('🐛 Error Reporter initialized');
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  captureError(errorData) {
    if (!this.config.enabled || this.errorCount >= this.config.maxErrors) {
      return;
    }

    const error = {
      ...errorData,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...(this.config.includeUrl && { url: window.location.href }),
      ...(this.config.includeUserAgent && { userAgent: navigator.userAgent }),
      ...(this.config.includeStackTrace && errorData.error?.stack && { 
        stack: errorData.error.stack 
      })
    };

    this.errorQueue.push(error);
    this.errorCount++;

    // Log to console in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.error('🐛 Error captured:', error);
    }
  }

  interceptConsoleError() {
    const originalError = console.error;
    console.error = (...args) => {
      // Call original
      originalError.apply(console, args);

      // Capture for reporting
      this.captureError({
        message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '),
        type: 'console'
      });
    };
  }

  async flush() {
    if (this.errorQueue.length === 0) {
      return;
    }

    const errors = [...this.errorQueue];
    this.errorQueue = [];

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          errors,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.warn('Failed to report errors:', response.statusText);
      }
    } catch (error) {
      console.warn('Error reporting failed:', error);
      // Put errors back in queue
      this.errorQueue.unshift(...errors);
    }
  }

  /**
   * Manually log an error
   */
  logError(message, error = null) {
    this.captureError({
      message,
      error,
      type: 'manual'
    });
  }

  /**
   * Log an API error
   */
  logApiError(url, status, message) {
    this.captureError({
      message: `API Error: ${message}`,
      url,
      status,
      type: 'api'
    });
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      totalErrors: this.errorCount,
      queuedErrors: this.errorQueue.length
    };
  }
}

// Create global instance
window.ErrorReporter = window.ErrorReporter || new ErrorReporter({
  enabled: true,
  endpoint: '/api/errors'
});

// Example usage:
// window.ErrorReporter.logError('Custom error message');
// window.ErrorReporter.logApiError('/api/products', 500, 'Internal Server Error');
