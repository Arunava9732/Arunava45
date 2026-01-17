/**
 * BLACKONN E-Commerce Server Startup
 * Handles server initialization with automatic port selection
 * Imports app configuration from app.js
 * Includes robust error handling and graceful shutdown
 * Optimized for high traffic
 */

const net = require('net');
const os = require('os');
const cluster = require('cluster');
// Load environment early (keeps parity with previous app.js behavior)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const xss = require('xss-clean');

// Import security middleware
const {
  securityHeaders,
  generalLimiter,
  sanitizationMiddleware,
  securityLogger,
  parameterPollution,
  configureTrust,
  checkBan,
  blockBadBots
} = require('./middleware/security');

// Import advanced security middleware
const {
  checkBlockedIP,
  preventInjection,
  preventPathTraversal,
  advancedBotDetection,
  honeypotProtection,
  requestLimits,
  sessionIntegrity,
  ddosMitigation,
  enhancedSecurityHeaders,
  getThreatStatus,
  runSecurityAudit,
  runVulnerabilityScan,
  unblockIP,
  clearAllBlocks,
  trustIP
} = require('./middleware/advancedSecurity');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const userRoutes = require('./routes/users');
const cartRoutes = require('./routes/cart');
const returnRoutes = require('./routes/returns');
const exchangeRoutes = require('./routes/exchanges');
const cancellationRoutes = require('./routes/cancellations');
const contactRoutes = require('./routes/contact');
const slidesRoutes = require('./routes/slides');
const wishlistRoutes = require('./routes/wishlist');
const uploadRoutes = require('./routes/uploads');
const healthRoutes = require('./routes/health');
const analyticsRoutes = require('./routes/analytics');
const seoRoutes = require('./routes/seo');
const inventoryRoutes = require('./routes/inventory');
const marketingRoutes = require('./routes/marketing');
const shippingRoutes = require('./routes/shipping');
const taxRoutes = require('./routes/tax');
const giftCardsRoutes = require('./routes/giftCards');
const settingsRoutes = require('./routes/settings');
const paymentRoutes = require('./routes/payment');
const { router: webhookRoutes, sendOrderWebhook } = require('./routes/webhooks');
const docsRoutes = require('./routes/docs');
const newsletterRoutes = require('./routes/newsletter');
const advancedAdminRoutes = require('./routes/advancedAdmin');
const agentRoutes = require('./routes/agent');
const adminNotificationsRoutes = require('./routes/adminNotifications');

// Create Express app
const app = express();

// ============ SECURITY CONFIGURATION ============

// Configure trusted proxy (for rate limiting behind reverse proxy)
configureTrust(app);

// Enhanced security headers (beyond helmet)
app.use(enhancedSecurityHeaders);

// Check for blocked IPs (advanced security)
app.use(checkBlockedIP);

// DDoS mitigation
app.use(ddosMitigation);

// Check for IP Bans (legacy)
app.use(checkBan);

// Advanced bot detection with behavior analysis
app.use(advancedBotDetection);

// Block Bad Bots (legacy)
app.use(blockBadBots);

// HTTPS Redirect for Production (if behind proxy)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
  });
}

// Security headers (Helmet)
app.use(securityHeaders);

// Path traversal protection
app.use(preventPathTraversal);

// Security logging
app.use(securityLogger);

// Prevent parameter pollution
app.use(parameterPollution);

// Performance Monitoring Middleware (optimized)
const PERF_LOG_ENABLED = process.env.NODE_ENV !== 'production';
const SLOW_REQUEST_THRESHOLD = 500; // 500ms threshold
app.use((req, res, next) => {
  if (!PERF_LOG_ENABLED) return next();
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > SLOW_REQUEST_THRESHOLD) {
      console.warn(`[PERF] Slow: ${req.method} ${req.originalUrl} ${duration}ms`);
    }
  });
  next();
});

// ============ HIGH-PERFORMANCE COMPRESSION ============
// Enable gzip compression with optimized settings for maximum throughput
app.use(compression({
  level: 4, // Level 4 offers best speed/ratio balance (faster than 6)
  threshold: 256, // Compress responses larger than 256 bytes
  memLevel: 8, // Max memory for better compression speed
  filter: (req, res) => {
    // Skip compression for already compressed assets and small responses
    if (req.headers['x-no-compression']) return false;
    // Skip compression for images, videos, and other binary content
    const contentType = res.getHeader('Content-Type') || '';
    if (/image|video|audio|font|zip|gzip|br/.test(contentType)) return false;
    return compression.filter(req, res);
  }
}));

