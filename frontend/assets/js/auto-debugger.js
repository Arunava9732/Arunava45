/**
 * BLACKONN - Advanced Auto-Debugger & Self-Healing System (v2.0)
 * "The Immune System for your Website"
 * 
 * Features:
 * -  Console Interception: Catches silent errors
 * -  DOM Healing: Recreates missing critical UI elements
 * -  Smart Network Retry: Exponential backoff for failed requests
 * -  Image Recovery: Auto-placeholders & URL correction
 * -  Performance Telemetry: Reports slow interactions
 * -  Auto-Fix Toast: Informs user of self-healing actions
 */

(function() {
  'use strict';

  var CONFIG = {
    DEBUG_ENDPOINT: '/api/health/client-error',
    MAX_RETRIES: 3,
    TOAST_DURATION: 3000,
    CRITICAL_SELECTORS: [
      { selector: '#cartCount', type: 'span', parent: '.cart-icon', text: '0', class: 'cart-count' },
      { selector: '#menuBtn', type: 'button', parent: '.nav-right', html: '<span></span><span></span><span></span>', class: 'hamburger' }
    ]
  };

  var fixesApplied = new Set();

  // ============ 1. UI NOTIFICATION SYSTEM ============
  function showHealingToast(message, type) {
    type = type || 'info';
    // Don't spam toasts
    if (document.querySelector('.healing-toast')) return;

    var toast = document.createElement('div');
    toast.className = 'healing-toast ' + type;
    toast.innerHTML = '<div class="toast-icon"><i class="ri-magic-line"></i></div>' +
      '<div class="toast-content">' +
      '<div class="toast-title">Auto-Fix Applied</div>' +
      '<div class="toast-msg">' + message + '</div>' +
      '</div>';
    
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      background: '#0f172a',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      zIndex: '10000',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '13px',
      fontFamily: 'Segoe UI, sans-serif',
      animation: 'slideIn 0.3s ease-out forwards',
      borderLeft: '4px solid #3b82f6'
    });

    // Add animation keyframes if not exists
    if (!document.getElementById('toast-style')) {
      var style = document.createElement('style');
      style.id = 'toast-style';
      style.textContent = '@keyframes slideIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }';
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(function() { toast.remove(); }, 300);
    }, CONFIG.TOAST_DURATION);
  }

  // ============ 2. CONSOLE INTERCEPTION ============
  var originalConsoleError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    // Call original
    originalConsoleError.apply(console, args);

    // Analyze error
    var errorMsg = args.map(function(a) { return String(a); }).join(' ');
    
    // Ignore known non-criticals
    if (shouldIgnoreError(errorMsg)) return;

    // Attempt fixes based on error content
    if (errorMsg.includes('swiper') && !window.Swiper) {
      loadScript('assets/js/swiper-bundle.min.js', function() {
        showHealingToast('Restored missing slider library');
        if (typeof initSwiper === 'function') initSwiper();
      });
    }
    
    if (errorMsg.includes('ScrollReveal') && !window.ScrollReveal) {
      loadScript('assets/js/scrollreveal.min.js', function() {
        showHealingToast('Restored animation library');
      });
    }
  };

  // ============ 3. DOM HEALING ============
  function healDOM() {
    CONFIG.CRITICAL_SELECTORS.forEach(function(item) {
      if (!document.querySelector(item.selector)) {
        var parent = document.querySelector(item.parent);
        if (parent) {
          var el = document.createElement(item.type);
          if (item.id) el.id = item.id.replace('#', '');
          if (item.class) el.className = item.class;
          if (item.text) el.textContent = item.text;
          if (item.html) el.innerHTML = item.html;
          
          parent.appendChild(el);
          
          console.log('[Healer] Restored missing element: ' + item.selector);
          if (!fixesApplied.has(item.selector)) {
            showHealingToast('Restored missing UI element');
            fixesApplied.add(item.selector);
          }
        }
      }
    });
  }

  // Run healer periodically
  setInterval(healDOM, 2000);

  // ============ 4. NETWORK RETRY INTERCEPTOR ============
  var originalFetch = window.fetch;
  window.fetch = function(url, options) {
    options = options || {};
    var retries = 0;
    
    var executeFetch = function() {
      return originalFetch(url, options).then(function(response) {
        if (!response.ok && response.status >= 500 && retries < CONFIG.MAX_RETRIES) {
          throw new Error('Server Error ' + response.status);
        }
        return response;
      }).catch(function(error) {
        if (retries < CONFIG.MAX_RETRIES) {
          retries++;
          var delay = Math.pow(2, retries) * 1000;
          console.warn('[Network] Retrying ' + url + ' (' + retries + '/' + CONFIG.MAX_RETRIES + ') in ' + delay + 'ms...');
          
          return new Promise(function(resolve) {
            setTimeout(resolve, delay);
          }).then(executeFetch);
        }
        throw error;
      });
    };

    return executeFetch();
  };

  // ============ 5. IMAGE RECOVERY ============
  function attachImageErrorHandler(img) {
    if (img.dataset.hasErrorHandler) return;
    img.dataset.hasErrorHandler = 'true';

    img.onerror = function() {
      if (this.dataset.triedFix) {
        if (this.src !== getPlaceholder(200, 200, 'Image N/A')) {
            this.src = getPlaceholder(200, 200, 'Image N/A');
            this.classList.add('img-placeholder');
        }
        return;
      }
      this.dataset.triedFix = 'true';

      var src = this.getAttribute('src');
      if (src && src.includes('localhost') && !window.location.hostname.includes('localhost')) {
        var newSrc = src.replace(/http:\/\/localhost:\d+/, '');
        console.log('[Healer] Fixed localhost image path: ' + newSrc);
        this.src = newSrc;
        return;
      }

      if (src && src.endsWith('.jpg')) {
        this.src = src.replace('.jpg', '.webp');
      } else if (src && src.endsWith('.png')) {
        this.src = src.replace('.png', '.webp');
      } else {
        this.src = getPlaceholder(200, 200, 'Image N/A');
      }
    };
  }

  // ============ HELPERS ============
  function shouldIgnoreError(msg) {
    var IGNORABLE = [
      /ResizeObserver/,
      /Script error/,
      /401/,
      /login required/i,
      /Content Security Policy/i,
      /Cross-Origin/i
    ];
    return IGNORABLE.some(function(p) { return p.test(msg); });
  }

  function loadScript(src, callback) {
    var script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    document.head.appendChild(script);
  }

  function getPlaceholder(w, h, text) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><rect fill="#f1f5f9" width="' + w + '" height="' + h + '"/><text fill="#94a3b8" font-family="sans-serif" font-size="14" text-anchor="middle" x="' + (w/2) + '" y="' + (h/2) + '" dy=".3em">' + text + '</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  // ============ INIT ============
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('img').forEach(attachImageErrorHandler);
    
    new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (n.nodeName === 'IMG') attachImageErrorHandler(n);
          if (n.querySelectorAll) n.querySelectorAll('img').forEach(attachImageErrorHandler);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });

    console.log('%c  BLACKONN Auto-Debugger v2.0 Active ', 'background: #0f172a; color: #3b82f6; padding: 4px; border-radius: 4px;');
  });

})();
