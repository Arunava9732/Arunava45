/**
 * BLACKONN - Console & DevTools Blocker
 * Prevents access to browser developer tools for non-admin users
 * Admin users have full access to developer tools
 */

(function() {
  'use strict';

  // Flag to track if user is admin - will be set after auth check
  let isAdmin = false;
  let authChecked = false;
  let clearIntervalId = null;
  let debuggerIntervalId = null;

  // Store original console methods FIRST before anything can modify them
  const originalConsole = {};
  const methods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir', 'dirxml', 'group', 'groupEnd', 'time', 'timeEnd', 'profile', 'profileEnd', 'count', 'clear'];
  
  methods.forEach(function(method) {
    if (console[method]) {
      originalConsole[method] = console[method].bind(console);
    }
  });

  // Restore console for admin
  function restoreConsole() {
    methods.forEach(function(method) {
      if (originalConsole[method]) {
        console[method] = originalConsole[method];
      }
    });
    // Stop clearing console
    if (clearIntervalId) {
      clearInterval(clearIntervalId);
      clearIntervalId = null;
    }
  }

  // Block console for non-admin
  function blockConsole() {
    const noop = function() {};
    methods.forEach(function(method) {
      if (method !== 'clear' && console[method]) {
        console[method] = noop;
      }
    });
  }

  // Start blocking mechanisms (only after auth check confirms non-admin)
  function startBlocking() {
    // Block console methods
    blockConsole();
    
    // Clear console periodically
    clearIntervalId = setInterval(function() {
      if (!isAdmin) {
        try {
          originalConsole.clear && originalConsole.clear();
        } catch (e) {}
      }
    }, 1000);

    // Debugger trap
    (function() {
      function block() {
        if (!isAdmin && authChecked) {
          try {
            (function() {
              return false;
            }
            ['constructor']('debugger')
            ['call']());
          } catch (e) {}
        }
        debuggerIntervalId = setTimeout(block, 50);
      }
      block();
    })();
  }

  // Check if current user is admin
  async function checkAdminStatus() {
    try {
      // Wait for auth module to be available (max 5 seconds)
      let attempts = 0;
      while (typeof window.blackonnAuth === 'undefined' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      // If auth module is not available, block access
      if (typeof window.blackonnAuth === 'undefined') {
        authChecked = true;
        startBlocking();
        return;
      }

      // Wait for auth to initialize (check for _authChecked flag or make API call)
      // Give more time for the auth module to complete initialization
      let authAttempts = 0;
      while (!window.blackonnAuth._authChecked && authAttempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        authAttempts++;
      }

      // Now get the current user - force refresh to ensure we have latest
      const user = await window.blackonnAuth.getCurrentUser(true);
      if (user && user.role === 'admin') {
        isAdmin = true;
        authChecked = true;
        // Ensure console is restored for admin
        restoreConsole();
        originalConsole.log('%c[BLACKONN] Admin mode - Developer tools enabled', 'color: #4CAF50; font-weight: bold;');
      } else {
        authChecked = true;
        isAdmin = false;
        // Start blocking for non-admin
        startBlocking();
      }
    } catch (e) {
      authChecked = true;
      isAdmin = false;
      startBlocking();
    }
  }

  // Disable right-click context menu (only for non-admin)
  document.addEventListener('contextmenu', function(e) {
    if (!isAdmin) {
      e.preventDefault();
      return false;
    }
  });

  // Block keyboard shortcuts for DevTools (only for non-admin)
  document.addEventListener('keydown', function(e) {
    // Allow all shortcuts for admin
    if (isAdmin) return;

    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Ctrl+Shift+I (DevTools)
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Ctrl+Shift+J (Console)
    if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Ctrl+Shift+C (Element Inspector)
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Ctrl+U (View Source)
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Ctrl+S (Save Page)
    if (e.ctrlKey && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Ctrl+Shift+K (Firefox Console)
    if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k' || e.keyCode === 75)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Cmd+Option+I (Mac DevTools)
    if (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Cmd+Option+J (Mac Console)
    if (e.metaKey && e.altKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Cmd+Option+C (Mac Element Inspector)
    if (e.metaKey && e.altKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    // Cmd+Option+U (Mac View Source)
    if (e.metaKey && e.altKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // Check admin status immediately when script loads
  // Don't block anything until we know if user is admin or not
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      checkAdminStatus();
    });
  } else {
    checkAdminStatus();
  }

  // Also recheck when auth state might change (after page fully loads)
  window.addEventListener('load', function() {
    // Recheck in case auth wasn't ready on DOMContentLoaded
    if (!authChecked) {
      checkAdminStatus();
    }
  });

  // Expose a way to recheck admin status (useful after login)
  window.__recheckAdminConsole = checkAdminStatus;

})();
