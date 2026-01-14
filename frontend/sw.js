/**
 * Advanced Service Worker with Smart Caching
 * Features: Network-first with fallback, intelligent caching, offline support,
 * background sync, push notifications support
 */

const CACHE_VERSION = 'blackonn-v10-clean-console';
const STATIC_CACHE = 'static-v10';
const DYNAMIC_CACHE = 'dynamic-v10';
const API_CACHE = 'api-v10';
const OFFLINE_URL = '/offline.html';

// Static assets to precache
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/assets/img/favicon.png',
  '/manifest.json',
  '/assets/css/styles.css',
  '/assets/js/auth.js',
  '/assets/js/advanced-cache.js',
  '/assets/js/state-manager.js',
  '/assets/js/performance-optimizer.js',
  '/assets/js/pwa-manager.js',
  '/assets/js/main.js'
];

// Cache strategies per route pattern
const CACHE_STRATEGIES = {
  static: [/\.png$/, /\.jpg$/, /\.jpeg$/, /\.svg$/, /\.gif$/, /\.webp$/, /\.woff2$/, /\.woff$/],
  staleWhileRevalidate: [/\.css$/, /\.js$/],
  networkFirst: [/\.html$/, /\/$/],
  networkOnly: [/\/api\/auth/, /\/api\/cart/, /\/api\/orders/, /\/api\/users/],
  cacheFirst: [/\/assets\/img/, /\/uploads/]
};

// Max cache sizes
const MAX_CACHE_SIZE = {
  [STATIC_CACHE]: 50,
  [DYNAMIC_CACHE]: 30,
  [API_CACHE]: 20
};

// Install - Precache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing advanced service worker blackonn-v9-stable...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

// Activate - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating advanced service worker blackonn-v8-advanced...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== API_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Claimed all clients');
        return self.clients.claim();
      })
  );
});

// Get cache strategy for URL
function getCacheStrategy(url) {
  const urlObj = new URL(url);
  
  // Check each strategy
  for (const [strategy, patterns] of Object.entries(CACHE_STRATEGIES)) {
    if (patterns.some(pattern => pattern.test(urlObj.pathname))) {
      return strategy;
    }
  }
  
  // Default strategy
  return 'networkFirst';
}

// Get appropriate cache name
function getCacheName(url) {
  if (url.includes('/api/')) return API_CACHE;
  if (url.includes('/assets/')) return STATIC_CACHE;
  return DYNAMIC_CACHE;
}

// Network First Strategy with Timeout
async function networkFirst(request, cacheName) {
  const isNavigation = request.mode === 'navigate';
  const timeoutLimit = isNavigation ? 30000 : 20000; // Increased timeout to 20-30s for slow VPS/Network
  
  try {
    // Fetch with a timeout for navigation to ensure quick fallback
    const fetchPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network timeout')), timeoutLimit)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    // Only cache full responses (status 200), skip partial responses (206)
    if (response.ok && response.status === 200) {
      const responseClone = response.clone();
      const cache = await caches.open(cacheName);
      await cache.put(request, responseClone);
      limitCacheSize(cacheName, MAX_CACHE_SIZE[cacheName]);
    }
    
    return response;
  } catch (error) {
    // Network failed or timed out, try cache
    const cached = await caches.match(request);
    
    if (cached) {
      console.log('[SW] Network failed/timeout, serving from cache:', request.url);
      return cached;
    }
    
    // No cache, return offline page for navigation
    if (isNavigation) {
      return caches.match(OFFLINE_URL);
    }
    
    throw error;
  }
}

// Cache First Strategy
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    
    // Only cache full responses (status 200), skip partial responses (206)
    // 206 responses are range requests (videos) and cannot be cached
    if (response.ok && response.status === 200) {
      const responseClone = response.clone();
      const cache = await caches.open(cacheName);
      await cache.put(request, responseClone);
      limitCacheSize(cacheName, MAX_CACHE_SIZE[cacheName]);
    }
    
    return response;
  } catch (error) {
    // Silent fail for cache first - normal for offline
    throw error;
  }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  
  // Fetch in background and update cache
  const fetchPromise = fetch(request).then(async response => {
    // Only cache full responses (status 200), skip partial responses (206)
    if (response.ok && response.status === 200) {
      const responseClone = response.clone();
      const cache = await caches.open(cacheName);
      await cache.put(request, responseClone);
      limitCacheSize(cacheName, MAX_CACHE_SIZE[cacheName]);
    }
    return response;
  }).catch(err => {
    console.log('[SW] Fetch failed in staleWhileRevalidate:', err);
    return cached;
  });
  
  // Return cached immediately if available, otherwise wait for fetch
  return cached || fetchPromise;
}

