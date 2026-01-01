/**
 * BLACKONN Frontend Security Utilities
 * Client-side security measures for the e-commerce website
 */

const BlackonnSecurity = (() => {
  'use strict';

  // ============ XSS PROTECTION ============
  
  /**
   * Sanitize HTML to prevent XSS attacks
   * @param {string} str - String to sanitize
   * @returns {string} Sanitized string
   */
  const sanitizeHTML = (str) => {
    if (typeof str !== 'string') return str;
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  };

  /**
   * Escape HTML entities
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };
    return str.replace(/[&<>"'`=\/]/g, char => escapeMap[char]);
  };

  /**
   * Safe innerHTML setter - sanitizes content before inserting
   * @param {HTMLElement} element - Target element
   * @param {string} html - HTML content to insert
   */
  const safeInnerHTML = (element, html) => {
    if (!element) return;
    // Create a document fragment to parse HTML safely
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Remove dangerous elements
    const dangerous = doc.querySelectorAll('script, iframe, object, embed, link[rel="import"]');
    dangerous.forEach(el => el.remove());
    
    // Remove dangerous attributes
    doc.body.querySelectorAll('*').forEach(el => {
      // Remove event handlers
      [...el.attributes].forEach(attr => {
        if (attr.name.startsWith('on') || attr.value.includes('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    element.innerHTML = doc.body.innerHTML;
  };

  // ============ INPUT VALIDATION ============
  
  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  const isValidEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) && email.length <= 255;
  };

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {object} Validation result with strength score
   */
  const validatePassword = (password) => {
    const result = {
      valid: false,
      strength: 0,
      messages: []
    };

    if (!password || password.length < 8) {
      result.messages.push('Password must be at least 8 characters');
    } else {
      result.strength += 1;
    }

    if (!/[a-z]/.test(password)) {
      result.messages.push('Include lowercase letter');
    } else {
      result.strength += 1;
    }

    if (!/[A-Z]/.test(password)) {
      result.messages.push('Include uppercase letter');
    } else {
      result.strength += 1;
    }

    if (!/\d/.test(password)) {
      result.messages.push('Include a number');
    } else {
      result.strength += 1;
    }

    if (!/[@$!%*?&]/.test(password)) {
      result.messages.push('Include special character (@$!%*?&)');
    } else {
      result.strength += 1;
    }

    result.valid = result.strength >= 4;
    return result;
  };

  /**
   * Validate phone number
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid
   */
  const isValidPhone = (phone) => {
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    return /^\d{10,15}$/.test(cleaned);
  };

  /**
   * Validate name format
   * @param {string} name - Name to validate
   * @returns {boolean} True if valid
   */
  const isValidName = (name) => {
    return name && 
           name.trim().length >= 2 && 
           name.trim().length <= 100 &&
           /^[a-zA-Z\s\-'\.]+$/.test(name.trim());
  };

  /**
   * Sanitize form data object
   * @param {object} data - Form data object
   * @returns {object} Sanitized data
   */
  const sanitizeFormData = (data) => {
    const sanitized = {};
    for (const key in data) {
      if (typeof data[key] === 'string') {
        sanitized[key] = data[key]
          .trim()
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else {
        sanitized[key] = data[key];
      }
    }
    return sanitized;
  };

  // ============ SESSION STORAGE (for temp UI state only) ============
  
  /**
   * Session storage wrapper for temporary UI data
   * NOTE: Not for sensitive data - only for UI state that should persist during session
   */
  const sessionStore = {
    set: (key, value) => {
      try {
        const data = JSON.stringify(value);
        sessionStorage.setItem(key, data);
        return true;
      } catch {
        return false;
      }
    },
    
    get: (key) => {
      try {
        const stored = sessionStorage.getItem(key);
        if (!stored) return null;
        return JSON.parse(stored);
      } catch {
        return null;
      }
    },
    
    remove: (key) => {
      sessionStorage.removeItem(key);
    },
    
    clear: () => {
      sessionStorage.clear();
    }
  };

  // ============ RATE LIMITING (CLIENT-SIDE) ============
  
  const rateLimits = {};

  /**
   * Client-side rate limiting to prevent rapid button clicks
   * @param {string} action - Action identifier
   * @param {number} limit - Max attempts
   * @param {number} windowMs - Time window in milliseconds
   * @returns {boolean} True if action is allowed
   */
  const checkRateLimit = (action, limit = 5, windowMs = 60000) => {
    const now = Date.now();
    
    if (!rateLimits[action]) {
      rateLimits[action] = { count: 0, resetAt: now + windowMs };
    }
    
    if (now > rateLimits[action].resetAt) {
      rateLimits[action] = { count: 0, resetAt: now + windowMs };
    }
    
    rateLimits[action].count++;
    
    return rateLimits[action].count <= limit;
  };

  // ============ CSRF PROTECTION ============
  
  /**
   * Generate a CSRF token
   * @returns {string} CSRF token
   */
  const generateCSRFToken = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  /**
   * Get or create CSRF token
   * @returns {string} CSRF token
   */
  const getCSRFToken = () => {
    let token = sessionStorage.getItem('csrf_token');
    if (!token) {
      token = generateCSRFToken();
      sessionStorage.setItem('csrf_token', token);
    }
    return token;
  };

  // ============ CONTENT SECURITY ============
  
  /**
   * Validate URL to prevent open redirects
   * @param {string} url - URL to validate
   * @returns {boolean} True if URL is safe
   */
  const isSafeRedirect = (url) => {
    if (!url) return false;
    
    // Allow relative URLs
    if (url.startsWith('/') && !url.startsWith('//')) {
      return true;
    }
    
    // Allow same-origin URLs
    try {
      const urlObj = new URL(url, window.location.origin);
      return urlObj.origin === window.location.origin;
    } catch {
      return false;
    }
  };

  /**
   * Safe redirect function
   * @param {string} url - URL to redirect to
   * @param {string} fallback - Fallback URL if unsafe
   */
  const safeRedirect = (url, fallback = '/') => {
    if (isSafeRedirect(url)) {
      window.location.href = url;
    } else {
      console.warn('Blocked unsafe redirect to:', url);
      window.location.href = fallback;
    }
  };

  // ============ SESSION TIMEOUT ============
  
  let sessionTimeout = null;
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Reset session timeout timer
   */
  const resetSessionTimeout = () => {
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
    }
    
    sessionTimeout = setTimeout(() => {
      // Dispatch session timeout event
      window.dispatchEvent(new CustomEvent('session:timeout'));
      console.warn('Session timeout - user inactive');
    }, SESSION_TIMEOUT_MS);
  };

  /**
   * Initialize session timeout tracking
   */
  const initSessionTimeout = () => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetSessionTimeout, { passive: true });
    });
    resetSessionTimeout();
  };

  // ============ FORM PROTECTION ============
  
  /**
   * Protect form from double submission
   * @param {HTMLFormElement} form - Form element
   * @param {Function} submitHandler - Submit handler function
   */
  const protectForm = (form, submitHandler) => {
    if (!form) return;
    
    let isSubmitting = false;
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (isSubmitting) {
        console.warn('Form submission already in progress');
        return;
      }
      
      const submitBtn = form.querySelector('[type="submit"]');
      const originalText = submitBtn?.textContent;
      
      try {
        isSubmitting = true;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Processing...';
        }
        
        await submitHandler(e);
      } finally {
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  };

  // ============ ADVANCED PROTECTION ============

  /**
   * Prevent Clickjacking (Frame Busting)
   */
  const preventFraming = () => {
    if (window.top !== window.self) {
      console.warn('Security: Frame detected. Busting...');
      window.top.location = window.self.location;
    }
  };

  /**
   * Secure External Links (Tabnapping Protection)
   * Adds rel="noopener noreferrer" to all external links
   */
  const secureExternalLinks = () => {
    const links = document.querySelectorAll('a[href^="http"]');
    links.forEach(link => {
      if (link.hostname !== window.location.hostname) {
        link.setAttribute('rel', 'noopener noreferrer');
        if (!link.getAttribute('target')) {
            link.setAttribute('target', '_blank');
        }
      }
    });
  };

  /**
   * Detect Environment Tampering
   * Checks if native functions have been hooked
   * Note: fetch and XMLHttpRequest are commonly polyfilled by browsers/extensions
   * so we disable tampering detection to avoid false positives
   */
  const detectTampering = () => {
    // Disabled to prevent false positives from legitimate browser polyfills
    // Modern browsers and extensions often modify these functions
    return;
  };

  // ============ INITIALIZATION ============
  
  const init = () => {
    // Run advanced protections
    preventFraming();
    secureExternalLinks();
    detectTampering();

    // Initialize session timeout - check auth state via API
    // Auth is now managed by httpOnly cookies, so we check async
    if (typeof API !== 'undefined' && API.getCachedUser) {
      API.getCachedUser().then(user => {
        if (user) {
          initSessionTimeout();
        }
      }).catch(() => {});
    }
    
    // Listen for auth events
    window.addEventListener('auth:login', () => {
      initSessionTimeout();
    });
    
    window.addEventListener('auth:logout', () => {
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
        sessionTimeout = null;
      }
      sessionStore.clear();
    });
    
    // Handle session timeout
    window.addEventListener('session:timeout', () => {
      // Auto-logout on timeout if desired
      // window.location.href = '/login.html?timeout=1';
    });
    
    console.log('🔒 BLACKONN Security initialized (Cloud-ready)');
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ============ PUBLIC API ============
  
  return {
    // XSS Protection
    sanitizeHTML,
    escapeHTML,
    safeInnerHTML,
    
    // Validation
    isValidEmail,
    validatePassword,
    isValidPhone,
    isValidName,
    sanitizeFormData,
    
    // Storage (session only - for UI state)
    sessionStore,
    
    // Rate Limiting
    checkRateLimit,
    
    // CSRF
    getCSRFToken,
    
    // Redirects
    isSafeRedirect,
    safeRedirect,
    
    // Forms
    protectForm,
    
    // Session
    resetSessionTimeout,
    initSessionTimeout
  };
})();

// Make available globally
window.BlackonnSecurity = BlackonnSecurity;
