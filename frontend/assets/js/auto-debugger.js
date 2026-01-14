/**
 * BLACKONN - AI-Powered Auto-Debugger & Self-Healing System (v3.0)
 * "The Intelligent Immune System for your Website"
 * 
 * AI-FRIENDLY FEATURES:
 * =====================
 * This module is designed to work seamlessly with AI systems (GPT, Claude, Copilot)
 * by providing structured, parseable diagnostic data and intelligent context.
 * 
 * Core Capabilities:
 * -  Structured Error Logging: JSON-formatted errors for AI parsing
 * -  Intelligent Pattern Recognition: Categorizes errors by type and severity
 * -  Self-Healing Actions: Automatic fixes with detailed action logs
 * -  Performance Telemetry: Metrics for AI-driven optimization
 * -  Diagnostic Context: Rich context for AI troubleshooting
 * -  Event Timeline: Chronological action history for debugging
 * -  Health Score: Quantified website health (0-100)
 * 
 * AI Integration Points:
 * - window.BLACKONN_DIAGNOSTICS: Full diagnostic data object
 * - window.BLACKONN_HEALER: Programmatic healing interface
 * - Console tags: [AI-DEBUG], [AI-HEAL], [AI-METRIC] for log parsing
 */

(function() {
  'use strict';

  // ============ AI-FRIENDLY CONFIGURATION ============
  var CONFIG = {
    DEBUG_ENDPOINT: '/api/health/client-error',
    DIAGNOSTICS_ENDPOINT: '/api/health/diagnostics',
    MAX_RETRIES: 3, 
    TOAST_DURATION: 4000,
    HEALTH_CHECK_INTERVAL: 60000, 
    MAX_EVENT_HISTORY: 100,
    
    // Critical UI elements to monitor and heal
    CRITICAL_SELECTORS: [
      { selector: '#cartCount', type: 'span', parent: '.cart-icon', text: '0', class: 'cart-count', priority: 'high' },
      { selector: '.nav', type: 'nav', parent: 'body', priority: 'critical' },
      { selector: '#menuBtn', type: 'button', parent: '.nav-right', html: '<span></span><span></span><span></span>', class: 'hamburger', priority: 'high' },
      { selector: '.footer', type: 'footer', parent: 'body', priority: 'medium' }
    ],
    
    // Auto-Repair Thresholds
    THRESHOLDS: {
        ERROR_STORM: 5, // Errors in 10 seconds triggers Super-Heal
        LATENCY_SPIKE: 5000, // ms
        RECOVERY_ATTEMPTS: 3
    }
  };

  // ============ AI AGENT BRAIN (STATEFUL ANALYSIS) ============
  var agentBrain = {
      intelligenceLevel: 'Maximum',
      lastAction: null,
      errorStormCounter: 0,
      isLearning: true,
      
      analyzeState: function() {
          var now = Date.now();
          
          // Check for "Error Storms" (similar to an AI noticing repetitive failures)
          var recentErrors = diagnostics.errors.filter(e => (now - new Date(e.timestamp).getTime()) < 10000);
          if (recentErrors.length >= CONFIG.THRESHOLDS.ERROR_STORM) {
              console.log('[BLACKONN-AI-AGENT] Error storm detected! Immediate recovery required.');
              window.BLACKONN_HEALER.superHeal();
              this.errorStormCounter++;
          }

          // Check for "Blank Page" syndromes (CSS/Render failures)
          if (document.body.offsetHeight === 0 || window.getComputedStyle(document.body).display === 'none') {
              this.applyForceFix('RESTORE_BODY_VISIBILITY');
          }
      },

      applyForceFix: function(type) {
          showHealingToast('Detecting UI blockage... Force-fixing alignment.', 'warning');
          if (type === 'RESTORE_BODY_VISIBILITY') {
              document.body.style.display = 'block';
              document.body.style.opacity = '1';
              document.body.style.visibility = 'visible';
          }
          addToTimeline({ type: 'FORCE_FIX', message: type });
      }
  };

  setInterval(function() { agentBrain.analyzeState(); }, 5000);

  // ============ AI-FRIENDLY DIAGNOSTICS STATE ============
  var diagnostics = {
    version: '3.0.0',
    sessionId: generateSessionId(),
    startTime: Date.now(),
    healthScore: 100,
    
    // Structured error log for AI parsing
    errors: [],
    
    // Healing actions taken
    healingActions: [],
    
    // Network request log
    networkLog: [],
    
    // Performance metrics
    performance: {
      pageLoadTime: 0,
      domInteractive: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
      totalResourcesLoaded: 0,
      failedResources: 0,
      slowRequests: []
    },
    
    // DOM health
    domHealth: {
      missingElements: [],
      healedElements: [],
      brokenImages: [],
      fixedImages: []
    },
    
    // Event timeline for AI debugging
    timeline: [],
    
    // Current status
    status: {
      isHealthy: true,
      lastCheck: null,
      activeIssues: [],
      autoHealingEnabled: true
    }
  };

  // Expose diagnostics globally for AI access
  window.BLACKONN_DIAGNOSTICS = diagnostics;

  // ============ AI-FRIENDLY HELPER FUNCTIONS ============
  
  function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function addToTimeline(event) {
    var entry = {
      timestamp: new Date().toISOString(),
      timestampMs: Date.now(),
      relativeTime: Date.now() - diagnostics.startTime,
      ...event
    };
    
    diagnostics.timeline.unshift(entry);
    if (diagnostics.timeline.length > CONFIG.MAX_EVENT_HISTORY) {
      diagnostics.timeline.pop();
    }
    
    // Log with AI-parseable tag
    console.log('[AI-DEBUG] Timeline:', JSON.stringify(entry));
    
    return entry;
  }

  function categorizeError(errorMsg) {
    var msg = errorMsg.toLowerCase();
    for (var category in CONFIG.ERROR_CATEGORIES) {
      var keywords = CONFIG.ERROR_CATEGORIES[category];
      for (var i = 0; i < keywords.length; i++) {
        if (msg.includes(keywords[i])) {
          return category;
        }
      }
    }
    return 'UNKNOWN';
  }

  function calculateHealthScore() {
    var score = 100;
    
    // Deduct for errors (max -30)
    score -= Math.min(diagnostics.errors.length * 5, 30);
    
    // Deduct for missing elements (max -20)
    score -= Math.min(diagnostics.domHealth.missingElements.length * 10, 20);
    
    // Deduct for failed resources (max -20)
    score -= Math.min(diagnostics.performance.failedResources * 5, 20);
    
    // Deduct for slow requests (max -15)
    score -= Math.min(diagnostics.performance.slowRequests.length * 3, 15);
    
    // Add back for successful heals (max +15)
    score += Math.min(diagnostics.healingActions.filter(function(a) { return a.success; }).length * 3, 15);
    
    diagnostics.healthScore = Math.max(0, Math.min(100, score));
    return diagnostics.healthScore;
  }

  function updateStatus() {
    diagnostics.status.lastCheck = new Date().toISOString();
    diagnostics.status.isHealthy = diagnostics.healthScore >= 70;
    diagnostics.status.activeIssues = diagnostics.errors.filter(function(e) { return !e.resolved; }).length;
    
    console.log('[AI-METRIC] Health Score:', diagnostics.healthScore, '| Active Issues:', diagnostics.status.activeIssues);
  }

  // ============ 1. AI-ENHANCED UI NOTIFICATION ============
  function showHealingToast(message, type, details) {
    // Notification disabled per user request
    // console.log('[BLACKONN-AI-AGENT] Fixing... ' + message);
    return;
    
    type = type || 'info';
    if (document.querySelector('.healing-toast')) {
        document.querySelector('.healing-toast').remove();
    }

    var toast = document.createElement('div');
    toast.className = 'healing-toast ' + type;
    toast.setAttribute('data-ai-component', 'healing-notification');
    toast.innerHTML = '<div class="toast-icon" style="background: #000; border-radius: 50%; padding: 5px;"><i class="ri-robot-2-line" style="color: #22c55e;"></i></div>' +
      '<div class="toast-content">' +
      '<div class="toast-title" style="font-weight: bold; color: #22c55e;">[AI AGENT HEAL]</div>' +
      '<div class="toast-msg">' + message + '</div>' +
      '</div>';
    
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.9)',
      color: '#fff',
      padding: '15px 20px',
      borderRadius: '12px',
      backdropFilter: 'blur(10px)',
      border: '1px solid #22c55e',
      boxShadow: '0 0 20px rgba(34, 197, 94, 0.2)',
      zIndex: '10000',
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      fontSize: '14px',
      minWidth: '300px',
      animation: 'slideInRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
    });

    if (!document.getElementById('ai-toast-style')) {
      var style = document.createElement('style');
      style.id = 'ai-toast-style';
      style.textContent = '@keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'scale(0.9)';
      toast.style.transition = 'all 0.5s ease';
      setTimeout(function() { toast.remove(); }, 500);
    }, 6000); // Longer duration for AI readability
  }

  // ============ 2. AI-ENHANCED ERROR INTERCEPTION ============
  var originalConsoleError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var errorMsg = args.map(function(a) { return String(a); }).join(' ');
    
    // Silence common non-critical errors in production
    if (shouldIgnoreError(errorMsg)) {
        // Still log to internal diagnostics but don't show in console
        addToTimeline({
            type: 'DEBUG',
            category: 'SILENCED',
            message: 'Silenced: ' + errorMsg.substring(0, 50)
        });
        return;
    }

    originalConsoleError.apply(console, args);

    // Create structured error object for AI
    var errorObj = {
      id: 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      message: errorMsg.substring(0, 500),
      category: categorizeError(errorMsg),
      severity: determineSeverity(errorMsg),
      url: window.location.href,
      userAgent: navigator.userAgent,
      resolved: false,
      healingAttempted: false,
      context: {
        page: document.title,
        path: window.location.pathname,
        referrer: document.referrer
      }
    };

    diagnostics.errors.push(errorObj);
    addToTimeline({
      type: 'ERROR',
      category: errorObj.category,
      severity: errorObj.severity,
      message: errorObj.message.substring(0, 100)
    });

    // Attempt intelligent auto-healing
    attemptAutoHeal(errorObj);
    
    calculateHealthScore();
    updateStatus();
    
    // Send to backend for AI analysis
    sendDiagnostics(errorObj);
  };

  // Global error handler
  window.onerror = function(message, source, lineno, colno, error) {
    var errorObj = {
      id: 'global_err_' + Date.now(),
      timestamp: new Date().toISOString(),
      message: message,
      source: source,
      line: lineno,
      column: colno,
      stack: error ? error.stack : null,
      category: 'SCRIPT',
      severity: 'high',
      resolved: false
    };
    
    diagnostics.errors.push(errorObj);
    addToTimeline({
      type: 'GLOBAL_ERROR',
      message: message,
      source: source,
      line: lineno
    });
    
    console.log('[AI-DEBUG] Global Error:', JSON.stringify(errorObj));
    attemptAutoHeal(errorObj);
    calculateHealthScore();
  };

  // Unhandled promise rejection handler
  window.onunhandledrejection = function(event) {
    var errorObj = {
      id: 'promise_err_' + Date.now(),
      timestamp: new Date().toISOString(),
      message: event.reason ? String(event.reason) : 'Unhandled Promise Rejection',
      category: 'SCRIPT',
      severity: 'medium',
      resolved: false
    };
    
    diagnostics.errors.push(errorObj);
    addToTimeline({
      type: 'PROMISE_REJECTION',
      message: errorObj.message.substring(0, 100)
    });
    
    console.log('[AI-DEBUG] Promise Rejection:', JSON.stringify(errorObj));
  };

  function determineSeverity(msg) {
    var lowMsg = msg.toLowerCase();
    if (lowMsg.includes('critical') || lowMsg.includes('fatal') || lowMsg.includes('crash')) return 'critical';
    if (lowMsg.includes('error') || lowMsg.includes('failed') || lowMsg.includes('exception')) return 'high';
    if (lowMsg.includes('warning') || lowMsg.includes('deprecated')) return 'medium';
    return 'low';
  }

  // ============ 3. INTELLIGENT AUTO-HEALING ============
  
  // Public healing API for AI/User interaction
  window.BLACKONN_HEALER = {
    diagnostics: diagnostics,
    
    // Explicit repair for specific issues
    repair: function(issueType) {
      console.log('[AI-HEAL] Manual repair triggered:', issueType);
      var fakeError = { id: 'manual_' + Date.now(), message: issueType, category: categorizeError(issueType) };
      attemptAutoHeal(fakeError);
    },
    
    // "Super-Heal" - The ultimate fix-all action
    superHeal: async function() {
      addToTimeline({ type: 'SUPER_HEAL_START', message: 'Executing deep system repair...' });
      showHealingToast('Deep System Repair Initialized...', 'warning');
      
      try {
        // 1. Trigger Backend Auto-Healer
        const backendResp = await fetch('/api/health/heal', { method: 'POST', credentials: 'include' });
        const backendResult = await backendResp.json();
        console.log('[AI-HEAL] Backend Repair Results:', backendResult);
        
        // 2. Clear common state issues
        localStorage.removeItem('cart_backup');
        sessionStorage.removeItem('last_error_state');
        
        // 3. Fix UI elements
        healDOM();
        
        // 4. Reload if critical elements are still missing
        if (diagnostics.healthScore < 50) {
          showHealingToast('Critical issues remain. Re-building UI...', 'warning');
          setTimeout(() => window.location.reload(true), 2000);
        } else {
          showHealingToast('System restored to healthy state!', 'success');
        }
        
        calculateHealthScore();
        return true;
      } catch (e) {
        console.error('[AI-HEAL] Super-Heal failed:', e);
        return false;
      }
    },
    
    enableAutoHealing: function(val) {
      diagnostics.status.autoHealingEnabled = !!val;
      console.log('[AI-HEAL] Auto-healing:', val ? 'ENABLED' : 'DISABLED');
    }
  };

  function attemptAutoHeal(errorObj) {
    var healingAction = {
      id: 'heal_' + Date.now(),
      timestamp: new Date().toISOString(),
      errorId: errorObj.id,
      errorCategory: errorObj.category,
      action: null,
      success: false,
      details: {}
    };

    var errorMsg = errorObj.message.toLowerCase();

    // Library healing
    if (errorMsg.includes('swiper') && !window.Swiper) {
      healingAction.action = 'LOAD_SWIPER_LIBRARY';
      loadScript('assets/js/swiper-bundle.min.js', function() {
        healingAction.success = true;
        healingAction.details.libraryLoaded = 'swiper-bundle.min.js';
        errorObj.resolved = true;
        showHealingToast('Restored slider library', 'success');
        if (typeof initSwiper === 'function') initSwiper();
      });
    }

    if (errorMsg.includes('scrollreveal') && !window.ScrollReveal) {
      healingAction.action = 'LOAD_SCROLLREVEAL_LIBRARY';
      loadScript('assets/js/scrollreveal.min.js', function() {
        healingAction.success = true;
        healingAction.details.libraryLoaded = 'scrollreveal.min.js';
        errorObj.resolved = true;
        showHealingToast('Restored animation library', 'success');
      });
    }

    // Storage healing
    if (errorMsg.includes('localstorage') || errorMsg.includes('quota')) {
      healingAction.action = 'CLEAR_OLD_STORAGE';
      try {
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && key.startsWith('temp_') || key.startsWith('cache_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
        healingAction.success = true;
        healingAction.details.keysRemoved = keysToRemove.length;
        errorObj.resolved = true;
      } catch(e) {
        healingAction.details.error = e.message;
      }
    }

    // API endpoint healing
    if (errorMsg.includes('api') && (errorMsg.includes('undefined') || errorMsg.includes('null'))) {
      healingAction.action = 'CHECK_API_CONFIG';
      if (!window.API_BASE) {
        window.API_BASE = '';
        healingAction.success = true;
        healingAction.details.apiBaseSet = true;
      }
    }

    if (healingAction.action) {
      errorObj.healingAttempted = true;
      diagnostics.healingActions.push(healingAction);
      addToTimeline({
        type: 'HEALING_ACTION',
        action: healingAction.action,
        success: healingAction.success
      });
      
      console.log('[AI-HEAL]', JSON.stringify(healingAction));
    }
  }

  // ============ 4. DOM HEALTH MONITORING & HEALING ============
  function healDOM() {
    CONFIG.CRITICAL_SELECTORS.forEach(function(item) {
      if (!document.querySelector(item.selector)) {
        // Track missing element
        if (!diagnostics.domHealth.missingElements.find(function(m) { return m.selector === item.selector; })) {
          diagnostics.domHealth.missingElements.push({
            selector: item.selector,
            priority: item.priority,
            detectedAt: new Date().toISOString()
          });
        }

        var parent = document.querySelector(item.parent);
        if (parent) {
          var el = document.createElement(item.type);
          if (item.selector.startsWith('#')) el.id = item.selector.substring(1);
          if (item.class) el.className = item.class;
          if (item.text) el.textContent = item.text;
          if (item.html) el.innerHTML = item.html;
          el.setAttribute('data-healed', 'true');
          el.setAttribute('data-heal-time', new Date().toISOString());
          
          parent.appendChild(el);
          
          diagnostics.domHealth.healedElements.push({
            selector: item.selector,
            healedAt: new Date().toISOString()
          });

          addToTimeline({
            type: 'DOM_HEAL',
            element: item.selector,
            priority: item.priority
          });

          console.log('[AI-HEAL] DOM Element Restored:', item.selector);
          showHealingToast('Restored UI element: ' + item.selector, 'success');
        }
      }
    });
    
    calculateHealthScore();
  }

  setInterval(healDOM, 2000);

  // ============ 5. AI-ENHANCED NETWORK INTERCEPTOR ============
  var originalFetch = window.fetch;
  window.fetch = function(url, options) {
    options = options || {};
    var retries = 0;
    var requestStart = Date.now();
    var requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    var networkEntry = {
      id: requestId,
      url: typeof url === 'string' ? url : url.url,
      method: options.method || 'GET',
      startTime: new Date().toISOString(),
      status: null,
      duration: null,
      retries: 0,
      success: false
    };
    
    var executeFetch = function() {
      return originalFetch(url, options).then(function(response) {
        networkEntry.status = response.status;
        networkEntry.duration = Date.now() - requestStart;
        networkEntry.success = response.ok;
        
        // Skip logging slow requests for non-critical startup probes
        var isStartupProbe = url.indexOf('/auth/me') !== -1 || url.indexOf('/settings/') !== -1;
        
        if (networkEntry.duration > 8000 && !isStartupProbe) {
          diagnostics.performance.slowRequests.push({
            url: networkEntry.url,
            duration: networkEntry.duration,
            timestamp: new Date().toISOString()
          });
          console.log('[AI-METRIC] Slow Request:', networkEntry.url, networkEntry.duration + 'ms');
        }
        
        diagnostics.networkLog.push(networkEntry);
        if (diagnostics.networkLog.length > 50) diagnostics.networkLog.shift();
        
        // Only throw 500 errors for retry - don't catch 401/403 which are expected
        if (!response.ok && response.status >= 500 && retries < CONFIG.MAX_RETRIES) {
          throw new Error('Server Error ' + response.status);
        }
        return response;
      }).catch(function(error) {
        // Skip retrying for 401 errors - they will never succeed on retry
        if (retries < CONFIG.MAX_RETRIES && !error.message.includes('401') && !error.message.includes('403')) {
          retries++;
          networkEntry.retries = retries;
          var delay = Math.pow(2, retries) * 1000;
          
          addToTimeline({
            type: 'NETWORK_RETRY',
            url: networkEntry.url,
            attempt: retries,
            delay: delay
          });
          
          console.log('[AI-DEBUG] Network Retry:', networkEntry.url, 'Attempt:', retries);
          
          return new Promise(function(resolve) {
            setTimeout(resolve, delay);
          }).then(executeFetch);
        }
        
        diagnostics.performance.failedResources++;
        networkEntry.error = error.message;
        diagnostics.networkLog.push(networkEntry);
        
        throw error;
      });
    };

    return executeFetch();
  };

  // ============ 6. AI-ENHANCED IMAGE RECOVERY ============
  function attachImageErrorHandler(img) {
    if (img.dataset.hasAiHandler) return;
    img.dataset.hasAiHandler = 'true';

    img.onerror = function() {
      var imgEntry = {
        src: this.getAttribute('src'),
        timestamp: new Date().toISOString(),
        fixed: false,
        fixMethod: null
      };

      if (this.dataset.triedFix) {
        if (this.src !== getPlaceholder(200, 200, 'Image N/A')) {
          this.src = getPlaceholder(200, 200, 'Image N/A');
          this.classList.add('img-placeholder');
          imgEntry.fixMethod = 'placeholder';
          imgEntry.fixed = true;
        }
        diagnostics.domHealth.brokenImages.push(imgEntry);
        return;
      }
      this.dataset.triedFix = 'true';

      var src = this.getAttribute('src');
      
      // Fix localhost URLs in production
      if (src && src.includes('localhost') && !window.location.hostname.includes('localhost')) {
        var newSrc = src.replace(/http:\/\/localhost:\d+/, '');
        this.src = newSrc;
        imgEntry.fixMethod = 'localhost_fix';
        imgEntry.fixed = true;
        console.log('[AI-HEAL] Fixed localhost image:', newSrc);
        diagnostics.domHealth.fixedImages.push(imgEntry);
        return;
      }

      // Try alternative formats
      if (src && src.endsWith('.jpg')) {
        this.src = src.replace('.jpg', '.webp');
        imgEntry.fixMethod = 'format_webp';
      } else if (src && src.endsWith('.png')) {
        this.src = src.replace('.png', '.webp');
        imgEntry.fixMethod = 'format_webp';
      } else {
        this.src = getPlaceholder(200, 200, 'Image N/A');
        imgEntry.fixMethod = 'placeholder';
      }
      
      imgEntry.fixed = true;
      diagnostics.domHealth.fixedImages.push(imgEntry);
      
      addToTimeline({
        type: 'IMAGE_FIX',
        originalSrc: src,
        method: imgEntry.fixMethod
      });
    };
  }

  // ============ 7. PERFORMANCE MONITORING ============
  function capturePerformanceMetrics() {
    if (window.performance && window.performance.timing) {
      var timing = window.performance.timing;
      diagnostics.performance.pageLoadTime = timing.loadEventEnd - timing.navigationStart;
      diagnostics.performance.domInteractive = timing.domInteractive - timing.navigationStart;
    }
    
    if (window.performance && window.performance.getEntriesByType) {
      var paintEntries = window.performance.getEntriesByType('paint');
      paintEntries.forEach(function(entry) {
        if (entry.name === 'first-contentful-paint') {
          diagnostics.performance.firstContentfulPaint = Math.round(entry.startTime);
        }
      });
      
      var resourceEntries = window.performance.getEntriesByType('resource');
      diagnostics.performance.totalResourcesLoaded = resourceEntries.length;
    }
    
    console.log('[AI-METRIC] Performance:', JSON.stringify(diagnostics.performance));
  }

  // ============ 8. AI DIAGNOSTIC API ============
  window.BLACKONN_HEALER = {
    // Get full diagnostic report for AI analysis
    getDiagnostics: function() {
      calculateHealthScore();
      updateStatus();
      return JSON.parse(JSON.stringify(diagnostics));
    },
    
    // Get AI-friendly summary
    getSummary: function() {
      return {
        sessionId: diagnostics.sessionId,
        healthScore: diagnostics.healthScore,
        isHealthy: diagnostics.status.isHealthy,
        errorCount: diagnostics.errors.length,
        unresolvedErrors: diagnostics.errors.filter(function(e) { return !e.resolved; }).length,
        healingActionsCount: diagnostics.healingActions.length,
        successfulHeals: diagnostics.healingActions.filter(function(a) { return a.success; }).length,
        missingElements: diagnostics.domHealth.missingElements.length,
        brokenImages: diagnostics.domHealth.brokenImages.length,
        slowRequests: diagnostics.performance.slowRequests.length,
        uptime: Date.now() - diagnostics.startTime
      };
    },
    
    // Get errors by category for AI filtering
    getErrorsByCategory: function(category) {
      return diagnostics.errors.filter(function(e) { return e.category === category; });
    },
    
    // Get recent timeline for AI context
    getRecentTimeline: function(count) {
      return diagnostics.timeline.slice(0, count || 20);
    },
    
    // Trigger manual healing
    triggerHeal: function(type) {
      if (type === 'dom') healDOM();
      if (type === 'images') {
        document.querySelectorAll('img').forEach(attachImageErrorHandler);
      }
      return { success: true, type: type, timestamp: new Date().toISOString() };
    },
    
    // Reset diagnostics (for testing)
    reset: function() {
      diagnostics.errors = [];
      diagnostics.healingActions = [];
      diagnostics.networkLog = [];
      diagnostics.timeline = [];
      diagnostics.healthScore = 100;
      return { success: true, message: 'Diagnostics reset' };
    },
    
    // Export diagnostics as downloadable JSON
    exportDiagnostics: function() {
      var data = JSON.stringify(this.getDiagnostics(), null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'blackonn-diagnostics-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, message: 'Diagnostics exported' };
    }
  };

  // ============ HELPER FUNCTIONS ============
  function shouldIgnoreError(msg) {
    var IGNORABLE = [
      /ResizeObserver/,
      /Script error/,
      /401/,
      /login required/i,
      /Authentication required/i,
      /Invalid session/i,
      /Content Security Policy/i,
      /Cross-Origin.*frame/i,
      /Loading chunk/i
    ];
    return IGNORABLE.some(function(p) { return p.test(msg); });
  }

  function loadScript(src, callback) {
    var script = document.createElement('script');
    script.src = src;
    script.onload = function() {
      console.log('[AI-HEAL] Script loaded:', src);
      if (callback) callback();
    };
    script.onerror = function() {
      console.log('[AI-DEBUG] Script failed to load:', src);
    };
    document.head.appendChild(script);
  }

  function getPlaceholder(w, h, text) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><rect fill="#f1f5f9" width="' + w + '" height="' + h + '"/><text fill="#94a3b8" font-family="sans-serif" font-size="14" text-anchor="middle" x="' + (w/2) + '" y="' + (h/2) + '" dy=".3em">' + text + '</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function sendDiagnostics(errorObj) {
    try {
      var payload = {
        error: errorObj,
        summary: window.BLACKONN_HEALER.getSummary(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString()
      };
      
      // Use sendBeacon for non-blocking send with proper content-type for Express
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(CONFIG.DEBUG_ENDPOINT, blob);
      }
    } catch(e) {
      // Silent fail
    }
  }

  // ============ PYTHON AI AGENT INTEGRATION ============
  window.BLACKONN_AGENT = {
    /**
     * Get status of the Python AI Agent
     */
    getStatus: async function() {
      try {
        const resp = await fetch('/api/agent/status');
        return await resp.json();
      } catch (e) {
        return { error: e.message, running: false };
      }
    },

    /**
     * Start the AI Agent (Claude/Gemini powered)
     * @param {string} mode - 'api', 'monitor', 'fix', 'rebuild'
     * @param {string} model - 'claude', 'gemini', 'openai'
     */
    start: async function(mode, model) {
      try {
        showHealingToast('Starting BLACKONN AI Agent...', 'info');
        const resp = await fetch('/api/agent/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: mode || 'api', model: model || 'claude' })
        });
        const result = await resp.json();
        if (result.success) {
          showHealingToast('AI Agent started: ' + (mode || 'api') + ' mode', 'success');
        }
        return result;
      } catch (e) {
        console.error('[AGENT] Failed to start:', e);
        return { error: e.message };
      }
    },

    /**
     * Stop the AI Agent
     */
    stop: async function() {
      try {
        const resp = await fetch('/api/agent/stop', { method: 'POST' });
        return await resp.json();
      } catch (e) {
        return { error: e.message };
      }
    },

    /**
     * Trigger AI-powered error scan and fix
     */
    fixNow: async function(model) {
      try {
        showHealingToast('AI Agent analyzing codebase...', 'info');
        addToTimeline({ type: 'AI_AGENT_FIX', message: 'Triggered AI-powered fix cycle' });
        
        const resp = await fetch('/api/agent/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model, max_fixes: 10 })
        });
        const result = await resp.json();
        
        if (result.fixes_applied > 0) {
          showHealingToast('AI Agent fixed ' + result.fixes_applied + ' issue(s)!', 'success');
        } else {
          showHealingToast('AI Agent scan complete. No issues found.', 'success');
        }
        
        return result;
      } catch (e) {
        console.error('[AGENT] Fix failed:', e);
        showHealingToast('AI Agent fix failed: ' + e.message, 'error');
        return { error: e.message };
      }
    },

    /**
     * Full system rebuild via AI Agent
     */
    rebuild: async function() {
      try {
        showHealingToast('AI Agent rebuilding system...', 'warning');
        const resp = await fetch('/api/agent/rebuild', { method: 'POST' });
        const result = await resp.json();
        
        showHealingToast('System rebuilt: ' + (result.total_actions || 0) + ' actions', 'success');
        return result;
      } catch (e) {
        return { error: e.message };
      }
    },

    /**
     * Analyze a specific error with AI
     */
    analyze: async function(message, filePath, lineNumber) {
      try {
        const resp = await fetch('/api/agent/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, file_path: filePath, line_number: lineNumber })
        });
        return await resp.json();
      } catch (e) {
        return { error: e.message };
      }
    },

    /**
     * Get fix history
     */
    getHistory: async function() {
      try {
        const resp = await fetch('/api/agent/history');
        return await resp.json();
      } catch (e) {
        return { error: e.message };
      }
    }
  };

  // ============ INITIALIZATION ============
  document.addEventListener('DOMContentLoaded', function() {
    // Attach image handlers
    document.querySelectorAll('img').forEach(attachImageErrorHandler);
    
    // Watch for new images
    new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (n.nodeName === 'IMG') attachImageErrorHandler(n);
          if (n.querySelectorAll) n.querySelectorAll('img').forEach(attachImageErrorHandler);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });

    // Capture performance after load
    setTimeout(capturePerformanceMetrics, 1000);
    
    // Initial DOM heal
    healDOM();
    
    // Periodic health check
    setInterval(function() {
      calculateHealthScore();
      updateStatus();
      console.log('[AI-METRIC] Health Check:', JSON.stringify(window.BLACKONN_HEALER.getSummary()));
    }, CONFIG.HEALTH_CHECK_INTERVAL);

    addToTimeline({
      type: 'INIT',
      message: 'Auto-Debugger v3.0 + AI Agent initialized'
    });

    console.log('%c🤖 BLACKONN AI Auto-Debugger v3.0 Active ', 'background: #0f172a; color: #22c55e; padding: 8px 12px; border-radius: 4px; font-weight: bold;');
    console.log('%c📊 Access diagnostics via: window.BLACKONN_DIAGNOSTICS', 'color: #3b82f6;');
    console.log('%c🔧 Access healer API via: window.BLACKONN_HEALER', 'color: #3b82f6;');
    console.log('%c🧠 Access AI Agent via: window.BLACKONN_AGENT', 'color: #a855f7;');
    console.log('%c   → BLACKONN_AGENT.start("api", "claude") to activate', 'color: #a855f7;');
    console.log('%c   → BLACKONN_AGENT.fixNow() to run AI-powered repairs', 'color: #a855f7;');
  });

})();
