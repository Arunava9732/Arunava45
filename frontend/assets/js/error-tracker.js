/**
 * Error Tracking & Monitoring System
 * Comprehensive client-side error tracking with analytics and alerts
 * @version 2.0.0
 */

class ErrorTracker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.networkErrors = [];
    this.performanceIssues = [];
    this._isCapturing = false;
    
    this.config = {
      enabled: true,
      captureConsoleErrors: true,
      captureNetworkErrors: true,
      captureUnhandledRejections: true,
      captureResourceErrors: true,
      maxErrors: 100,
      sendToServer: true,
      serverEndpoint: '/api/admin/errors',
      sampleRate: 1.0, // 100% of errors
      enableSourceMaps: true,
      enableBreadcrumbs: true,
      maxBreadcrumbs: 50,
      enableUserContext: true,
      enableDeviceContext: true,
      alertThreshold: 10 // Alert after 10 errors
    };

    this.breadcrumbs = [];
    this.userContext = {};
    this.deviceContext = {};
    this.sessionId = this.generateSessionId();
    this.errorCounts = new Map();
    this.lastErrorTimestamp = 0;
  }

  /**
   * Initialize Error Tracker
   */
  async init() {
    try {
      if (!this.config.enabled) return;

      // Setup error handlers
      this.setupGlobalErrorHandlers();

      // Setup network error monitoring
      if (this.config.captureNetworkErrors) {
        this.setupNetworkMonitoring();
      }

      // Setup resource error monitoring
      if (this.config.captureResourceErrors) {
        this.setupResourceMonitoring();
      }

      // Collect device context
      if (this.config.enableDeviceContext) {
        await this.collectDeviceContext();
      }

      // Collect user context
      if (this.config.enableUserContext) {
        this.collectUserContext();
      }

      // Setup breadcrumb tracking
      if (this.config.enableBreadcrumbs) {
        this.setupBreadcrumbTracking();
      }

      // Load previous session errors
      this.loadStoredErrors();

      // Periodic cleanup
      this.startCleanupTimer();

      console.log('🐛 ErrorTracker initialized');
      return true;
    } catch (error) {
      console.error('❌ ErrorTracker init failed:', error);
      return false;
    }
  }

  /**
   * Setup global error handlers
   */
  setupGlobalErrorHandlers() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.captureError({
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        stack: event.error?.stack
      });
    });

    // Capture unhandled promise rejections
    if (this.config.captureUnhandledRejections) {
      window.addEventListener('unhandledrejection', (event) => {
        this.captureError({
          type: 'unhandled_rejection',
          message: event.reason?.message || 'Unhandled Promise Rejection',
          error: event.reason,
          stack: event.reason?.stack,
          promise: event.promise
        });
      });
    }

    // Intercept console.error
    if (this.config.captureConsoleErrors) {
      const originalError = console.error;
      console.error = (...args) => {
        this.captureError({
          type: 'console_error',
          message: args.join(' '),
          args: args,
          stack: new Error().stack
        });
        originalError.apply(console, args);
      };

      // Also capture warnings
      const originalWarn = console.warn;
      console.warn = (...args) => {
        const message = args.join(' ');
        
        // Ignore noise from performance metrics in console
        if (message.includes('[PERF]') || message.includes('Cumulative Layout Shift') || message.includes('CLS')) {
          return;
        }

        this.captureWarning({
          type: 'console_warn',
          message: message,
          args: args
        });
        originalWarn.apply(console, args);
      };
    }
  }

  /**
   * Setup network error monitoring
   */
  setupNetworkMonitoring() {
    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url, options] = args;
      const startTime = performance.now();
      
      // Check if error tracking should be skipped for this request
      const skipErrorTracking = options?.headers?.['X-Skip-Error-Track'] === 'true';

      try {
        const response = await originalFetch.call(window, ...args);
        const duration = performance.now() - startTime;

        // Log slow requests
        if (duration > 3000) {
          this.capturePerformanceIssue({
            type: 'slow_request',
            url,
            duration,
            status: response.status
          });
        }

        // Log failed requests (skip if explicitly marked to skip error tracking)
        if (!response.ok && !skipErrorTracking) {
          this.captureNetworkError({
            url,
            method: options?.method || 'GET',
            status: response.status,
            statusText: response.statusText,
            duration
          });
        }

        return response;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        // Skip error tracking if explicitly marked
        if (!skipErrorTracking) {
          this.captureNetworkError({
            url,
            method: options?.method || 'GET',
            error: error.message,
            duration,
            failed: true
          });
        }

        throw error;
      }
    };

    // Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._errorTrackerUrl = url;
      this._errorTrackerMethod = method;
      this._errorTrackerStartTime = performance.now();
      return originalOpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        const duration = performance.now() - this._errorTrackerStartTime;
        
        if (this.status >= 400) {
          ErrorTracker.captureNetworkError({
            url: this._errorTrackerUrl,
            method: this._errorTrackerMethod,
            status: this.status,
            statusText: this.statusText,
            duration
          });
        }
      });

      this.addEventListener('error', function() {
        const duration = performance.now() - this._errorTrackerStartTime;
        
        ErrorTracker.captureNetworkError({
          url: this._errorTrackerUrl,
          method: this._errorTrackerMethod,
          error: 'Network request failed',
          duration,
          failed: true
        });
      });

      return originalSend.apply(this, args);
    };
  }

  /**
   * Setup resource error monitoring
   */
  setupResourceMonitoring() {
    // Monitor failed resource loads
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        const element = event.target;
        
        this.captureError({
          type: 'resource_error',
          message: `Failed to load resource: ${element.src || element.href}`,
          resource: {
            type: element.tagName,
            src: element.src || element.href,
            currentSrc: element.currentSrc
          }
        });
      }
    }, true);
  }

  /**
   * Capture error
   */
  captureError(errorData) {
    if (this._isCapturing) return;
    this._isCapturing = true;

    try {
      // Sample rate check
      if (Math.random() > this.config.sampleRate) return;

      const error = {
        ...errorData,
        id: this.generateErrorId(),
        timestamp: Date.now(),
        sessionId: this.sessionId,
        url: window.location.href,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        breadcrumbs: [...this.breadcrumbs],
        userContext: {...this.userContext},
        deviceContext: {...this.deviceContext}
      };

      // Add to errors array
      this.errors.push(error);

      // Trim if too many
      if (this.errors.length > this.config.maxErrors) {
        this.errors.shift();
      }

      // Track error count by type
      const errorKey = `${error.type}:${error.message}`;
      this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

      // Store in localStorage
      this.storeError(error);

      // Check alert threshold
      if (this.errors.length >= this.config.alertThreshold) {
        this.triggerAlert();
      }

      // Send to server
      if (this.config.sendToServer) {
        this.sendErrorToServer(error);
      }

      // Log to console in development
      if (window.location.hostname === 'localhost') {
        console.warn('📊 Error tracked:', error);
      }

      // Track in analytics
      if (typeof AIAnalytics !== 'undefined' && typeof AIAnalytics.track === 'function') {
        AIAnalytics.track('error_' + error.type, { message: error.message });
      }

      // Update state
      if (typeof StateManager !== 'undefined') {
        StateManager.set('errors.count', this.errors.length);
        StateManager.set('errors.latest', error);
      }

      this.lastErrorTimestamp = Date.now();
    } finally {
      this._isCapturing = false;
    }
  }

  /**
   * Capture warning
   */
  captureWarning(warningData) {
    if (this._isCapturing) return;
    
    // Ignore performance metrics to reduce noise in the error tracker
    const msg = (warningData.message || '').toString();
    if (msg.includes('[PERF]') || msg.includes('Cumulative Layout Shift') || msg.includes('CLS')) {
      return;
    }

    this._isCapturing = true;

    try {
      const warning = {
        ...warningData,
        id: this.generateErrorId(),
        timestamp: Date.now(),
        sessionId: this.sessionId,
        url: window.location.href
      };

      this.warnings.push(warning);

      if (this.warnings.length > this.config.maxErrors) {
        this.warnings.shift();
      }
    } finally {
      this._isCapturing = false;
    }
  }

  /**
   * Capture network error
   */
  captureNetworkError(errorData) {
    const error = {
      ...errorData,
      id: this.generateErrorId(),
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.networkErrors.push(error);

    if (this.networkErrors.length > this.config.maxErrors) {
      this.networkErrors.shift();
    }

    // Also add to main errors
    this.captureError({
      type: 'network_error',
      message: `${error.method} ${error.url} failed`,
      ...error
    });
  }

  /**
   * Capture performance issue
   */
  capturePerformanceIssue(issueData) {
    const issue = {
      ...issueData,
      id: this.generateErrorId(),
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.performanceIssues.push(issue);

    if (this.performanceIssues.length > this.config.maxErrors) {
      this.performanceIssues.shift();
    }

    // Log as warning
    this.captureWarning({
      type: 'performance',
      message: `${issue.type}: ${issue.duration.toFixed(0)}ms`
    });
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(category, message, data = {}) {
    if (!this.config.enableBreadcrumbs) return;

    const breadcrumb = {
      category,
      message,
      data,
      timestamp: Date.now(),
      url: window.location.href
    };

    this.breadcrumbs.push(breadcrumb);

    if (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Setup breadcrumb tracking
   */
  setupBreadcrumbTracking() {
    // Track navigation
    window.addEventListener('popstate', () => {
      this.addBreadcrumb('navigation', 'Browser back/forward', {
        url: window.location.href
      });
    });

    // Track clicks
    document.addEventListener('click', (e) => {
      const target = e.target;
      const text = target.textContent?.trim().substring(0, 50);
      
      this.addBreadcrumb('ui', 'Click', {
        element: target.tagName,
        text,
        id: target.id,
        class: target.className
      });
    });

    // Track form submissions
    document.addEventListener('submit', (e) => {
      this.addBreadcrumb('form', 'Form submitted', {
        id: e.target.id,
        action: e.target.action
      });
    });

    // Track AJAX requests
    if (typeof AIAnalytics !== 'undefined' && typeof AIAnalytics.trackEvent === 'function') {
      // Hook into analytics to track events as breadcrumbs
      const originalTrack = AIAnalytics.trackEvent.bind(AIAnalytics);
      AIAnalytics.trackEvent = (category, action, label) => {
        this.addBreadcrumb('analytics', `${category}.${action}`, { label });
        return originalTrack(category, action, label);
      };
    }
  }

  /**
   * Collect device context
   */
  async collectDeviceContext() {
    this.deviceContext = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
        orientation: screen.orientation?.type
      },
      window: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      memory: navigator.deviceMemory,
      cpuCores: navigator.hardwareConcurrency,
      connection: {
        type: navigator.connection?.effectiveType,
        downlink: navigator.connection?.downlink,
        rtt: navigator.connection?.rtt
      },
      touch: 'ontouchstart' in window
    };
  }

  /**
   * Collect user context
   */
  collectUserContext() {
    // Get user from state
    if (typeof StateManager !== 'undefined') {
      const user = StateManager.get('user');
      if (user) {
        this.userContext = {
          id: user.id,
          email: user.email,
          name: user.name
        };
      }
    }

    // Get from localStorage
    if (!this.userContext.id) {
      const userId = localStorage.getItem('userId');
      if (userId) {
        this.userContext.id = userId;
      }
    }
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generate error ID
   */
  generateErrorId() {
    return 'error_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Store error in localStorage
   */
  storeError(error) {
    try {
      const key = 'error_tracker_errors';
      let stored = JSON.parse(localStorage.getItem(key) || '[]');
      
      stored.push({
        id: error.id,
        type: error.type,
        message: error.message,
        timestamp: error.timestamp,
        url: error.url
      });

      // Keep only last 50
      if (stored.length > 50) {
        stored = stored.slice(-50);
      }

      localStorage.setItem(key, JSON.stringify(stored));
    } catch (e) {
      // Storage full or disabled
    }
  }

  /**
   * Load stored errors
   */
  loadStoredErrors() {
    try {
      const key = 'error_tracker_errors';
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const errors = JSON.parse(stored);
        
        // Count errors by type
        errors.forEach(error => {
          const errorKey = `${error.type}:${error.message}`;
          this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
        });
      }
    } catch (e) {
      console.error('Error loading stored errors:', e);
    }
  }

  /**
   * Send error to server
   */
  async sendErrorToServer(error) {
    try {
      // Remove circular references
      const payload = JSON.parse(JSON.stringify(error, (key, value) => {
        if (key === 'error' || key === 'promise') return undefined;
        return value;
      }));

      await fetch(this.config.serverEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Failed to send error to server:', e);
    }
  }

  /**
   * Trigger alert
   */
  triggerAlert() {
    console.error(`⚠️ Error threshold reached: ${this.errors.length} errors`);

    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Error Alert', {
        body: `${this.errors.length} errors detected in your session`,
        icon: '/assets/img/icon-192x192.png'
      });
    }

    // Update state
    if (typeof StateManager !== 'undefined') {
      StateManager.set('errors.alert', true);
    }
  }

  /**
   * Get all errors
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Sync error to backend for persistence
   */
  async syncToBackend(error) {
    if (!this.config.sendToServer) return;
    try {
      await fetch('/api/admin/errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'X-Skip-Error-Track': 'true'
        },
        body: JSON.stringify({
          id: error.id || `err_${Date.now()}`,
          type: error.type,
          message: error.message,
          stack: error.stack,
          page: error.url || window.location.href,
          timestamp: error.timestamp || new Date().toISOString(),
          userAgent: navigator.userAgent,
          userId: error.userId || null,
          sessionId: this.sessionId
        })
      });
    } catch (e) {
      // Silently fail - backend sync is optional
    }
  }

  /**
   * Clear all errors
   */
  clearErrors() {
    this.errors = [];
    this.warnings = [];
    this.networkErrors = [];
    this.performanceIssues = [];
    this.errorCounts.clear();
    localStorage.removeItem('errorTrackerErrors');
    console.log('[ErrorTracker] All errors cleared');
  }

  /**
   * Get error summary
   */
  getErrorSummary() {
    const summary = {
      total: this.errors.length,
      byType: {},
      byMessage: {},
      topErrors: [],
      recentErrors: this.errors.slice(-10),
      sessionId: this.sessionId
    };

    // Group by type
    this.errors.forEach(error => {
      summary.byType[error.type] = (summary.byType[error.type] || 0) + 1;
    });

    // Top errors by count
    summary.topErrors = Array.from(this.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));

    return summary;
  }

  /**
   * Get network error summary
   */
  getNetworkErrorSummary() {
    return {
      total: this.networkErrors.length,
      failed: this.networkErrors.filter(e => e.failed).length,
      byStatus: this.groupBy(this.networkErrors, 'status'),
      slowRequests: this.networkErrors.filter(e => e.duration > 3000).length,
      recentErrors: this.networkErrors.slice(-10)
    };
  }

  /**
   * Get performance issue summary
   */
  getPerformanceIssueSummary() {
    return {
      total: this.performanceIssues.length,
      byType: this.groupBy(this.performanceIssues, 'type'),
      avgDuration: this.performanceIssues.reduce((sum, i) => sum + i.duration, 0) / 
                   (this.performanceIssues.length || 1),
      recentIssues: this.performanceIssues.slice(-10)
    };
  }

  /**
   * Get full report
   */
  getReport() {
    return {
      session: {
        id: this.sessionId,
        startTime: this.sessionStartTime,
        duration: Date.now() - (this.sessionStartTime || Date.now())
      },
      errors: this.getErrorSummary(),
      networkErrors: this.getNetworkErrorSummary(),
      performance: this.getPerformanceIssueSummary(),
      warnings: {
        total: this.warnings.length,
        recent: this.warnings.slice(-10)
      },
      device: this.deviceContext,
      user: this.userContext
    };
  }

  /**
   * Export errors as JSON
   */
  exportErrors() {
    const report = this.getReport();
    const json = JSON.stringify(report, null, 2);
    
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-report-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Clear errors
   */
  clearErrors() {
    this.errors = [];
    this.warnings = [];
    this.networkErrors = [];
    this.performanceIssues = [];
    this.errorCounts.clear();
    
    localStorage.removeItem('error_tracker_errors');

    if (typeof StateManager !== 'undefined') {
      StateManager.set('errors.count', 0);
      StateManager.set('errors.alert', false);
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    // Clear old errors every hour
    setInterval(() => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      this.errors = this.errors.filter(e => e.timestamp > oneHourAgo);
      this.networkErrors = this.networkErrors.filter(e => e.timestamp > oneHourAgo);
      this.performanceIssues = this.performanceIssues.filter(e => e.timestamp > oneHourAgo);
      
    }, 60 * 60 * 1000);
  }

  /**
   * Utility: Group array by property
   */
  groupBy(array, property) {
    return array.reduce((acc, item) => {
      const key = item[property] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Test error capture (for development)
   */
  testErrorCapture() {
    console.log('Testing error capture...');
    
    // Test regular error
    setTimeout(() => {
      throw new Error('Test error from ErrorTracker');
    }, 100);

    // Test promise rejection
    setTimeout(() => {
      Promise.reject(new Error('Test promise rejection'));
    }, 200);

    // Test network error
    setTimeout(() => {
      fetch('/api/nonexistent-endpoint');
    }, 300);

    console.log('Error tests triggered');
  }
}

// Create global instance
window.ErrorTracker = new ErrorTracker();

// Static method for network errors
ErrorTracker.captureNetworkError = function(errorData) {
  if (window.ErrorTracker) {
    window.ErrorTracker.captureNetworkError(errorData);
  }
};

// Create global instance
window.ErrorTracker = window.ErrorTracker || new ErrorTracker();
window.errorTracker = window.ErrorTracker;

// Auto-initialize
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ErrorTracker.init();
    
    // Track session start time
    window.ErrorTracker.sessionStartTime = Date.now();
  });
}
