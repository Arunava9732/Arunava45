/**
 * Security Middleware for BLACKONN E-Commerce
 * Implements comprehensive security measures
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const hpp = require('hpp');
const crypto = require('crypto');
const { validationResult } = require('express-validator');

// ============ IP BAN SYSTEM (In-Memory) ============
const ipViolations = new Map();
const BAN_THRESHOLD = 10; // 10 security violations = ban
const BAN_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const trackViolation = (req) => {
  const ip = req.ip;
  const current = ipViolations.get(ip) || { count: 0, banTime: 0 };
  
  current.count++;
  current.lastViolation = Date.now();
  
  if (current.count >= BAN_THRESHOLD) {
    current.banTime = Date.now() + BAN_DURATION;
    console.error(`[Security] BANNED IP: ${ip} for excessive violations`);
  }
  
  ipViolations.set(ip, current);
};

const checkBan = (req, res, next) => {
  const ip = req.ip;
  const record = ipViolations.get(ip);
  
  if (record && record.banTime > Date.now()) {
    return res.status(403).json({ success: false, error: 'Your IP has been temporarily banned due to suspicious activity.' });
  }
  
  next();
};

// ============ ADVANCED BOT PROTECTION ============
const blockBadBots = (req, res, next) => {
  const ua = req.get('User-Agent');
  if (!ua) return next();
  
  const badBots = [
    'sqlmap', 'nikto', 'curb', 'masscan', 'nmap', 'jndi',
    'python-requests', 'libwww-perl', 'urllib', 'wget', 'curl'
  ];
  
  if (badBots.some(bot => ua.toLowerCase().includes(bot))) {
    console.warn(`[Security] Blocked bad bot: ${ua} from ${req.ip}`);
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  next();
};

// ============ SECURITY HEADERS (Helmet) ============
const isProduction = process.env.NODE_ENV === 'production';

// Build CSP directives with stricter settings in production
const styleSrc = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://accounts.google.com"];
const scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://apis.google.com", "https://connect.facebook.net", "https://www.facebook.com", "https://www.google.com", "https://www.gstatic.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://checkout.razorpay.com", "https://*.razorpay.com"];

// Build connectSrc with additional development exceptions
const defaultConnectSrc = ["'self'", "https://blackonn.in", "https://www.blackonn.in", "https://blackonn.com", "https://www.blackonn.com", "https://accounts.google.com", "https://graph.facebook.com", "https://www.facebook.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://api.razorpay.com", "https://*.razorpay.com", "https://checkout.razorpay.com", "https://lumberjack.razorpay.com"];
if (!isProduction) {
  // Allow common local dev debugger ports and Chrome extensions during development
  defaultConnectSrc.push('http://localhost:9222', 'ws://localhost:9222', 'http://127.0.0.1:9222', 'ws://127.0.0.1:9222', 'chrome-extension:');
}

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc,
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      scriptSrc,
      scriptSrcAttr: ["'unsafe-inline'"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://www.facebook.com", "https://api.razorpay.com", "https://*.razorpay.com"],
      connectSrc: defaultConnectSrc,
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false
});

// ============ RATE LIMITING ============

// Pre-compiled regex for performance
const STATIC_FILE_REGEX = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|webp|mp4|webm|avif|br|gz)$/;
const HEALTH_PATHS = new Set(['/api/health', '/api/health/live', '/api/health/ready']);

// General API rate limiter - optimized for high traffic
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // 2000 requests per 15 minutes (doubled for high traffic)
  keyGenerator: ipKeyGenerator, // Use helper for IPv6 compatibility
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for static files and health checks (performance optimization)
  skip: (req) => {
    return STATIC_FILE_REGEX.test(req.path) || HEALTH_PATHS.has(req.path);
  },
  // Store in memory with sliding window
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// Strict rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per 15 minutes (slightly increased)
  keyGenerator: ipKeyGenerator,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// Rate limiter for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  keyGenerator: ipKeyGenerator,
  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again in 1 hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter for registration
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  keyGenerator: ipKeyGenerator,
  message: {
    success: false,
    error: 'Too many registration attempts. Please try again in 1 hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter for contact form
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 contact requests per hour per IP
  keyGenerator: ipKeyGenerator,
  message: {
    success: false,
    error: 'Too many contact requests. Please try again in 1 hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limiter for order creation
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 orders per 10 minutes per IP
  keyGenerator: ipKeyGenerator,
  message: {
    success: false,
    error: 'Too many orders. Please try again later.',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limiter for returns
const returnLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 returns per hour per IP
  keyGenerator: ipKeyGenerator,
  message: {
    success: false,
    error: 'Too many return requests. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limiter for uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour per IP
  keyGenerator: ipKeyGenerator,
  message: {
    success: false,
    error: 'Too many uploads. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ============ INPUT SANITIZATION ============

// Sanitize user input to prevent XSS while allowing basic formatting
const sanitizeInput = (obj, key = null) => {
  // Skip sanitization for passwords as they may contain special characters 
  // and are hashed before storage/comparison anyway
  if (key === 'password') return obj;

  if (typeof obj === 'string') {
    // 1. Remove scripts entirely
    let sanitized = obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // 2. Remove all HTML tags EXCEPT safe formatting tags: b, i, u, strong, em, br, p, ul, li, span
    sanitized = sanitized.replace(/<(?!(\/?(b|i|u|strong|em|br|p|ul|li|span)\b))[^>]*>/gi, '');
    
    // 3. Remove dangerous attributes (on*, javascript:, etc.) from remaining tags
    sanitized = sanitized
      .replace(/javascript:/gi, '[removed]')
      .replace(/\s+on\w+\s*=/gi, ' [removed]=')
      .replace(/expression\s*\(/gi, '[removed](');
      
    return sanitized.trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeInput);
  }
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeInput(obj[key], key);
      }
    }
    return sanitized;
  }
  return obj;
};

const sanitizationMiddleware = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  next();
};

// ============ VALIDATION HELPERS ============

const validators = {
  // Email validation
  isValidEmail: (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) && email.length <= 255;
  },

  // Password validation (min 8 chars, at least 1 upper, 1 lower, 1 number, 1 special)
  isValidPassword: (password) => {
    if (!password || password.length < 8 || password.length > 128) return false;
    
    // Allow any non-alphanumeric character as a special character
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password); // Any non-alphanumeric character
    
    return hasLowercase && hasUppercase && hasNumber && hasSpecial;
  },

  // Phone validation
  isValidPhone: (phone) => {
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    return /^\d{10,15}$/.test(cleaned);
  },

  // Name validation
  isValidName: (name) => {
    return name && 
           name.trim().length >= 2 && 
           name.trim().length <= 100 &&
           /^[a-zA-Z\s\-'\.]+$/.test(name.trim());
  },

  // Check for SQL/NoSQL injection patterns
  hasDangerousPatterns: (str) => {
    if (typeof str !== 'string') return false;
    const patterns = [
      /(\$where|\$gt|\$lt|\$ne|\$eq|\$regex)/i, // MongoDB operators
      /(union\s+select|select\s+\*|drop\s+table|insert\s+into|delete\s+from)/i, // SQL
      /(<script|javascript:|on\w+\s*=)/i // XSS
    ];
    return patterns.some(pattern => pattern.test(str));
  },

  // Validate file upload
  isValidFileType: (mimetype, allowedTypes) => {
    return allowedTypes.includes(mimetype);
  },

  // Validate file size (in bytes)
  isValidFileSize: (size, maxSize) => {
    return size <= maxSize;
  }
};

// Validation middleware factory
const validateRequest = (validations) => {
  // Support two styles:
  // 1) An array of express-validator chains: validateRequest([ body('name')... ])
  // 2) An object-based simple schema used by the original implementation
  if (Array.isArray(validations)) {
    return async (req, res, next) => {
      try {
        // Run each express-validator middleware sequentially
        for (const validator of validations) {
          await new Promise((resolve, reject) => {
            validator(req, res, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          const errArray = errors.array().map(e => e.msg || `${e.param} ${e.msg}`);
          return res.status(400).json({ success: false, error: errArray[0], errors: errArray });
        }

        return next();
      } catch (err) {
        return next(err);
      }
    };
  }

  // Object-based (legacy) validation
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(validations)) {
      const value = req.body[field];

      if (rules.required && (!value || (typeof value === 'string' && !value.trim()))) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value) {
        if (rules.email && !validators.isValidEmail(value)) {
          errors.push('Invalid email format');
        }
        if (rules.password && !validators.isValidPassword(value)) {
          errors.push('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
        }
        if (rules.phone && !validators.isValidPhone(value)) {
          errors.push('Invalid phone number');
        }
        if (rules.name && !validators.isValidName(value)) {
          errors.push('Invalid name format');
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must be less than ${rules.maxLength} characters`);
        }
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        if (validators.hasDangerousPatterns(value)) {
          errors.push('Invalid characters detected');
          trackViolation(req);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors[0],
        errors: errors
      });
    }

    next();
  };
};

// ============ SECURITY LOGGING ============

// Throttle logging to prevent log flooding under high traffic
let lastLogTime = 0;
const LOG_THROTTLE_MS = 5000; // Only log security events every 5 seconds max

const securityLogger = (req, res, next) => {
  // Skip logging for static assets entirely
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|webp|mp4|webm)$/)) {
    return next();
  }
  
  const start = Date.now();
  
  res.on('finish', () => {
    // Only log actual security issues, not normal traffic
    if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
      // Don't log expected 401s for auth/me or cart/wishlist
      if (res.statusCode === 401 && (req.path === '/api/auth/me' || req.path === '/api/cart' || req.path === '/api/wishlist')) {
        return;
      }

      const now = Date.now();
      
      // Throttle security logging to prevent log flooding
      if (now - lastLogTime > LOG_THROTTLE_MS) {
        lastLogTime = now;
        const duration = now - start;
        const logData = {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip
        };
        console.warn('🔒 Security:', JSON.stringify(logData));
      }
    }
  });
  
  next();
};

// ============ PREVENT PARAMETER POLLUTION ============
const parameterPollution = hpp({
  whitelist: ['sort', 'fields', 'page', 'limit', 'category', 'size', 'color']
});

// ============ TRUSTED PROXY SETTINGS ============
const configureTrust = (app) => {
  // Trust first proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);
};

// ============ EXPORTS ============
module.exports = {
  securityHeaders,
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  registrationLimiter,
  contactLimiter,
  uploadLimiter,
  orderLimiter,
  returnLimiter,
  sanitizationMiddleware,
  validateRequest,
  validators,
  securityLogger,
  parameterPollution,
  configureTrust,
  checkBan,
  blockBadBots,
  trackViolation
};
