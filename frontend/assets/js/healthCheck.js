/**
 * Health Check Client Utility
 * Monitor server health from the frontend
 */

const HealthCheck = {
  // Base API URL
  baseUrl: '/api/health',
  
  // Check intervals
  intervals: {},
  
  // Callbacks
  callbacks: {
    onHealthy: null,
    onUnhealthy: null,
    onError: null
  },

  /**
   * Quick health check
   * @returns {Promise<Object>} Health status
   */
  async check() {
    try {
      const response = await fetch(`${this.baseUrl}`);
      const data = await response.json();
      return {
        ok: response.ok,
        ...data
      };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: 'Failed to connect to server',
        error: error.message
      };
    }
  },

  /**
   * Detailed health check
   * @returns {Promise<Object>} Detailed health status
   */
  async checkDetailed() {
    try {
      const response = await fetch(`${this.baseUrl}/detailed`);
      const data = await response.json();
      return {
        ok: response.ok,
        ...data
      };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: 'Failed to get detailed health',
        error: error.message
      };
    }
  },

  /**
   * Liveness check
   * @returns {Promise<boolean>} True if server is alive
   */
  async isAlive() {
    try {
      const response = await fetch(`${this.baseUrl}/live`);
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  /**
   * Readiness check
   * @returns {Promise<boolean>} True if server is ready
   */
  async isReady() {
    try {
      const response = await fetch(`${this.baseUrl}/ready`);
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  /**
   * Ping the server
   * @returns {Promise<number>} Response time in milliseconds
   */
  async ping() {
    const start = performance.now();
    try {
      const response = await fetch(`${this.baseUrl}/ping`);
      if (response.ok) {
        return Math.round(performance.now() - start);
      }
      return -1;
    } catch (error) {
      return -1;
    }
  },

  /**
   * Get server metrics
   * @returns {Promise<Object>} Server metrics
   */
  async getMetrics() {
    try {
      const response = await fetch(`${this.baseUrl}/metrics`);
      return await response.json();
    } catch (error) {
      return null;
    }
  },

  /**
   * Start periodic health monitoring
   * @param {number} intervalMs - Check interval in milliseconds
   * @param {Function} callback - Callback function with health status
   * @returns {string} Monitor ID
   */
  startMonitoring(intervalMs = 30000, callback) {
    const id = 'monitor_' + Date.now();
    
    const checkHealth = async () => {
      const health = await this.check();
      
      if (callback) {
        callback(health);
      }
      
      if (health.ok && this.callbacks.onHealthy) {
        this.callbacks.onHealthy(health);
      } else if (!health.ok && this.callbacks.onUnhealthy) {
        this.callbacks.onUnhealthy(health);
      }
    };
    
    // Initial check
    checkHealth();
    
    // Set interval
    this.intervals[id] = setInterval(checkHealth, intervalMs);
    
    return id;
  },

  /**
   * Stop health monitoring
   * @param {string} id - Monitor ID to stop
   */
  stopMonitoring(id) {
    if (this.intervals[id]) {
      clearInterval(this.intervals[id]);
      delete this.intervals[id];
    }
  },

  /**
   * Stop all monitoring
   */
  stopAllMonitoring() {
    Object.keys(this.intervals).forEach(id => {
      clearInterval(this.intervals[id]);
    });
    this.intervals = {};
  },

  /**
   * Set callback for healthy status
   * @param {Function} callback
   */
  onHealthy(callback) {
    this.callbacks.onHealthy = callback;
  },

  /**
   * Set callback for unhealthy status
   * @param {Function} callback
   */
  onUnhealthy(callback) {
    this.callbacks.onUnhealthy = callback;
  },

  /**
   * Show health status indicator in UI
   * @param {string} containerId - Container element ID
   */
  showIndicator(containerId = 'health-indicator') {
    let container = document.getElementById(containerId);
    
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 15px;
        border-radius: 8px;
        font-size: 12px;
        font-family: system-ui, sans-serif;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        transition: all 0.3s ease;
      `;
      document.body.appendChild(container);
    }
    
    const updateIndicator = (health) => {
      const isHealthy = health.ok && health.status === 'healthy';
      
      container.style.backgroundColor = isHealthy ? '#e8f5e9' : '#ffebee';
      container.style.color = isHealthy ? '#2e7d32' : '#c62828';
      container.style.border = `1px solid ${isHealthy ? '#a5d6a7' : '#ef9a9a'}`;
      
      container.innerHTML = `
        <span style="
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${isHealthy ? '#4caf50' : '#f44336'};
          animation: ${isHealthy ? 'none' : 'pulse 1s infinite'};
        "></span>
        <span>Server: ${isHealthy ? 'Healthy' : 'Issues Detected'}</span>
        ${health.uptime ? `<span style="opacity: 0.7;">| Uptime: ${health.uptime}</span>` : ''}
      `;
    };
    
    // Add pulse animation
    if (!document.getElementById('health-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'health-indicator-styles';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Start monitoring and update indicator
    this.startMonitoring(30000, updateIndicator);
  },

  /**
   * Hide health status indicator
   */
  hideIndicator() {
    const container = document.getElementById('health-indicator');
    if (container) {
      container.remove();
    }
    this.stopAllMonitoring();
  }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HealthCheck;
}

// Make available globally
window.HealthCheck = HealthCheck;
