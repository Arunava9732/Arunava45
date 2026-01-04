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
const { router: webhookRoutes, sendOrderWebhook } = require('./routes/webhooks');

// Create Express app
const app = express();

// ============ SECURITY CONFIGURATION ============

// Configure trusted proxy (for rate limiting behind reverse proxy)
configureTrust(app);

// Check for IP Bans
app.use(checkBan);

// Block Bad Bots
app.use(blockBadBots);

// Security headers (Helmet)
app.use(securityHeaders);

// Security logging
app.use(securityLogger);

// Prevent parameter pollution
app.use(parameterPollution);

// Performance Monitoring Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 200) { // Log slow requests (>200ms)
      console.warn(`[PERF] Slow Request: ${req.method} ${req.originalUrl} took ${duration}ms`);
    }
  });
  next();
});

// ============ COMPRESSION FOR HIGH TRAFFIC ============
// Enable gzip compression for all responses
app.use(compression({
  level: 6, // Balanced compression level
  threshold: 512, // Compress responses larger than 512 bytes
  filter: (req, res) => {
    // Skip compression for already compressed assets
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// ============ API RESPONSE CACHING FOR LOW LATENCY ============
const apiCache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds cache

// Simple in-memory cache middleware for GET requests
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();
    
    const key = req.originalUrl || req.url;
    const cached = apiCache.get(key);
    
    if (cached && (Date.now() - cached.timestamp < (duration || CACHE_TTL))) {
      res.set('X-Cache', 'HIT');
      return res.json(cached.data);
    }
    
    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200 && data && data.success !== false) {
        apiCache.set(key, { data, timestamp: Date.now() });
        // Limit cache size
        if (apiCache.size > 100) {
          const firstKey = apiCache.keys().next().value;
          apiCache.delete(firstKey);
        }
      }
      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };
    
    next();
  };
};

// Apply cache to read-only product/slides endpoints
app.use('/api/products', cacheMiddleware(30000)); // 30s cache
app.use('/api/slides', cacheMiddleware(60000)); // 60s cache

// ============ CORS CONFIGURATION ============
// Cloud-ready: Configure FRONTEND_URL environment variable for production
// Example: FRONTEND_URL=https://blackonn.com,https://www.blackonn.com
// Supports both HTTP and HTTPS
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : [];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, same-origin, etc)
    if (!origin) return callback(null, true);

    // Exact match to configured FRONTEND_URL(s)
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow localhost/127.0.0.1 on any port (useful for Live Server / file:// dev)
    // To allow local origins even when NODE_ENV=production (e.g. quick local testing),
    // set ALLOW_LOCALHOST_IN_PRODUCTION=true in your environment. This prevents accidental
    // wide-open CORS in production while giving an operator override for local testing.
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalhost && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_LOCALHOST_IN_PRODUCTION === 'true')) {
      return callback(null, true);
    }

    // If FRONTEND_URL not provided, be permissive in non-production
    if (!process.env.FRONTEND_URL && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Required for httpOnly cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
}));

// ============ BODY PARSING ============
app.use(express.json({ limit: '100mb' })); // 100MB for large image uploads
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Data sanitization against XSS
app.use(xss());

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

// Explicit route for homepage - ensures index.html is served with correct Content-Type
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(frontendRoot, 'index.html'));
});

// Serve static HTML pages explicitly (ensures correct Content-Type)
app.get('/*.html', (req, res, next) => {
  const htmlFile = path.join(frontendRoot, req.path);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(htmlFile, (err) => {
    if (err) next(); // Fall through if file doesn't exist
  });
});

app.use(express.static(frontendRoot, {
  dotfiles: 'ignore', // Don't serve dotfiles
  etag: true,
  maxAge: '1d', // Cache static files for 1 day
  index: false,
  setHeaders: (res, filePath) => {
    // Set correct MIME types explicitly
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (filePath.endsWith('.ico')) {
      res.setHeader('Content-Type', 'image/x-icon');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
    } else if (filePath.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
    } else if (filePath.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
    } else if (filePath.endsWith('.ttf')) {
      res.setHeader('Content-Type', 'font/ttf');
    } else if (filePath.endsWith('.eot')) {
      res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
    }
  }
}));

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
app.use('/api/marketing', marketingRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/gift-cards', giftCardsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhookRoutes);

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
  const insecureJwt = !process.env.JWT_SECRET || /blackonn|CHANGE_THIS/i.test(process.env.JWT_SECRET);
  const insecureCookie = !process.env.COOKIE_SECRET || /blackonn|CHANGE_THIS/i.test(process.env.COOKIE_SECRET);
  if (insecureJwt || insecureCookie) {
    console.error('❌ Insecure or missing secrets detected (JWT_SECRET, COOKIE_SECRET). Please set strong secrets in environment before starting in production.');
    process.exit(1);
  }
}

// ============ GLOBAL ERROR HANDLERS ============
// Prevent server from crashing on uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error && error.message);
  console.error(error && error.stack);
  // Graceful shutdown and exit - allow process manager to restart
  try {
    if (server) {
      server.close(() => {
        console.log('✅ Server closed due to uncaught exception');
        process.exit(1);
      });
      // force exit if close hangs
      setTimeout(() => process.exit(1), 5000).unref();
    } else {
      process.exit(1);
    }
  } catch (e) {
    process.exit(1);
  }
});

// Prevent server from crashing on unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  // Graceful shutdown and exit - allow process manager to restart
  try {
    if (server) {
      server.close(() => {
        console.log('✅ Server closed due to unhandled rejection');
        process.exit(1);
      });
      setTimeout(() => process.exit(1), 5000).unref();
    } else {
      process.exit(1);
    }
  } catch (e) {
    process.exit(1);
  }
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
          const hashed = await bcrypt.hash(adminPassword, 12);
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
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error.message);
      // Don't exit - attempt recovery
    });

    // Keep-alive settings for stability
    server.keepAliveTimeout = 65000; // Slightly higher than typical load balancer timeout
    server.headersTimeout = 66000;

    // Memory watchdog: if RSS memory goes above MEMORY_LIMIT_MB, gracefully restart
    const MEMORY_LIMIT_MB = process.env.MEMORY_LIMIT_MB ? parseInt(process.env.MEMORY_LIMIT_MB, 10) : 512;
    setInterval(() => {
      try {
        const rss = process.memoryUsage().rss / (1024 * 1024);
        if (rss > MEMORY_LIMIT_MB) {
          logger.warn(`Memory watchdog triggered - RSS ${Math.round(rss)}MB > ${MEMORY_LIMIT_MB}MB`);
          // Attempt graceful shutdown so process manager can restart
          if (server) {
            server.close(() => {
              logger.info('Server closed by memory watchdog');
              process.exit(1);
            });
            // Force exit after 3 seconds if close hangs (reduced from 5s for faster recovery)
            setTimeout(() => process.exit(1), 3000).unref();
          } else {
            process.exit(1);
          }
        }
      } catch (e) {
        logger.error('Memory watchdog error', e && e.message);
      }
    }, 10000); // Check every 10 seconds for ultra-fast recovery (reduced from 30s)

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
          if (!cart || cart.length === 0) continue;

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
