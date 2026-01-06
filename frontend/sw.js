const CACHE_NAME = 'blackonn-v3';
const ASSETS_TO_CACHE = [
  '/offline.html',
  '/assets/css/styles.css',
  '/assets/css/swiper-bundle.min.css',
  '/assets/js/main.js',
  '/assets/js/api.js',
  '/assets/js/auth.js',
  '/assets/js/store.js',
  '/assets/js/swiper-bundle.min.js',
  '/assets/js/scrollreveal.min.js',
  '/assets/img/favicon.png',
  '/manifest.json'
];

// HTML pages should not be cached - always fetch from network
const NO_CACHE_PATTERNS = [
  /\.html$/,
  /\.html\?/,  // HTML with query strings
  /\/$/,  // Root paths
  /\/api\//  // API calls
];

// Install event - cache static assets only
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v3...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claimed clients');
      return self.clients.claim();
    })
  );
});

// Check if URL should skip cache
function shouldSkipCache(url) {
  return NO_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

// Fetch event - Network First for HTML, Cache First for static assets
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and chrome extensions
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const url = event.request.url;
  
  // Skip external URLs - don't try to cache or intercept third-party resources
  const currentOrigin = self.location.origin;
  if (!url.startsWith(currentOrigin) && !url.startsWith('/')) {
    return;
  }
  
  // Network First strategy for HTML pages and API calls - ALWAYS bypass cache
  if (shouldSkipCache(url) || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => response)
        .catch(() => {
          // Network failure - return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Network error', { status: 503 });
        })
    );
    return;
  }

  // Cache First for static assets
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
          return new Response('Network error', { status: 503 });
        });
      })
  );
});
