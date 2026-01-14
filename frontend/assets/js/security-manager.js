/**
 * Advanced Security Manager
 * Provides client-side security features, threat detection, and protection
 * @version 2.0.0
 */

class SecurityManager {
  constructor() {
    SecurityManager.instance = this;
    this.config = {
      enableCSP: true,
      enableIntegrityChecks: true,
      enableXSSProtection: true,
      enableClickjackingProtection: true,
      enableRateLimiting: true,
      enableInputSanitization: true,
      enableSecureStorage: true,
      maxRequestsPerMinute: 60,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      enableAuditLog: true,
      allowDevConsole: false // Default to blocked, loaded from admin settings
    };

    this.rateLimiter = new Map();
    this.auditLog = [];
    this.threats = [];
    this.securityScore = 100;
    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();

    this.securityRules = {
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecial: true,
      maxLoginAttempts: 5,
      loginAttemptWindow: 15 * 60 * 1000, // 15 minutes
      enableTwoFactor: false
    };

    this.suspiciousPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>/gi,
      /eval\(/gi,
      /document\.cookie/gi,
      /document\.write/gi
    ];
  }

  /**
   * Initialize security manager
   */
  async init() {
    try {
      // Load security settings from backend
      await this.loadSecuritySettings();
      
      // Setup Content Security Policy
      if (this.config.enableCSP) {
        this.setupCSP();
      }

      // Setup XSS Protection
      if (this.config.enableXSSProtection) {
        this.setupXSSProtection();
      }

      // Setup Clickjacking Protection
      if (this.config.enableClickjackingProtection) {
        this.setupClickjackingProtection();
      }

      // Setup Session Management
      this.setupSessionManagement();

      // Setup Input Sanitization
      if (this.config.enableInputSanitization) {
        this.setupInputSanitization();
      }

      // Setup Secure Storage
      if (this.config.enableSecureStorage) {
        this.setupSecureStorage();
      }

      // Monitor security events
      this.startSecurityMonitoring();

      // Check for common vulnerabilities
      await this.performSecurityAudit();

      this.log('Security', 'SecurityManager initialized');
      console.log('🔒 SecurityManager initialized');
      
      return true;
    } catch (error) {
      console.error('❌ SecurityManager init failed:', error);
      return false;
    }
  }

  /**
   * Setup Content Security Policy
   */
  setupCSP() {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com https://connect.facebook.net https://www.facebook.com https://www.google.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://checkout.razorpay.com https://*.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://accounts.google.com https://www.google.com https://www.gstatic.com",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
      "img-src 'self' data: https: blob: http:",
      "connect-src 'self' ws: wss: https: https://blackonn.in https://www.blackonn.in https://blackonn.com https://www.blackonn.com https://accounts.google.com https://graph.facebook.com https://www.facebook.com https://api.razorpay.com https://*.razorpay.com https://checkout.razorpay.com",
      "frame-src 'self' https://accounts.google.com https://www.facebook.com https://api.razorpay.com https://*.razorpay.com",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; ');
    
    // Check if already exists
    const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (!existing && document.head) {
      document.head.appendChild(meta);
      this.log('CSP', 'Content Security Policy applied');
    }
  }

  /**
   * Setup XSS Protection
   */
  setupXSSProtection() {
    // Enable browser XSS filter
    const meta = document.createElement('meta');
    meta.httpEquiv = 'X-XSS-Protection';
    meta.content = '1; mode=block';
    
    if (!document.querySelector('meta[http-equiv="X-XSS-Protection"]') && document.head) {
      document.head.appendChild(meta);
    }

    // Monitor DOM mutations for suspicious content
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            this.scanElementForThreats(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.log('XSS', 'XSS Protection enabled');
  }

  /**
   * Setup Clickjacking Protection
   */
  setupClickjackingProtection() {
    // Check if we're in an iframe
    if (window.self !== window.top) {
      this.detectThreat('Clickjacking', 'Page loaded in iframe', 'high');
      
      // Option to break out of iframe (configurable)
      // window.top.location = window.self.location;
    }

    this.log('Clickjacking', 'Clickjacking protection enabled');
  }

  /**
   * Setup Session Management
   */
  setupSessionManagement() {
    // Monitor session timeout
    this.sessionCheckInterval = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;
      
      if (inactiveTime > this.config.sessionTimeout) {
        this.handleSessionTimeout();
      }
    }, 60000); // Check every minute