// ============ ULTRA HIGH-PERFORMANCE API CACHING ============
// LRU Cache with intelligent eviction and stale-while-revalidate
const MAX_CACHE_SIZE = 1000; // Doubled for more cache hits
const apiCache = new Map();
const cacheOrder = []; // Track access order for LRU
const cacheETags = new Map(); // ETag cache for conditional requests

// Fast hash for ETag generation
const fastHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
};

// LRU eviction helper (optimized)
const evictLRU = () => {
  if (cacheOrder.length <= MAX_CACHE_SIZE) return;
  while (cacheOrder.length > MAX_CACHE_SIZE) {
    const oldestKey = cacheOrder.shift();
    apiCache.delete(oldestKey);
    cacheETags.delete(oldestKey);
  }
};

// Update access order (move to end = most recently used)
const touchCache = (key) => {
  const idx = cacheOrder.indexOf(key);
  if (idx > -1) cacheOrder.splice(idx, 1);
  cacheOrder.push(key);
};

// Ultra-fast cache middleware with ETag and stale-while-revalidate
const cacheMiddleware = (duration, staleTime = 5000) => {
  return (req, res, next) => {
    // Only cache GET requests without auth
    if (req.method !== 'GET') return next();
    if (req.cookies?.token) return next();
    
    const key = req.originalUrl || req.url;
    const cached = apiCache.get(key);
    const now = Date.now();
    
    // ETag validation - super fast 304 response
    const clientETag = req.headers['if-none-match'];
    const serverETag = cacheETags.get(key);
    if (clientETag && serverETag && clientETag === serverETag) {
      touchCache(key);
      res.status(304).end();
      return;
    }
    
    if (cached) {
      const age = now - cached.timestamp;
      
      // Fresh cache hit - immediate response
      if (age < duration) {
        touchCache(key);
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Age', Math.round(age / 1000) + 's');
        res.set('Cache-Control', `public, max-age=${Math.round((duration - age) / 1000)}`);
        if (serverETag) res.set('ETag', serverETag);
        return res.json(cached.data);
      }
      
      // Stale cache - serve stale while revalidating
      if (age < duration + staleTime) {
        touchCache(key);
        res.set('X-Cache', 'STALE');
        res.set('X-Cache-Age', Math.round(age / 1000) + 's');
        if (serverETag) res.set('ETag', serverETag);
        setImmediate(() => res.json(cached.data));
        return;
      }
    }
    
    // Override res.json to cache the response with ETag
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200 && data && data.success !== false) {
        // Generate ETag from data
        const jsonStr = JSON.stringify(data);
        const etag = '"' + fastHash(jsonStr) + '"';
        
        apiCache.set(key, { data, timestamp: now });
        cacheETags.set(key, etag);
        touchCache(key);
        evictLRU();
        
        res.set('ETag', etag);
      }
      res.set('X-Cache', 'MISS');
      res.set('Cache-Control', `public, max-age=${Math.round(duration / 1000)}`);
      return originalJson(data);
    };
    
    next();
  };
};

// Cache invalidation helper (call when data changes)
const invalidateCache = (pattern) => {
  for (const key of apiCache.keys()) {
    if (key.includes(pattern)) {
      apiCache.delete(key);
      const idx = cacheOrder.indexOf(key);
      if (idx > -1) cacheOrder.splice(idx, 1);
    }
  }
};

// Export for use in routes
app.locals.invalidateCache = invalidateCache;
app.locals.apiCache = apiCache;

// Apply optimized caching to read-heavy endpoints
app.use('/api/products', cacheMiddleware(30000, 10000)); // 30s cache, 10s stale
app.use('/api/slides', cacheMiddleware(60000, 30000)); // 60s cache, 30s stale
app.use('/api/seo', cacheMiddleware(300000, 60000)); // 5min cache for SEO data
app.use('/api/settings', cacheMiddleware(120000, 30000)); // 2min cache for settings

// ============ CORS CONFIGURATION ============
// Dynamic CORS configuration to handle production same-origin and dev environments
const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');
  const allowedOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : [];
  const allowedOriginsSet = new Set(allowedOrigins);
  const isDev = process.env.NODE_ENV !== 'production';

  let isAllowed = false;

  // 1. Allow requests with no origin (mobile apps, same-origin, etc)
  if (!origin) {
    isAllowed = true;
  } 
  // 2. Check against explicit whitelist
  else if (allowedOriginsSet.has(origin)) {
    isAllowed = true;
  }
  // 3. Localhost/Dev checks
  else {
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalhost && (isDev || process.env.ALLOW_LOCALHOST_IN_PRODUCTION === 'true')) {
      isAllowed = true;
    } 
    // 4. Production same-origin fallback (if FRONTEND_URL missing)
    else if (!process.env.FRONTEND_URL) {
      if (isDev) {
        isAllowed = true;
      } else {
        const host = req.get('host');
        if (host && origin.includes(host)) {
          isAllowed = true;
        }
      }
    }
  }

  const corsOptions = {
    origin: isAllowed,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
    optionsSuccessStatus: 204
  };

  if (!isAllowed && origin) {
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
  }

  callback(null, corsOptions);
};

