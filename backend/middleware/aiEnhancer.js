/**
 * AI Enhancement Middleware
 * Adds AI-friendly features to all routes automatically
 */

const crypto = require('crypto');

/**
 * AI Request Logger - Logs all requests in AI-friendly format
 */
const aiRequestLogger = (req, res, next) => {
  const requestId = crypto.randomBytes(8).toString('hex');
  const startTime = Date.now();
  
  req.aiContext = {
    requestId,
    startTime,
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  };
  
  console.log(`[AI-REQUEST] ${requestId} | ${req.method} ${req.path} | Started`);
  
  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[AI-REQUEST] ${requestId} | ${req.method} ${req.path} | ${res.statusCode} | ${duration}ms`);
  });
  
  next();
};

/**
 * AI Response Enricher - Adds AI metadata to all responses
 */
const aiResponseEnricher = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = (data) => {
    // Don't double-enrich if already has _aiEnriched
    if (data && data._aiEnriched) {
      return originalJson(data);
    }
    
    const enrichedData = {
      ...data,
      _aiMetadata: {
        requestId: req.aiContext?.requestId,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - (req.aiContext?.startTime || Date.now()),
        endpoint: req.path,
        method: req.method,
        version: '1.0.0',
        machineReadable: true,
        structured: true
      }
    };
    
    return originalJson(enrichedData);
  };
  
  next();
};

/**
 * AI Error Handler - Converts errors to AI-friendly format
 */
const aiErrorHandler = (err, req, res, next) => {
  const errorId = crypto.randomBytes(8).toString('hex');
  const statusCode = err.statusCode || err.status || 500;
  
  // Analyze error for AI
  const errorCategory = categorizeError(err);
  const severity = calculateSeverity(statusCode);
  const retryable = isRetryable(statusCode);
  
  console.error(`[AI-ERROR] ${errorId} | ${err.message} | ${req.method} ${req.path}`, {
    stack: err.stack,
    category: errorCategory,
    severity
  });
  
  const aiErrorResponse = {
    success: false,
    error: {
      message: err.message || 'An error occurred',
      code: err.code || 'INTERNAL_ERROR',
      errorId,
      statusCode
    },
    _aiAnalysis: {
      category: errorCategory,
      severity,
      retryable,
      timestamp: new Date().toISOString(),
      requestId: req.aiContext?.requestId,
      suggestedAction: getSuggestedAction(errorCategory, statusCode)
    }
  };
  
  res.status(statusCode).json(aiErrorResponse);
};

/**
 * Categorize error for AI analysis
 */
function categorizeError(err) {
  const message = err.message?.toLowerCase() || '';
  
  if (message.includes('not found') || err.statusCode === 404) {
    return 'NOT_FOUND';
  }
  if (message.includes('unauthorized') || message.includes('auth') || err.statusCode === 401) {
    return 'AUTHENTICATION';
  }
  if (message.includes('forbidden') || err.statusCode === 403) {
    return 'AUTHORIZATION';
  }
  if (message.includes('validation') || message.includes('invalid') || err.statusCode === 400) {
    return 'VALIDATION';
  }
  if (message.includes('database') || message.includes('connection')) {
    return 'DATABASE';
  }
  if (message.includes('timeout')) {
    return 'TIMEOUT';
  }
  
  return 'INTERNAL';
}

/**
 * Calculate error severity
 */
function calculateSeverity(statusCode) {
  if (statusCode >= 500) return 'critical';
  if (statusCode >= 400 && statusCode < 500) return 'warning';
  return 'info';
}

/**
 * Check if error is retryable
 */
function isRetryable(statusCode) {
  // 5xx errors and 429 (rate limit) are retryable
  return statusCode >= 500 || statusCode === 429;
}

/**
 * Get suggested action for error
 */
function getSuggestedAction(category, statusCode) {
  const actions = {
    'NOT_FOUND': 'Check if the resource exists or the URL is correct',
    'AUTHENTICATION': 'Please log in or refresh your authentication token',
    'AUTHORIZATION': 'You do not have permission to access this resource',
    'VALIDATION': 'Check your input data and try again',
    'DATABASE': 'Temporary database issue, please retry in a moment',
    'TIMEOUT': 'Request took too long, please retry',
    'INTERNAL': 'An unexpected error occurred, please contact support'
  };
  
  return actions[category] || 'Please try again later';
}

/**
 * AI Performance Monitor - Tracks slow requests
 */
const aiPerformanceMonitor = (threshold = 1000) => (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (duration > threshold) {
      // Don't log slow requests for auth/me or settings probes as they are common on startup
      if (req.path === '/api/auth/me' || req.path.includes('/settings/')) {
        return;
      }
      
      console.warn(`[AI-PERFORMANCE] Slow request detected`, {
        requestId: req.aiContext?.requestId,
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        threshold: `${threshold}ms`,
        statusCode: res.statusCode,
        aiRecommendation: 'Consider optimizing this endpoint or adding caching'
      });
    }
  });
  
  next();
};

/**
 * AI Data Validator - Validates request data structure
 */
const aiDataValidator = (schema) => (req, res, next) => {
  if (!schema) return next();
  
  const data = req.body;
  const errors = [];
  
  // Simple validation
  for (const [field, rules] of Object.entries(schema)) {
    if (rules.required && !data[field]) {
      errors.push({
        field,
        message: `${field} is required`,
        type: 'MISSING_FIELD'
      });
    }
    
    if (data[field] && rules.type && typeof data[field] !== rules.type) {
      errors.push({
        field,
        message: `${field} must be of type ${rules.type}`,
        type: 'TYPE_MISMATCH'
      });
    }
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      validationErrors: errors,
      _aiAnalysis: {
        category: 'VALIDATION',
        severity: 'warning',
        retryable: false,
        suggestion: 'Please correct the validation errors and retry'
      }
    });
  }
  
  next();
};

module.exports = {
  aiRequestLogger,
  aiResponseEnricher,
  aiErrorHandler,
  aiPerformanceMonitor,
  aiDataValidator
};
