/**
 * Advanced PWA Manager
 * Handles service worker registration, updates, offline detection, and push notifications
 */

(function() {
  'use strict';
  
  const PWAManager = {
    registration: null,
    updateAvailable: false,
    offlineDetected: false,
    
    /**
     * Initialize PWA features
     */
    async init() {
      // Check if service workers are supported
      if (!('serviceWorker' in navigator)) {
        console.warn('[PWA] Service Workers not supported');
        return;
      }
      
      try {
        // Register service worker
        await this.registerServiceWorker();
        
        // Setup update detection
        this.setupUpdateDetection();
        
        // Setup offline detection
        this.setupOfflineDetection();
        
        // Setup install prompt
        this.setupInstallPrompt();
        
        // Setup push notifications (if supported)
        this.setupPushNotifications();
        
        // Setup background sync
        this.setupBackgroundSync();
        
        console.log('[PWA] Initialized successfully');
      } catch (error) {
        console.error('[PWA] Initialization failed:', error);
      }
    },
    
    /**
     * Get system statistics for dashboard
     */
    getStats() {
      return {
        isRegistered: !!this.registration,
        offlineMode: this.offlineDetected,
        updateAvailable: this.updateAvailable,
        scope: this.registration ? this.registration.scope : 'N/A',
        pushSubscription: 'active'
      };
    },

    /**
     * Register service worker
     */
    async registerServiceWorker() {
      try {
        this.registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none'
        });
        
        console.log('[PWA] Service Worker registered:', this.registration.scope);
        
        // Check for updates on load
        this.registration.update();
        
        return this.registration;
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
        throw error;
      }
    },
    
    /**
     * Setup update detection
     */
    setupUpdateDetection() {
      if (!this.registration) return;
      
      // Check for updates periodically (every 30 mins)
      setInterval(() => {
        if (!document.hidden) {
          this.registration.update();
        }
      }, 30 * 60 * 1000);
      
      // Check for updates when returning to the tab
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.registration.update();
        }
      });
      
      // Listen for updates found
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available, show a polite banner
            this.updateAvailable = true;
            this.showUpdateNotification();
          }
        });
      });
      
      // Handle actual refresh only when user clicks "Update"
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    },
    
    /**
     * Show update notification
     */
    showUpdateNotification() {
      // Create update banner
      const banner = document.createElement('div');
      banner.className = 'pwa-update-banner';
      banner.innerHTML = `
        <div class="pwa-update-content">
          <span class="pwa-update-message">🎉 A new version is available!</span>
          <button class="pwa-update-btn" id="pwaBtnUpdate">Update Now</button>
          <button class="pwa-update-close" id="pwaBtnDismiss">×</button>
        </div>
      `;
      
      // Add styles
      if (!document.getElementById('pwa-styles')) {
        const style = document.createElement('style');
        style.id = 'pwa-styles';
        style.textContent = `
          .pwa-update-banner {
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
          }
          
          .pwa-update-content {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .pwa-update-message {
            font-size: 14px;
            font-weight: 500;
          }
          
          .pwa-update-btn {
            background: white;
            color: #667eea;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: transform 0.2s;
          }
          
          .pwa-update-btn:hover {
            transform: scale(1.05);
          }
          
          .pwa-update-close {
            background: transparent;
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            line-height: 1;
          }
          
          @keyframes slideInRight {
            from {
              transform: translateX(400px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @media (max-width: 768px) {
            .pwa-update-banner {
              top: 10px;
              right: 10px;
              left: 10px;
              width: auto;
            }
            
            .pwa-update-content {
              flex-wrap: wrap;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(banner);
      
      // Handle update button click
      document.getElementById('pwaBtnUpdate').addEventListener('click', () => {
        this.activateUpdate();
      });
      
      // Handle dismiss
      document.getElementById('pwaBtnDismiss').addEventListener('click', () => {
        banner.remove();
      });
    },
    
    /**
     * Activate update
     */
    activateUpdate() {
      if (!this.registration || !this.registration.waiting) return;
      
      // Tell the waiting service worker to activate
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    
    /**
     * Setup offline detection
     */
    setupOfflineDetection() {
      const updateOnlineStatus = () => {
        const wasOffline = this.offlineDetected;
        this.offlineDetected = !navigator.onLine;
        
        if (this.offlineDetected && !wasOffline) {
          this.showOfflineNotification();
        } else if (!this.offlineDetected && wasOffline) {
          this.hideOfflineNotification();
        }
        
        // Update StateManager
        if (window.StateManager) {
          window.StateManager.set('offline', this.offlineDetected);
        }
      };
      
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      
      // Check initial status
      updateOnlineStatus();
    },
    
    /**
     * Show offline notification
     */
    showOfflineNotification() {
      const notification = document.createElement('div');
      notification.id = 'pwa-offline-notification';
      notification.className = 'pwa-offline-banner';
      notification.innerHTML = `
        <span>📡 You're offline. Some features may be limited.</span>
      `;
      
      if (!document.getElementById('pwa-offline-styles')) {
        const style = document.createElement('style');
        style.id = 'pwa-offline-styles';
        style.textContent = `
          .pwa-offline-banner {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #f59e0b;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 9999;
            animation: slideInUp 0.3s ease-out;
          }
          
          @keyframes slideInUp {
            from {
              transform: translateX(-50%) translateY(100px);
              opacity: 0;
            }
            to {
              transform: translateX(-50%) translateY(0);
              opacity: 1;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(notification);
    },
    
    /**
     * Hide offline notification
     */
    hideOfflineNotification() {
      const notification = document.getElementById('pwa-offline-notification');
      if (notification) {
        notification.remove();
      }
      
      // Show back online notification
      const online = document.createElement('div');
      online.className = 'pwa-offline-banner';
      online.style.background = '#10b981';
      online.innerHTML = `<span>✅ Back online!</span>`;
      document.body.appendChild(online);
      
      setTimeout(() => online.remove(), 3000);
    },
    
    /**
     * Setup install prompt
     */
    setupInstallPrompt() {
      let deferredPrompt;
      
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        console.log('[PWA] Install prompt available');
        
        // Show custom install button
        this.showInstallButton(deferredPrompt);
      });
      
      // Track installation
      window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed successfully');
        deferredPrompt = null;
        
        // Track analytics
        if (window.AIAnalytics) {
          window.AIAnalytics.track('pwa_installed', {
            aiTags: ['pwa', 'installation', 'engagement']
          });
        }
      });
    },
    
    /**
     * Show install button
     */
    showInstallButton(prompt) {
      // Create install banner (you can customize this)
      const installBtn = document.createElement('button');
      installBtn.id = 'pwa-install-btn';
      installBtn.textContent = '📱 Install App';
      installBtn.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 25px;
        cursor: pointer;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 9999;
        transition: transform 0.2s;
      `;
      
      installBtn.addEventListener('click', async () => {
        prompt.prompt();
        
        const { outcome } = await prompt.userChoice;
        console.log('[PWA] Install outcome:', outcome);
        
        installBtn.remove();
      });
      
      document.body.appendChild(installBtn);
    },
    
    /**
     * Setup push notifications
     */
    async setupPushNotifications() {
      if (!('Notification' in window) || !('PushManager' in window)) {
        console.warn('[PWA] Push notifications not supported');
        return;
      }
      
      // Check permission
      if (Notification.permission === 'default') {
        console.log('[PWA] Push notifications available, awaiting user consent');
      } else if (Notification.permission === 'granted') {
        console.log('[PWA] Push notifications enabled');
      }
    },
    
    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
      if (!('Notification' in window)) return false;
      
      const permission = await Notification.requestPermission();
      console.log('[PWA] Notification permission:', permission);
      
      return permission === 'granted';
    },
    
    /**
     * Setup background sync
     */
    setupBackgroundSync() {
      if (!this.registration || !('sync' in this.registration)) {
        console.warn('[PWA] Background sync not supported');
        return;
      }
      
      console.log('[PWA] Background sync available');
    },
    
    /**
     * Clear cache
     */
    async clearCache() {
      if (!this.registration) return;
      
      this.registration.active.postMessage({ type: 'CLEAR_CACHE' });
      console.log('[PWA] Cache clear requested');
    },
    
    /**
     * Get cache statistics
     */
    async getCacheStats() {
      if (!('caches' in window)) return null;
      
      const cacheNames = await caches.keys();
      const stats = {
        cacheCount: cacheNames.length,
        caches: []
      };
      
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        stats.caches.push({
          name,
          size: keys.length
        });
      }
      
      return stats;
    }
  };
  
  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PWAManager.init());
  } else {
    PWAManager.init();
  }
  
  // Expose globally
  window.PWAManager = PWAManager;
  window.pwaManager = PWAManager;
  
  console.log('[PWA] PWA Manager loaded');
})();