app.use(cors(corsOptionsDelegate));

// ============ FAST JSON PARSING WITH LIMITS ============
// Use optimized JSON parsing with strict limits for performance
app.use(express.json({ 
  limit: '50mb', // Reduced from 100mb - large payloads slow down parsing
  strict: true,  // Only accept arrays and objects
  type: ['application/json', 'application/*+json']
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb',
  parameterLimit: 1000 // Limit parameters to prevent abuse
}));

// Data sanitization against XSS
app.use(xss());

// ============ ADVANCED SECURITY (POST-PARSING) ============
// SQL/NoSQL injection prevention (needs parsed body)
app.use(preventInjection);

// Request limits and depth checking
app.use(requestLimits);

// Honeypot protection for forms
app.use(honeypotProtection);

// Session integrity checking
app.use(sessionIntegrity);

// Request timeout middleware to avoid stuck requests (will return 503 on timeout)
app.use((req, res, next) => {
  const timeoutMs = process.env.REQUEST_TIMEOUT_MS ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10) : 120000; // 2 minutes
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      // Return JSON for API routes, HTML error page for others
      if (req.path.startsWith('/api/')) {
        res.status(503).json({ success: false, error: 'Server request timeout' });
      } else {
        res.status(503).send('<!DOCTYPE html><html><head><title>Timeout</title></head><body><h1>Request Timeout</h1><p>The server took too long to respond. Please try again.</p></body></html>');
      }
    }
  }, timeoutMs);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// Cookie parser for httpOnly cookies
app.use(cookieParser(process.env.COOKIE_SECRET || 'blackonn_cookie_secret_2025'));

// Input sanitization
app.use(sanitizationMiddleware);

// ============ AI-FRIENDLY API ENHANCEMENTS ============
// Add comprehensive metadata to all API responses for AI consumption
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    // Only enhance API responses
    if (req.path.startsWith('/api/')) {
      const enhanced = {
        ...data,
        _metadata: {
          timestamp: new Date().toISOString(),
          endpoint: req.path,
          method: req.method,
          version: 'v1',
          requestId: req.id || Math.random().toString(36).substr(2, 9),
          processingTime: Date.now() - (req._startTime || Date.now()),
          ai: {
            friendly: true,
            structured: true,
            machineReadable: true,
            semantic: true
          }
        },
        _links: {
          self: req.originalUrl,
          documentation: '/api/docs'
        }
      };
      return originalJson(enhanced);
    }
    return originalJson(data);
  };
  req._startTime = Date.now();
  next();
});

// Advanced request logging for AI analysis
app.use((req, res, next) => {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    referer: req.get('referer'),
    origin: req.get('origin'),
    tags: ['request', 'api', 'http']
  };
  console.log('[AI-LOG]', JSON.stringify(logData));
  next();
});

// SEO Routes (Sitemap & Robots)
app.use('/', seoRoutes);

// General rate limiting for API
app.use('/api', generalLimiter);

// Serve static files from the frontend directory (the website)
// Block access to sensitive server directories and files before static middleware
app.use((req, res, next) => {
  try {
    const parts = req.path.split('/').filter(Boolean);
    const first = parts[0] || '';
    // Keep both 'server' and 'backend' blocked for compatibility
    const blockedRoots = ['server', 'backend', 'data', '.git'];

    // Block common sensitive entry points and any attempt to fetch .env
    if (blockedRoots.includes(first) || req.path === '/server.js' || req.path.endsWith('.env') || req.path.startsWith('/.git')) {
      return res.status(404).send('Not found');
    }

    next();
  } catch (e) {
    next();
  }
});

// Frontend root (one level above backend directory)
const frontendRoot = path.join(__dirname, '..', 'frontend');

// ============ API ROUTES ============
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/cancellations', cancellationRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/slides', slidesRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/marketing/newsletter', newsletterRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/gift-cards', giftCardsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);

// SEO API routes
app.use('/api/seo', seoRoutes);

// API Documentation
app.use('/api/docs', docsRoutes);

// Advanced Admin APIs (Security Manager, ML, Errors, A/B Testing, Performance, PWA, Emotion AI, Neural Commerce)
app.use('/api/admin', advancedAdminRoutes);

// BLACKONN AI Agent (Claude/Gemini powered auto-fix)
app.use('/api/agent', agentRoutes);
app.use('/api/admin-notifications', adminNotificationsRoutes);