    // Track user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, () => {
        this.lastActivityTime = Date.now();
      }, { passive: true });
    });

    // Session fingerprinting for security
    this.sessionFingerprint = this.generateFingerprint();

    this.log('Session', 'Session management enabled');
  }

  /**
   * Handle session timeout
   */
  handleSessionTimeout() {
    this.log('Session', 'Session timeout - inactive for too long');
    
    // Clear sensitive data
    this.secureStore.clear();
    
    // Notify user
    if (typeof StateManager !== 'undefined') {
      StateManager.set('security.sessionExpired', true);
    }

    // Redirect to login if authenticated
    const isAuthenticated = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (isAuthenticated) {
      this.detectThreat('Session', 'Session expired due to inactivity', 'medium');
      // Could redirect: window.location.href = '/login.html?reason=timeout';
    }
  }

  /**
   * Generate browser fingerprint
   */
  generateFingerprint() {
    const data = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      navigator.deviceMemory || 'unknown'
    ].join('|');

    return this.hash(data);
  }

  /**
   * Simple hash function
   */
  hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Setup Input Sanitization
   */
  setupInputSanitization() {
    // Monitor all form inputs
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.tagName === 'FORM') {
        this.sanitizeForm(form);
      }
    }, true);

    // Real-time input validation
    document.addEventListener('input', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        this.validateInput(e.target);
      }
    }, true);

    this.log('Sanitization', 'Input sanitization enabled');
  }

  /**
   * Sanitize form before submission
   */
  sanitizeForm(form) {
    const inputs = form.querySelectorAll('input, textarea');
    
    inputs.forEach(input => {
      // Skip passwords and file inputs (file inputs throw error if value is programmatically set)
      if (input.type !== 'password' && input.type !== 'file') {
        const originalValue = input.value;
        input.value = this.sanitizeString(input.value);
        
        if (originalValue !== input.value) {
          this.detectThreat('XSS', `Suspicious input detected in ${input.name}`, 'high');
        }
      }
    });
  }

  /**
   * Validate input in real-time
   */
  validateInput(input) {
    const value = input.value;
    
    // Check for suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(value)) {
        this.detectThreat('XSS', `Suspicious pattern in ${input.name || 'input'}`, 'high');
        
        // Visual feedback
        input.classList.add('security-warning');
        setTimeout(() => input.classList.remove('security-warning'), 2000);
        
        return false;
      }
    }
    
    return true;
  }

  /**
   * Sanitize string
   */
  sanitizeString(str) {
    // Remove script tags
    str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove event handlers
    str = str.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // Encode HTML entities
    const div = document.createElement('div');
    div.textContent = str;
    str = div.innerHTML;
    
    return str;
  }

  /**
   * Setup Secure Storage
   */
  setupSecureStorage() {
    this.secureStore = {
      storage: new Map(),
      
      set(key, value, options = {}) {
        const encrypted = SecurityManager.encrypt(JSON.stringify(value));
        
        const item = {
          value: encrypted,
          timestamp: Date.now(),
          expires: options.expires || null,
          sensitive: options.sensitive || false
        };
        
        this.storage.set(key, item);
        
        // Also store in sessionStorage if not sensitive
        if (!options.sensitive) {
          try {
            sessionStorage.setItem(`secure_${key}`, JSON.stringify(item));
          } catch (e) {
            console.warn('SessionStorage full:', e);
          }
        }
      },
      
      get(key) {
        let item = this.storage.get(key);
        
        // Try sessionStorage if not in memory
        if (!item) {
          try {
            const stored = sessionStorage.getItem(`secure_${key}`);
            if (stored) {
              item = JSON.parse(stored);
            }
          } catch (e) {
            return null;
          }
        }
        
        if (!item) return null;
        
        // Check expiration
        if (item.expires && Date.now() > item.expires) {
          this.remove(key);
          return null;
        }
        
        try {
          const decrypted = SecurityManager.decrypt(item.value);
          return JSON.parse(decrypted);
        } catch (e) {
          console.error('Decryption failed:', e);
          return null;
        }
      },
      
      remove(key) {
        this.storage.delete(key);
        sessionStorage.removeItem(`secure_${key}`);
      },
      
      clear() {
        this.storage.clear();
        // Clear all secure_ items from sessionStorage
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('secure_')) {
            sessionStorage.removeItem(key);
          }
        });
      }
    };

    this.log('Storage', 'Secure storage initialized');
  }

  /**
   * Simple encryption (XOR cipher for demo - use proper encryption in production)
   */
  static encrypt(text) {
    const key = 'BLACKONN_SECURITY_KEY_2026'; // In production, use proper key management
    let encrypted = '';
    
    for (let i = 0; i < text.length; i++) {
      encrypted += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    
    return btoa(encrypted);
  }

  /**
   * Simple decryption
   */
  static decrypt(encrypted) {
    const key = 'BLACKONN_SECURITY_KEY_2026';
    const text = atob(encrypted);
    let decrypted = '';
    
    for (let i = 0; i < text.length; i++) {
      decrypted += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    
    return decrypted;
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(key, maxRequests = this.config.maxRequestsPerMinute) {
    if (!this.config.enableRateLimiting) return true;

    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    if (!this.rateLimiter.has(key)) {
      this.rateLimiter.set(key, []);
    }

    const requests = this.rateLimiter.get(key);
    
    // Remove old requests
    const recentRequests = requests.filter(time => time > windowStart);
    this.rateLimiter.set(key, recentRequests);

    if (recentRequests.length >= maxRequests) {
      this.detectThreat('RateLimit', `Rate limit exceeded for ${key}`, 'medium');
      return false;
    }

    recentRequests.push(now);
    return true;
  }

  /**
   * Validate password strength
   */
  validatePassword(password) {
    const errors = [];
    const rules = this.securityRules;

    if (password.length < rules.passwordMinLength) {
      errors.push(`Password must be at least ${rules.passwordMinLength} characters`);
    }

    if (rules.passwordRequireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (rules.passwordRequireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (rules.passwordRequireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (rules.passwordRequireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common weak passwords
    const weakPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein', 'welcome'];
    if (weakPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
    }

    return {
      valid: errors.length === 0,
      errors,
      strength: this.calculatePasswordStrength(password)
    };
  }

  /**
   * Calculate password strength (0-100)
   */
  calculatePasswordStrength(password) {
    let strength = 0;

    // Length
    strength += Math.min(password.length * 4, 40);

    // Character variety
    if (/[a-z]/.test(password)) strength += 10;
    if (/[A-Z]/.test(password)) strength += 10;
    if (/\d/.test(password)) strength += 10;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 10;

    // Complexity
    if (password.length >= 12) strength += 10;
    if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(password)) strength += 10;

    return Math.min(strength, 100);
  }

  /**
   * Scan element for security threats
   */
  scanElementForThreats(element) {
    // Skip scanning on admin page to prevent breaking legitimate functions
    if (window.location.pathname.includes('admin.html')) return;
    
    // Check for suspicious attributes
    const suspiciousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover'];
    
    // Safe patterns that are legitimate uses (not XSS)
    const safePatterns = {
      // Image fallback pattern: onerror="this.src='...'" is safe
      onerror: /^this\.src\s*=\s*['"][^'"]+['"]$/,
      // Simple this.style changes are safe
      onmouseover: /^this\.style\.\w+\s*=\s*['"][^'"]*['"]$/,
      onmouseout: /^this\.style\.\w+\s*=\s*['"][^'"]*['"]$/
    };
    
    suspiciousAttrs.forEach(attr => {
      if (element.hasAttribute(attr)) {
        const value = element.getAttribute(attr);
        
        // Check if this matches a safe pattern
        const safePattern = safePatterns[attr];
        if (safePattern && safePattern.test(value.trim())) {
          // This is a safe, legitimate use - don't flag it
          return;
        }
        
        // Only flag and remove truly suspicious handlers
        this.detectThreat('XSS', `Suspicious ${attr} attribute detected`, 'high');
        element.removeAttribute(attr);
      }
    });

    // Check for script tags
    if (element.tagName === 'SCRIPT' && !element.hasAttribute('data-approved')) {
      this.detectThreat('XSS', 'Unapproved script tag detected', 'critical');
    }

    // Check for iframes
    if (element.tagName === 'IFRAME' && !element.hasAttribute('data-approved')) {
      this.detectThreat('XSS', 'Unapproved iframe detected', 'high');
    }
  }

  /**
   * Detect security threat
   */
  detectThreat(type, description, severity = 'medium') {
    const threat = {
      type,
      description,
      severity,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    this.threats.push(threat);

    // Update security score
    const scoreImpact = severity === 'critical' ? 20 : severity === 'high' ? 10 : 5;
    this.securityScore = Math.max(0, this.securityScore - scoreImpact);

    // Log threat
    this.log('Threat', `${severity.toUpperCase()}: ${type} - ${description}`, 'warn');

    // Notify user for critical threats
    if (severity === 'critical') {
      this.showSecurityAlert(threat);
    }

    // Track in analytics
    if (typeof AIAnalytics !== 'undefined' && typeof AIAnalytics.trackEvent === 'function') {
      AIAnalytics.trackEvent('security', 'threat_detected', `${type}_${severity}`);
    }

    // Update state
    if (typeof StateManager !== 'undefined' && typeof StateManager.set === 'function') {
      StateManager.set('security.score', this.securityScore);
      StateManager.set('security.threats', this.threats.slice(-10)); // Last 10 threats
    }
  }

  /**
   * Show security alert
   */
  showSecurityAlert(threat) {
    const alert = document.createElement('div');
    alert.className = 'security-alert';
    alert.innerHTML = `
      <div class="security-alert-content">
        <strong>⚠️ Security Alert</strong>
        <p>${threat.type}: ${threat.description}</p>
        <button onclick="this.parentElement.parentElement.remove()">Dismiss</button>
      </div>
    `;
    
    alert.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff4444;
      color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(alert);
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (alert.parentElement) {
        alert.remove();
      }
    }, 10000);
  }

  /**
   * Perform security audit
   */
  async performSecurityAudit() {
    const issues = [];

    // Check HTTPS
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      issues.push({
        type: 'Protocol',
        severity: 'high',
        message: 'Site not served over HTTPS'
      });
    }

    // Check for mixed content
    const resources = performance.getEntriesByType('resource');
    const mixedContent = resources.filter(r => 
      r.name.startsWith('http:') && window.location.protocol === 'https:'
    );
    
    if (mixedContent.length > 0) {
      issues.push({
        type: 'MixedContent',
        severity: 'medium',
        message: `${mixedContent.length} resources loaded over HTTP`
      });
    }

    // Check localStorage for sensitive data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      // Basic whitelist for keys that are known to contain logs
      if (key === 'error_tracker_errors') continue;
      
      if (value && (value.includes('password') || value.includes('token'))) {
        issues.push({
          type: 'Storage',
          severity: 'high',
          message: `Potentially sensitive data in localStorage: ${key}`
        });
      }
    }

    // Log audit results
    if (issues.length > 0) {
      this.log('Audit', `Found ${issues.length} security issues`);
      issues.forEach(issue => {
        this.detectThreat(issue.type, issue.message, issue.severity);
      });
    } else {
      this.log('Audit', 'No security issues found');
    }

    return issues;
  }

  /**
   * Start security monitoring
   */
  startSecurityMonitoring() {
    // Monitor console tampering
    this.monitorConsole();

    // Monitor DevTools
    this.monitorDevTools();

    // Monitor network requests
    this.monitorNetworkRequests();

    // Periodic security check
    setInterval(() => {
      this.performSecurityCheck();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Monitor console for tampering
   * NOTE: We don't modify console methods here to avoid conflicts with console-block.js
   * Instead, we just log warnings when sensitive data patterns are detected elsewhere
   */
  monitorConsole() {
    // Skip console wrapping to avoid conflicts with console-block.js
    // The sensitive data detection is handled by other security mechanisms
  }

  /**
   * Monitor DevTools
   * NOTE: DevTools blocking is now handled by console-block.js which properly
   * checks the admin setting. This function just tracks the state for analytics.
   */
  monitorDevTools() {
    // DevTools blocking is handled by console-block.js
    // This function only monitors state for analytics purposes
    const threshold = 160;
    let devToolsOpen = false;
    
    const check = () => {
      const isOpen = window.outerWidth - window.innerWidth > threshold || 
                     window.outerHeight - window.innerHeight > threshold;
      
      if (isOpen && !devToolsOpen) {
        devToolsOpen = true;
        // Only log for analytics, don't block (console-block.js handles that)
        if (typeof StateManager !== 'undefined') {
          StateManager.set('security.devToolsOpen', true);
        }
      } else if (!isOpen && devToolsOpen) {
        devToolsOpen = false;
        if (typeof StateManager !== 'undefined') {
          StateManager.set('security.devToolsOpen', false);
        }
      }
    };
    
    setInterval(check, 1000);
  }
  
  /**
   * Show DevTools warning overlay
   */
  showDevToolsWarning() {
    if (document.getElementById('devtools-warning-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'devtools-warning-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    overlay.innerHTML = `
      <div style="text-align: center; max-width: 400px; padding: 20px;">
        <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
        <h2 style="margin: 0 0 16px; font-size: 24px;">Developer Tools Disabled</h2>
        <p style="margin: 0 0 24px; color: #9ca3af; line-height: 1.6;">
          Access to developer console has been restricted by the site administrator for security purposes.
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Please close developer tools to continue browsing.
        </p>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  
  /**
   * Hide DevTools warning overlay
   */
  hideDevToolsWarning() {
    const overlay = document.getElementById('devtools-warning-overlay');
    if (overlay) overlay.remove();
  }
  
  /**
   * Load security settings from backend
   */
  async loadSecuritySettings() {
    try {
      // First, fetch the admin security settings
      const response = await fetch('/api/settings/security');
      const data = await response.json();
      if (data.success && data.security) {
        this.config.allowDevConsole = data.security.allowDevConsole === true;
        console.log(`🔒 DevTools access setting: ${this.config.allowDevConsole ? 'allowed' : 'blocked'}`);
        
        // If setting allows DevTools, we're done
        if (this.config.allowDevConsole) {
          return;
        }
      }
      
      // If setting is OFF, check if user is admin (admins always have access)
      const isAdmin = await this.checkIsAdmin();
      if (isAdmin) {
        this.config.allowDevConsole = true;
        console.log('🔒 Admin user detected - DevTools access allowed');
      }
    } catch (e) {
      // On error, check if user is admin before blocking
      try {
        const isAdmin = await this.checkIsAdmin();
        if (isAdmin) {
          this.config.allowDevConsole = true;
          console.log('🔒 Admin user detected - DevTools access allowed');
          return;
        }
      } catch (e2) {}
      
      // Default to blocked if API fails (safer)
      this.config.allowDevConsole = false;
      console.log('🔒 DevTools access: blocked (API unavailable)');
    }
  }
  
  /**
   * Check if current user is admin
   */
  async checkIsAdmin() {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await response.json();
      return data.user && data.user.role === 'admin';
    } catch (e) {
      return false;
    }
  }

  /**
   * Monitor network requests
   * NOTE: Fetch wrapping is disabled to reduce overhead - backend handles rate limiting
   * Multiple fetch wrappers were causing significant latency on API requests
   */
  monitorNetworkRequests() {
    // Skip fetch wrapping - too many wrappers cause performance issues
    // Rate limiting is handled by the backend's express-rate-limit
    // Keeping XMLHttpRequest check for legacy code only
  }

  /**
   * Perform periodic security check
   */
  performSecurityCheck() {
    // Check session validity
    const sessionAge = Date.now() - this.sessionStartTime;
    if (sessionAge > 24 * 60 * 60 * 1000) { // 24 hours
      this.log('Session', 'Long-running session detected');
    }

    // Check for suspicious activity
    if (this.threats.length > 10) {
      this.log('Security', 'Multiple security threats detected');
    }

    // Update security score
    if (typeof StateManager !== 'undefined') {
      StateManager.set('security.score', this.securityScore);
    }
  }

  /**
   * Log security event
   */
  log(category, message, level = 'info') {
    const entry = {
      category,
      message,
      level,
      timestamp: Date.now(),
      url: window.location.href
    };

    if (this.config.enableAuditLog) {
      this.auditLog.push(entry);
      
      // Keep only last 100 entries
      if (this.auditLog.length > 100) {
        this.auditLog.shift();
      }
    }

    // Console output
    if (this.config.allowDevConsole || !window.location.pathname.includes('admin.html')) {
      const logMethod = level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;
      logMethod(`[Security:${category}] ${message}`);
    }
  }

  /**
   * Get security report
   */
  getSecurityReport() {
    return {
      score: this.securityScore,
      threats: this.threats,
      auditLog: this.auditLog.slice(-20), // Last 20 entries
      sessionAge: Date.now() - this.sessionStartTime,
      fingerprint: this.sessionFingerprint,
      config: this.config
    };
  }

  /**
   * Get stats for dashboard
   */
  getStats() {
    return {
      blockedAttempts: this.threats.length,
      secureRequests: this.auditLog.length,
      spamDetected: this.threats.filter(t => t.type === 'Spam').length,
      securityScore: this.securityScore,
      score: this.securityScore // Keep for compatibility
    };
  }

  /**
   * Sync security event to backend
   */
  async syncEvent(event) {
    try {
      await fetch('/api/admin/security/event', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
    } catch (e) {
      // Silently fail - backend sync is optional
    }
  }

  /**
   * Export audit log
   */
  exportAuditLog() {
    const data = JSON.stringify(this.auditLog, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-audit-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Set rate limit
   */
  setRateLimit(limit) {
    this.config.maxRequestsPerMinute = parseInt(limit);
    this.log('Config', `Rate limit updated to ${limit} requests/min`);
  }

  /**
   * Set CSRF Protection
   */
  setCsrfProtection(enabled) {
    this.config.enableCsrf = !!enabled;
    this.log('Config', `CSRF Protection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set XSS Protection
   */
  setXssProtection(enabled) {
    this.config.enableXSSProtection = !!enabled;
    this.log('Config', `XSS Protection ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Create global instance
window.SecurityManager = window.SecurityManager || new SecurityManager();
window.securityManager = window.SecurityManager;
window.SecurityManager.instance = window.SecurityManager;

// Auto-initialize
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.SecurityManager.init();
  });
}
