/**
 * Authentication Middleware
 * Enhanced security with httpOnly cookies - No localStorage
 * Cloud-ready for any hosting platform
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../utils/database');

const JWT_SECRET = process.env.JWT_SECRET || 'blackonn_jwt_secret_2025_change_in_production';
// Make sessions effectively persistent by default (adjustable via env)
// Default: 10 years (in seconds / milliseconds)
const DEFAULT_SESSION_YEARS = parseInt(process.env.SESSION_YEARS || '10', 10);
const TOKEN_EXPIRY_SECONDS = DEFAULT_SESSION_YEARS * 365 * 24 * 60 * 60; // numeric seconds for JWT
const ADMIN_TOKEN_EXPIRY_SECONDS = TOKEN_EXPIRY_SECONDS; // same long expiry for admins by default
const COOKIE_NAME = 'blackonn_session';

// Cookie configuration for different environments
// Supports both HTTP and HTTPS based on actual request protocol
// Default cookie/session lifetime in milliseconds
const DEFAULT_SESSION_MS = TOKEN_EXPIRY_SECONDS * 1000;

const getCookieOptions = (isAdmin = false, req = null) => {
  const isProduction = process.env.NODE_ENV === 'production';
  // Detect if request is over HTTPS (works with reverse proxies)
  const isSecure = req 
    ? (req.secure || req.headers['x-forwarded-proto'] === 'https') 
    : isProduction;
  const maxAge = DEFAULT_SESSION_MS; // persistent by default

  return {
    httpOnly: true,                            // Prevents JavaScript access (XSS protection)
    secure: isSecure,                          // HTTPS only when on secure connection
    sameSite: isSecure ? 'strict' : 'lax',     // CSRF protection
    maxAge: maxAge,                            // Cookie expiry
    path: '/',                                 // Available for all paths
    signed: true                               // Sign the cookie
  };
};

// Verify JWT token from httpOnly cookie or Authorization header
const authenticate = (req, res, next) => {
  try {
    let token = null;

    // Priority 1: httpOnly signed cookie (browser)
    if (req.signedCookies && req.signedCookies[COOKIE_NAME]) {
      token = req.signedCookies[COOKIE_NAME];
    }
    // Priority 2: Authorization header (API clients)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'NO_TOKEN' });
    }

    // Basic token format check
    if (token.split('.').length !== 3) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.status(401).json({ success: false, error: 'Invalid token format', code: 'INVALID_TOKEN' });
    }

    // Try to decode token. Allow expired tokens here so we can perform sliding/session logic
    let decoded;
    try {
      // Prefer normal verification (will throw on expiry)
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        // Decode ignoring expiration so we can re-issue a fresh token if session still valid
        try {
          decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        } catch (err2) {
          res.clearCookie(COOKIE_NAME, { path: '/' });
          return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
        }
      } else {
        res.clearCookie(COOKIE_NAME, { path: '/' });
        return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
      }
    }

    // Find session by token and user id
    const session = db.sessions.findOne({ token, userId: decoded.id });
    if (!session) {
      // Token not associated with an active session
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.status(401).json({ success: false, error: 'Invalid session', code: 'INVALID_SESSION' });
    }

    // If session expired in DB, remove it and ask client to re-login
    if (new Date(session.expiresAt) < new Date()) {
      db.sessions.delete(session.id);
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.status(401).json({ success: false, error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    // Sliding expiration: extend session expiresAt on each authenticated request
    const newExpiresAt = new Date(Date.now() + DEFAULT_SESSION_MS).toISOString();

    // If token was expired (but session still valid) or nearing expiry, re-issue token
    const nowSec = Math.floor(Date.now() / 1000);
    const tokenExpSec = decoded.exp || 0;
    const tokenIsExpired = tokenExpSec && tokenExpSec < nowSec;

    let activeToken = token;
    // Re-issue a fresh JWT if the previous one expired (or you can add a "nearing expiry" threshold here)
    if (tokenIsExpired) {
      // Fetch up-to-date user record when available
      const userRecord = db.users.findById(decoded.id) || decoded;
      const newToken = generateToken(userRecord);
      // Update session token and expiry
      db.sessions.update(session.id, { token: newToken, lastActivity: new Date().toISOString(), expiresAt: newExpiresAt });
      // Refresh cookie for browser clients
      setAuthCookie(res, newToken, (userRecord.role === 'admin'), req);
      activeToken = newToken;
    } else {
      // Just refresh lastActivity and expiry and reset cookie expiry to keep it persistent
      db.sessions.update(session.id, { lastActivity: new Date().toISOString(), expiresAt: newExpiresAt });
      try {
        // Reset cookie so browser expiry is extended on each request
        setAuthCookie(res, token, (decoded.role === 'admin'), req);
      } catch (e) {
        // Ignore cookie set errors
      }
    }

    req.user = decoded;
    req.token = activeToken;
    req.session = db.sessions.findById(session.id) || session;
    next();
  } catch (error) {
    // Clear cookie on any auth error
    res.clearCookie(COOKIE_NAME, { path: '/' });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    return res.status(401).json({ success: false, error: 'Authentication failed' });
  }
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// Optional auth - doesn't fail if no token
const optionalAuth = (req, res, next) => {
  try {
    let token = null;
    
    // Check httpOnly cookie first
    if (req.signedCookies && req.signedCookies[COOKIE_NAME]) {
      token = req.signedCookies[COOKIE_NAME];
    }
    // Then check Authorization header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (token && token.split('.').length === 3) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      req.token = token;
    }
  } catch (error) {
    // Ignore errors, proceed without auth
  }
  next();
};

// Generate JWT token with role-based expiry (seconds)
const generateToken = (user) => {
  const expiry = user.role === 'admin' ? ADMIN_TOKEN_EXPIRY_SECONDS : TOKEN_EXPIRY_SECONDS;
  // Include a unique JWT ID (jti) to avoid producing identical tokens when issued rapidly
  const jwtId = crypto.randomUUID();
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || 'customer',
      name: user.name,
      iat: Math.floor(Date.now() / 1000) // Issued at timestamp
    },
    JWT_SECRET,
    { expiresIn: expiry, jwtid: jwtId }
  );
};

// Set auth cookie on response
const setAuthCookie = (res, token, isAdmin = false, req = null) => {
  res.cookie(COOKIE_NAME, token, getCookieOptions(isAdmin, req));
};

// Clear auth cookie
const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
};

// Create a session with security metadata
const createSession = (user, token, req, res) => {
  const session = {
    id: crypto.randomUUID(),
    userId: user.id,
    token,
    userAgent: req.get('User-Agent')?.substring(0, 200) || 'Unknown',
    ipAddress: req.ip || req.connection.remoteAddress,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    // Use DEFAULT_SESSION_MS to create a long-lived session by default
    expiresAt: new Date(Date.now() + DEFAULT_SESSION_MS).toISOString()
  };
  
  db.sessions.create(session);
  
  // Set httpOnly cookie (pass req for HTTP/HTTPS detection)
  if (res) {
    setAuthCookie(res, token, user.role === 'admin', req);
  }
  
  return session;
};

// Invalidate all sessions for a user (for password change, etc.)
const invalidateAllSessions = (userId) => {
  const sessions = db.sessions.find({ userId });
  sessions.forEach(session => {
    db.sessions.delete(session.id);
  });
  return sessions.length;
};

// Clean up expired sessions (should be called periodically)
const cleanupExpiredSessions = () => {
  const sessions = db.sessions.findAll();
  const now = new Date();
  let cleaned = 0;
  
  sessions.forEach(session => {
    if (new Date(session.expiresAt) < now) {
      db.sessions.delete(session.id);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
  }
  
  return cleaned;
};

// Run session cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

module.exports = {
  authenticate,
  isAdmin,
  requireAdmin: isAdmin,  // Alias for consistency
  optionalAuth,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  createSession,
  invalidateAllSessions,
  cleanupExpiredSessions,
  COOKIE_NAME,
  JWT_SECRET
};