// AI Engine APIs (Analytics, Fraud, Email, Search, Recommendations, Pricing, Image Processing)
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

// ============ SEO-FRIENDLY URL ROUTING ============
// These clean URLs map to actual HTML files with keyword-rich paths
// This helps with SEO by having meaningful URLs instead of .html extensions

const seoUrlMappings = {
  // Main pages with SEO-friendly paths
  '/': 'index.html',
  '/home': 'index.html',
  '/shop': 'products.html',
  '/shop/all': 'products.html',
  '/shop/black-tshirts': 'products.html',
  '/shop/black-oversized-tshirts': 'products.html',
  '/shop/black-hoodies': 'products.html',
  '/shop/black-caps': 'products.html',
  '/shop/black-bags': 'products.html',
  '/shop/streetwear-india': 'products.html',
  '/shop/premium-black-clothing': 'products.html',
  '/shop/oversized-tshirts-india': 'products.html',
  '/collection': 'products.html',
  '/collection/all': 'products.html',
  '/products': 'products.html',
  
  // Category-specific SEO URLs
  '/black-tshirts-online-india': 'products.html',
  '/oversized-black-tshirts': 'products.html',
  '/premium-black-hoodies-india': 'products.html',
  '/black-streetwear-collection': 'products.html',
  
  // Info pages
  '/about': 'about.html',
  '/about-us': 'about.html',
  '/about-blackonn': 'about.html',
  '/our-story': 'about.html',
  
  '/contact': 'contact.html',
  '/contact-us': 'contact.html',
  '/support': 'contact.html',
  '/help': 'contact.html',
  '/customer-support': 'contact.html',
  
  '/faq': 'faq.html',
  '/faqs': 'faq.html',
  '/frequently-asked-questions': 'faq.html',
  '/help-center': 'faq.html',
  
  '/size-guide': 'size-guide.html',
  '/sizing-chart': 'size-guide.html',
  '/size-chart': 'size-guide.html',
  '/how-to-measure': 'size-guide.html',
  
  // Policy pages
  '/privacy': 'privacy-policy.html',
  '/privacy-policy': 'privacy-policy.html',
  '/terms': 'terms.html',
  '/terms-and-conditions': 'terms.html',
  '/terms-of-service': 'terms.html',
  '/refund': 'refund-policy.html',
  '/refund-policy': 'refund-policy.html',
  '/refunds': 'refund-policy.html',
  '/return': 'return-policy.html',
  '/return-policy': 'return-policy.html',
  '/returns': 'return-policy.html',
  '/shipping-policy': 'shipping.html',
  '/shipping-info': 'shipping.html',
  '/delivery': 'shipping.html',
  '/delivery-info': 'shipping.html',
  '/cancellation': 'cancellation-policy.html',
  '/cancellation-policy': 'cancellation-policy.html',
  '/payment': 'payment-policy.html',
  '/payment-policy': 'payment-policy.html',
  '/payment-options': 'payment-policy.html',
  
  // User pages
  '/account': 'profile.html',
  '/my-account': 'profile.html',
  '/profile': 'profile.html',
  '/dashboard': 'profile.html',
  '/login': 'login.html',
  '/signin': 'login.html',
  '/sign-in': 'login.html',
  '/signup': 'signup.html',
  '/register': 'signup.html',
  '/sign-up': 'signup.html',
  '/create-account': 'signup.html',
  '/forgot-password': 'forgot-password.html',
  '/password-reset': 'forgot-password.html',
  '/reset-password': 'reset-password.html',
  
  // Shopping pages
  '/cart': 'cart.html',
  '/shopping-cart': 'cart.html',
  '/bag': 'cart.html',
  '/checkout': 'checkout.html',
  '/place-order': 'checkout.html',
  
  // Gift Cards
  '/gift-cards': 'gift-cards.html',
  '/gift-card': 'gift-cards.html',
  '/giftcards': 'gift-cards.html',
  '/vouchers': 'gift-cards.html',
  
  // Admin (protected by auth anyway)
  '/admin': 'admin.html',
  '/admin-panel': 'admin.html',
  '/dashboard/admin': 'admin.html'
};