// Network Only Strategy
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Only log if not a standard "Failed to fetch" (which happens for offline/timeout)
    if (error.name !== 'TypeError' && error.message !== 'Failed to fetch') {
      console.warn('[SW] Network request failed:', error);
    }
    
    // If it's an API request, return a structured JSON error
    if (request.url.includes('/api/')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Network connection lost. Please check your internet.',
        code: 'NETWORK_ERROR',
        offline: true
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If it's a page navigation, we can return the offline page
    if (request.mode === 'navigate') {
      const cache = await caches.open(STATIC_CACHE);
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw error;
  }
}

// Limit cache size
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxSize) {
    // Delete oldest entries
    const toDelete = keys.length - maxSize;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
    console.log(`[SW] Trimmed cache ${cacheName} by ${toDelete} entries`);
  }
}

// Fetch event handler
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip chrome extensions
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  // Skip external URLs (different origin)
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }
  
  // Skip video/audio files - they use Range requests (206) which cannot be cached
  if (/\.(mp4|webm|ogg|mp3|wav|m4a|avi|mov)$/i.test(requestUrl.pathname)) {
    return;
  }
  
  // Skip requests with Range header (partial content requests)
  if (event.request.headers.get('Range')) {
    return;
  }
  
  // Get strategy and cache name
  const strategy = getCacheStrategy(event.request.url);
  const cacheName = getCacheName(event.request.url);
  
  // Apply strategy
  event.respondWith(
    (async () => {
      try {
        switch (strategy) {
          case 'cacheFirst':
            return await cacheFirst(event.request, cacheName);
          
          case 'staleWhileRevalidate':
            return await staleWhileRevalidate(event.request, cacheName);
          
          case 'networkOnly':
            return await networkOnly(event.request);
          
          case 'networkFirst':
          default:
            return await networkFirst(event.request, cacheName);
        }
      } catch (error) {
        // Only log if not a standard "Failed to fetch"
        if (error.name !== 'TypeError' && error.message !== 'Failed to fetch' && !error.message.includes('timeout')) {
          console.error('[SW] Fetch handler error:', error);
        }
        
        const isApiRequest = event.request.url.includes('/api/');
        
        // Final fallback: Try to return offline page for navigations if not already handled
        if (event.request.mode === 'navigate') {
          try {
            const cache = await caches.open(STATIC_CACHE);
            const offlineResponse = await cache.match(OFFLINE_URL);
            if (offlineResponse) return offlineResponse;
          } catch (e) {
            console.error('[SW] Failed to serve offline page:', e);
          }
        }
        
        // Return JSON error for API requests
        if (isApiRequest) {
          return new Response(JSON.stringify({
            success: false,
            error: 'The server is temporarily unavailable. Please try again later.',
            code: 'SERVICE_UNAVAILABLE',
            _error: error.message
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Final fallback for other assets
        return new Response('Network error occurred. Please check your connection.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      }
    })()
  );
});

// Background Sync - Queue failed requests
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncQueue());
  }
});

// Sync queued requests
async function syncQueue() {
  // Implement background sync logic
  console.log('[SW] Syncing queued requests...');
  
  // Get queued requests from IndexedDB (if implemented)
  // Retry failed requests
  // Clear queue on success
}

// Push Notification Support
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'New notification from BLACKONN',
    icon: '/assets/img/favicon.png',
    badge: '/assets/img/badge.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'BLACKONN', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Message Handler - Communication with main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
  
  if (event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then(cache => {
        return cache.addAll(urls);
      })
    );
  }
});

console.log('[SW] Advanced service worker blackonn-v8-advanced loaded');