// SEO URL handler - serves HTML without .html extension
app.get('*', (req, res, next) => {
  const cleanPath = req.path.toLowerCase().replace(/\/$/, '') || '/';
  
  // Skip API routes, static assets, and actual file requests
  if (cleanPath.startsWith('/api/') || 
      cleanPath.startsWith('/uploads/') ||
      cleanPath.startsWith('/assets/') ||
      cleanPath.match(/\.(html|css|js|png|jpg|jpeg|gif|svg|ico|webp|mp4|webm|woff|woff2|ttf|json|xml|txt)$/)) {
    return next();
  }
  
  // Check SEO mappings
  if (seoUrlMappings[cleanPath]) {
    const htmlFile = path.join(frontendRoot, seoUrlMappings[cleanPath]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Set canonical URL header for SEO
    res.setHeader('Link', `<https://blackonn.com${cleanPath}>; rel="canonical"`);
    return res.sendFile(htmlFile, (err) => {
      if (err) next();
    });
  }
  
  next();
});

// Explicit route for homepage - ensures index.html is served with correct Content-Type
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(frontendRoot, 'index.html'));
});

// Serve static HTML pages explicitly (ensures correct Content-Type and no caching)
app.get('/*.html', (req, res, next) => {
  const htmlFile = path.join(frontendRoot, req.path);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(htmlFile, (err) => {
    if (err) next(); // Fall through if file doesn't exist
  });
});

app.use(express.static(frontendRoot, {
  dotfiles: 'ignore', // Don't serve dotfiles
  etag: true,
  index: false,
  setHeaders: (res, filePath) => {
    // HTML should not be cached to ensure immediate updates
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      // Allow browser caching with short revalidation for faster page loads
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      // Allow browser caching with short revalidation for faster page loads
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for static assets
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.ico')) {
      res.setHeader('Content-Type', 'image/x-icon');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.avif')) {
      res.setHeader('Content-Type', 'image/avif');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for fonts
    } else if (filePath.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.ttf')) {
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.eot')) {
      res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// ============ AI-FRIENDLY API ENHANCEMENTS ============
// Add comprehensive metadata to all API responses for AI consumption
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    // Only enhance API responses
    if (req.path.startsWith('/api/')) {
      const enhanced = {
        ...data,
        _metadata: {
          timestamp: new Date().toISOString(),
          endpoint: req.path,
          method: req.method,
          version: 'v1',
          requestId: req.id || Math.random().toString(36).substr(2, 9),
          processingTime: Date.now() - (req._startTime || Date.now()),
          ai: {
            friendly: true,
            structured: true,
            machineReadable: true,
            semantic: true,
            schema: 'json-ld'
          }
        },
        _links: {
          self: req.originalUrl,
          documentation: '/api/docs',
          health: '/api/health'
        }
      };
      return originalJson(enhanced);
    }
    return originalJson(data);
  };
  req._startTime = Date.now();
  next();
});

// Advanced structured logging for AI/ML analysis
app.use((req, res, next) => {
  const logData = {
    timestamp: new Date().toISOString(),
    type: 'http_request',
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    referer: req.get('referer'),
    origin: req.get('origin'),
    acceptLanguage: req.get('accept-language'),
    tags: ['request', 'api', 'http'],
    context: {
      isApi: req.path.startsWith('/api/'),
      isAuth: req.path.startsWith('/api/auth'),
      isPublic: !req.path.startsWith('/api/admin')
    }
  };
  console.log('[AI-LOG]', JSON.stringify(logData));
  
  // Track response
  res.on('finish', () => {
    const responseLog = {
      timestamp: new Date().toISOString(),
      type: 'http_response',
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - (req._startTime || Date.now()),
      tags: ['response', 'performance']
    };
    console.log('[AI-LOG]', JSON.stringify(responseLog));
  });
  
  next();
});

// ============ SECURITY MONITORING (Admin Only) ============
const { authenticate, isAdmin } = require('./middleware/auth');

// Get security status
app.get('/api/security/status', authenticate, isAdmin, (req, res) => {
  try {
    const threatStatus = getThreatStatus();
    res.json({
      success: true,
      security: {
        ...threatStatus,
        serverTime: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get security status' });
  }
});

// Run security audit
app.get('/api/security/audit', authenticate, isAdmin, (req, res) => {
  try {
    const audit = runSecurityAudit();
    res.json({ success: true, audit });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to run security audit' });
  }
});

// Run vulnerability scan
app.get('/api/security/scan', authenticate, isAdmin, async (req, res) => {
  try {
    const scan = await runVulnerabilityScan(req);
    res.json({ success: true, scan });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to run vulnerability scan' });
  }
});

// Unblock an IP address
app.post('/api/security/unblock', authenticate, isAdmin, (req, res) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ success: false, error: 'IP address required' });
    }
    unblockIP(ip);
    res.json({ success: true, message: `IP ${ip} has been unblocked` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to unblock IP' });
  }
});

// Clear all blocks (emergency)
app.post('/api/security/clear-all', authenticate, isAdmin, (req, res) => {
  try {
    const count = clearAllBlocks();
    res.json({ success: true, message: `Cleared ${count} IP blocks` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to clear blocks' });
  }
});

// Trust current IP (whitelist self)
app.post('/api/security/trust-me', authenticate, isAdmin, (req, res) => {
  try {
    trustIP(req.ip);
    res.json({ success: true, message: `Your IP ${req.ip} has been trusted` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to trust IP' });
  }
});

// Serve uploaded files statically with cache control and proper MIME types
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  dotfiles: 'ignore',
  etag: true,
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    // Set correct MIME types for uploads
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
    } else if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

// ============ ERROR HANDLING ============

// Handle 404 for API routes (fallback - should rarely reach here)
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// Handle 404 for all other routes - Serve 404.html
app.use((req, res) => {
  res.status(404).sendFile(path.join(frontendRoot, '404.html'));
});

// Async error wrapper - catches errors from async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handler
app.use((err, req, res, next) => {
  // Log error securely
  console.error('Server Error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Prevent sending response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({ 
    success: false, 
    error: isProduction ? 'An error occurred' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// Export asyncHandler for use in routes
app.asyncHandler = asyncHandler;

// (merged app.js content end)

const bcrypt = require('bcryptjs');
const db = require('./utils/database');
const logger = require('./utils/logger');
const { sendAbandonedCartReminder } = require('./utils/email');

// Configuration
// Coerce PORT to a number to avoid string concatenation issues in findAvailablePort
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const MAX_PORT_ATTEMPTS = 10;

// -----------------------------
// Production startup safety
// -----------------------------
if (process.env.NODE_ENV === 'production') {
  const insecureJwt = !process.env.JWT_SECRET || /blackonn|CHANGE_THIS|your_jwt_secret/i.test(process.env.JWT_SECRET);
  const insecureCookie = !process.env.COOKIE_SECRET || /blackonn|CHANGE_THIS|your_cookie_secret/i.test(process.env.COOKIE_SECRET);
  
  if (insecureJwt || insecureCookie) {
    console.error('================================================================================');
    console.error('⚠️  CRITICAL SECURITY WARNING: Insecure or missing secrets detected!');
    console.error('   JWT_SECRET or COOKIE_SECRET are using default or placeholder values.');
    console.error('   The server will start, but YOUR DATA IS AT RISK.');
    console.error('   Please set strong secrets in your .env file immediately.');
    console.error('================================================================================');
    
    // In production, we'll continue but warn loudly. 
    // In a real high-security app, you might want to exit, 
    // but for user experience we ensure the site stays up.
  }
}

// ============ GLOBAL ERROR HANDLERS ============
// Track error counts to detect critical issues
let uncaughtErrorCount = 0;
let lastErrorReset = Date.now();
const ERROR_THRESHOLD = 10; // Max errors before restart
const ERROR_WINDOW_MS = 60000; // 1 minute window

// Prevent server from crashing on uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error && error.message);
  console.error(error && error.stack);
  
  // Reset counter if outside window
  if (Date.now() - lastErrorReset > ERROR_WINDOW_MS) {
    uncaughtErrorCount = 0;
    lastErrorReset = Date.now();
  }
  
  uncaughtErrorCount++;
  
  // Only restart if too many errors in short time OR critical error
  const isCritical = error && (
    error.code === 'EADDRINUSE' ||
    error.code === 'EACCES' ||
    error.message?.includes('out of memory') ||
    error.message?.includes('FATAL')
  );
  
  if (isCritical || uncaughtErrorCount >= ERROR_THRESHOLD) {
    console.error(`🔴 Critical error or error threshold reached (${uncaughtErrorCount}/${ERROR_THRESHOLD}). Restarting...`);
    try {
      if (server) {
        server.close(() => {
          console.log('✅ Server closed due to uncaught exception');
          process.exit(1);
        });
        setTimeout(() => process.exit(1), 3000).unref();
      } else {
        process.exit(1);
      }
    } catch (e) {
      process.exit(1);
    }
  } else {
    console.warn(`⚠️ Non-critical error (${uncaughtErrorCount}/${ERROR_THRESHOLD}). Server continues running.`);
  }
});

// Prevent server from crashing on unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  // Log but don't crash - most rejections are non-critical
  // The promise will be marked as handled
});

// Handle SIGTERM gracefully (for cloud deployments)
process.on('SIGTERM', () => {
  console.log('📢 SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', () => {
  console.log('\n📢 SIGINT received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Keep track of server instance
let server = null;

// ============ PORT AVAILABILITY CHECK ============
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const testServer = net.createServer();
    testServer.once('error', () => resolve(false));
    testServer.once('listening', () => {
      testServer.close();
      resolve(true);
    });
    testServer.listen(port);
  });
}

async function findAvailablePort(startPort, maxAttempts = MAX_PORT_ATTEMPTS) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
  }
  throw new Error(`No available port found after ${maxAttempts} attempts starting from ${startPort}`);
}

// 404 handler with AI-friendly response
app.use((req, res, next) => {
  const error404 = {
    success: false,
    error: {
      message: 'Resource not found',
      type: 'NotFoundError',
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    },
    _metadata: {
      errorId: Math.random().toString(36).substr(2, 9),
      aiAnalysis: {
        category: 'client_error',
        severity: 'low',
        retryable: false,
        suggestion: 'Check the API documentation for valid endpoints'
      }
    },
    _links: {
      documentation: '/api/docs',
      home: '/'
    }
  };
  
  console.log('[AI-ERROR]', JSON.stringify({ ...error404, type: '404_not_found' }));
  res.status(404).json(error404);
});

// Global AI-friendly error handler
app.use((err, req, res, next) => {
  const errorResponse = {
    success: false,
    error: {
      message: err.message || 'Internal server error',
      type: err.name || 'Error',
      code: err.code || 'INTERNAL_ERROR',
      statusCode: err.statusCode || 500,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    },
    _metadata: {
      errorId: Math.random().toString(36).substr(2, 9),
      aiAnalysis: {
        category: err.statusCode >= 500 ? 'server_error' : 'client_error',
        severity: err.statusCode >= 500 ? 'high' : 'medium',
        retryable: err.statusCode >= 500 && err.statusCode !== 501,
        context: {
          userAgent: req.get('user-agent'),
          ip: req.ip,
          endpoint: req.path
        }
      }
    },
    _links: {
      support: '/contact',
      documentation: '/api/docs'
    }
  };

  // Structured error logging for AI/ML analysis
  console.error('[AI-ERROR]', JSON.stringify({
    ...errorResponse,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    tags: ['error', 'exception', err.statusCode >= 500 ? 'server' : 'client']
  }));

  res.status(err.statusCode || 500).json(errorResponse);
});

// ============ START SERVER ============
(async () => {
  try {
    const PORT = DEFAULT_PORT;
    
    // Seed admin user if ADMIN_EMAIL and ADMIN_PASSWORD provided
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      const adminName = process.env.ADMIN_NAME || 'Admin';
      if (adminEmail && adminPassword) {
        const existing = db.users.findOne({ email: adminEmail.toLowerCase() });
        if (!existing) {
          // create admin user
          const hashed = await bcrypt.hash(adminPassword, 10);
          const adminUser = {
            id: 'admin',
            name: adminName,
            email: adminEmail.toLowerCase(),
            password: hashed,
            role: 'admin',
            createdAt: new Date().toISOString(),
            lastLogin: null,
            failedAttempts: 0,
            lockedUntil: null
          };
          db.users.create(adminUser);
          console.log('✅ Admin user seeded from environment variables');
        }
      }
    } catch (e) {
      console.warn('Admin seeding skipped:', e && e.message);
    }

    // Allow binding to a specific host (useful on VPS). Default binds to all interfaces.
    const HOST = process.env.HOST || '0.0.0.0';

    server = app.listen(PORT, HOST, () => {
      // Discover external (non-internal) IPv4 addresses for helpful logging
      const nets = os.networkInterfaces();
      const externalAddrs = [];
      Object.keys(nets).forEach((name) => {
        nets[name].forEach((iface) => {
          if (iface.family === 'IPv4' && !iface.internal) externalAddrs.push(iface.address);
        });
      });

      const externalInfo = externalAddrs.length
        ? externalAddrs.map(a => `http://${a}:${PORT}`).join('\n')
        : 'No external IPv4 addresses detected';

      logger.info(`BLACKONN E-Commerce Server Started\n` +
        `Local:    http://localhost:${PORT}\n` +
        `Bound to: ${HOST}:${PORT}\n` +
        `External: ${externalInfo}\n` +
        `API:      http://localhost:${PORT}/api\n` +
        `Health:   http://localhost:${PORT}/api/health\n` +
        `Status:   Running in ${process.env.NODE_ENV || 'development'} mode`);

      // Initialize WebSocket Server
      try {
        const WebSocketServer = require('./utils/websocketServer');
        const wss = new WebSocketServer(server);
        logger.info('󰒄 WebSocket Server initialized and tied to HTTP server');
      } catch (err) {
        logger.error('󰒄 Failed to initialize WebSocket Server:', err.message);
      }
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error.message);
      if (error.code === 'EADDRINUSE') {
        console.error(`🔴 Port ${PORT} is already in use. Please stop the other process or use a different port.`);
        process.exit(1); // Exit so PM2 can attempt restart or show failure
      }
    });

    // ============ HIGH-PERFORMANCE CONNECTION SETTINGS ============
    // Optimized keep-alive for high throughput
    server.keepAliveTimeout = 65000; // Slightly higher than typical load balancer timeout
    server.headersTimeout = 66000;
    
    // Enable TCP keep-alive for long-lived connections
    server.on('connection', (socket) => {
      socket.setKeepAlive(true, 30000); // 30 second keep-alive probe
      socket.setNoDelay(true); // Disable Nagle's algorithm for lower latency
    });
    
    // Track active connections for graceful shutdown
    let activeConnections = 0;
    server.on('connection', (socket) => {
      activeConnections++;
      socket.on('close', () => activeConnections--);
    });
    
    // Log performance metrics every 5 minutes
    setInterval(() => {
      const mem = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      logger.info(`[PERF] Memory: ${Math.round(mem.rss / 1024 / 1024)}MB RSS, ${Math.round(mem.heapUsed / 1024 / 1024)}MB Heap | Connections: ${activeConnections} | Cache: ${apiCache.size} items`);
    }, 5 * 60 * 1000);

    // AI Engine Initialization Check
    const pythonBridge = require('./utils/python_bridge');
    pythonBridge.getAIHealth()
      .then(report => {
        logger.info('󰚩 AI Engines initialized and healthy');
      })
      .catch(err => {
        logger.warn('󰚩 AI Engines warning: Python or dependencies may be missing');
        logger.error('󰚩 Error initializing AI:', err.message);
      });

    // Memory watchdog: if RSS memory goes above MEMORY_LIMIT_MB (Default 1.5GB), gracefully restart
    const MEMORY_LIMIT_MB = process.env.MEMORY_LIMIT_MB ? parseInt(process.env.MEMORY_LIMIT_MB, 10) : 1536;
    setInterval(() => {
      try {
        const rss = process.memoryUsage().rss / (1024 * 1024);
        if (rss > MEMORY_LIMIT_MB) {
          logger.warn(`[WATCHDOG] Memory threshold exceeded - RSS ${Math.round(rss)}MB > ${MEMORY_LIMIT_MB}MB`);
          // Attempt graceful shutdown so process manager can restart
          if (server) {
            server.close(() => {
              logger.info('Server closed by memory watchdog for self-healing');
              process.exit(1);
            });
            // Force exit if close hangs
            setTimeout(() => process.exit(1), 3000).unref();
          } else {
            process.exit(1);
          }
        }
      } catch (e) {
        logger.error('Memory watchdog error', e && e.message);
      }
    }, 30000); // Check every 30 seconds to reduce CPU overhead

    // Daily Database Backup Task (runs every 24 hours)
    setInterval(() => {
      try {
        logger.info('Starting daily database backup...');
        Object.keys(db).forEach(collection => {
          if (db[collection] && typeof db[collection].backup === 'function') {
            db[collection].backup();
          }
        });
        logger.info('Daily database backup completed.');
      } catch (e) {
        logger.error('Daily backup failed:', e && e.message);
      }
    }, 24 * 60 * 60 * 1000);

    // Abandoned Cart Recovery Task (runs every 6 hours)
    setInterval(async () => {
      try {
        logger.info('Checking for abandoned carts...');
        const carts = db.carts.findAll();
        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

        for (const [userId, cart] of Object.entries(carts)) {
          if (!cart || !Array.isArray(cart) || !Array.isArray(cart) || cart.length === 0) continue;

          // Find the oldest item in the cart
          const oldestItem = cart.reduce((oldest, item) => {
            const itemDate = new Date(item.addedAt).getTime();
            return itemDate < oldest ? itemDate : oldest;
          }, now);

          const timeInCart = now - oldestItem;

          // If cart is older than 24 hours but less than 3 days, and no reminder sent yet
          if (timeInCart > ONE_DAY_MS && timeInCart < THREE_DAYS_MS) {
            // Check if we already sent a reminder (we'll store this in the cart object itself)
            // Since cart is an array, we'll check a special property if we can, 
            // but since it's an array, let's check if any item has 'reminderSent'
            const alreadySent = cart.some(item => item.reminderSent);
            
            if (!alreadySent) {
              const user = db.users.findById(userId);
              if (user && user.email) {
                logger.info(`Sending abandoned cart reminder to ${user.email}`);
                await sendAbandonedCartReminder(user, cart);
                
                // Mark as sent
                cart.forEach(item => item.reminderSent = true);
                carts[userId] = cart;
                db.carts.replaceAll(carts);
              }
            }
          }
        }
      } catch (e) {
        logger.error('Abandoned cart task failed:', e && e.message);
      }
    }, 6 * 60 * 60 * 1000);

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
})();

// Export app for testing
module.exports = app;
