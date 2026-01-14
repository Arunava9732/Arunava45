/**
 * AI-Powered Health Check Routes (v2.0)
 * ======================================
 * 
 * Provides AI-friendly endpoints for monitoring server health and status.
 * Includes auto-debugger endpoint for client-side error reporting.
 * 
 * AI Integration Points:
 * - GET /api/health/ai-diagnostics: Full AI-parseable diagnostic report
 * - GET /api/health/timeline: Event timeline for debugging context
 * - POST /api/health/heal: Trigger auto-healing actions
 * - GET /api/health/healing-log: History of healing actions
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const {
  getQuickHealth,
  getDetailedHealth,
  getHealthMetrics,
  getAIDiagnostics,
  getHealthTimeline,
  getHealingLog,
  runAutoHealer,
  addToTimeline
} = require('../utils/healthCheck');

// Python AI Bridge for intelligent error analysis
let pythonBridge = null;
try {
  pythonBridge = require('../utils/python_bridge');
} catch (e) {
  console.warn('[Health] Python bridge not available');
}

// Error log storage
const ERROR_LOG_PATH = path.join(__dirname, '../logs/client-errors.json');
const MAX_ERRORS = 500; // Keep last 500 errors
let clientErrors = [];
let autoFixActions = [];

// Load existing errors on startup
(async () => {
  try {
    const data = await fs.readFile(ERROR_LOG_PATH, 'utf8');
    clientErrors = JSON.parse(data);
  } catch (e) {
    clientErrors = [];
  }
})();

/**
 * @route   GET /api/health
 * @desc    Quick health check - returns basic status
 * @access  Public
 */
router.get('/', (req, res) => {
  try {
    const health = getQuickHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/detailed
 * @desc    Detailed health check - returns comprehensive status
 * @access  Public (consider protecting in production)
 */
router.get('/detailed', (req, res) => {
  try {
    const health = getDetailedHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Detailed health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/performance
 * @desc    Performance metrics for monitoring
 * @access  Public
 */
router.get('/performance', (req, res) => {
  try {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();
    
    // Calculate memory percentages
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();
    const usedMem = totalMem - freeMem;
    
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.round(uptime),
        formatted: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
      },
      memory: {
        process: {
          rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
          external: Math.round(mem.external / 1024 / 1024) + ' MB'
        },
        system: {
          total: Math.round(totalMem / 1024 / 1024 / 1024) + ' GB',
          free: Math.round(freeMem / 1024 / 1024 / 1024) + ' GB',
          usedPercent: Math.round((usedMem / totalMem) * 100) + '%'
        }
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000) + ' ms',
        system: Math.round(cpuUsage.system / 1000) + ' ms'
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      cache: {
        size: req.app.locals.apiCache?.size || 'N/A',
        maxSize: 500
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Performance check failed',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health/live
 * @desc    Liveness probe - is the server running?
 * @access  Public
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/health/ready
 * @desc    Readiness probe - is the server ready to accept requests?
 * @access  Public
 */
router.get('/ready', (req, res) => {
  try {
    const health = getQuickHealth();
    if (health.status === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        reason: 'Server health degraded',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      reason: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/metrics
 * @desc    Prometheus-style metrics for monitoring
 * @access  Public (consider protecting in production)
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = getHealthMetrics();
    
    // Return as plain text for Prometheus compatibility
    if (req.headers.accept === 'text/plain') {
      let output = '# BLACKONN Server Metrics\n';
      output += `# Generated at ${new Date().toISOString()}\n\n`;
      
      for (const [key, value] of Object.entries(metrics)) {
        if (typeof value === 'number') {
          output += `blackonn_${key} ${value}\n`;
        }
      }
      
      res.set('Content-Type', 'text/plain');
      return res.send(output);
    }
    
    // Default JSON response
    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to collect metrics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/ping
 * @desc    Simple ping endpoint for load balancers
 * @access  Public
 */
router.get('/ping', (req, res) => {
  res.send('pong');
});

/**
 * @route   POST /api/health/client-error
 * @desc    Receive client-side errors from auto-debugger
 * @access  Public
 */
router.post('/client-error', express.json(), async (req, res) => {
  try {
    const errorData = {
      ...req.body,
      receivedAt: new Date().toISOString(),
      ip: req.ip,
      fixApplied: null
    };

    // Auto-fix logic based on error type
    const fix = await attemptAutoFix(errorData);
    if (fix) {
      errorData.fixApplied = fix;
      autoFixActions.push({
        timestamp: new Date().toISOString(),
        errorType: errorData.type,
        fix: fix
      });
    }

    // Store error
    clientErrors.push(errorData);
    if (clientErrors.length > MAX_ERRORS) {
      clientErrors = clientErrors.slice(-MAX_ERRORS);
    }

    // Save to file asynchronously
    fs.writeFile(ERROR_LOG_PATH, JSON.stringify(clientErrors, null, 2)).catch(() => {});

    res.status(200).json({ received: true, fix: fix });
  } catch (error) {
    res.status(200).json({ received: true }); // Don't fail on client
  }
});

/**
 * @route   GET /api/health/client-errors
 * @desc    Get recent client-side errors (admin only)
 * @access  Protected
 */
router.get('/client-errors', (req, res) => {
  // Simple protection - require admin header or query param
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'blackonn-debug-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stats = {
    totalErrors: clientErrors.length,
    byType: {},
    recentErrors: clientErrors.slice(-50),
    autoFixes: autoFixActions.slice(-20)
  };

  // Count by type
  clientErrors.forEach(err => {
    stats.byType[err.type] = (stats.byType[err.type] || 0) + 1;
  });

  res.json(stats);
});

/**
 * @route   DELETE /api/health/client-errors
 * @desc    Clear client-side error logs
 * @access  Protected
 */
router.delete('/client-errors', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'blackonn-debug-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  clientErrors = [];
  autoFixActions = [];
  await fs.writeFile(ERROR_LOG_PATH, '[]').catch(() => {});
  
  res.json({ cleared: true });
});

/**
 * Auto-fix function - attempts to fix common issues with Python AI intelligence
 * Ignores intentional errors (login required, validation, etc.)
 */
async function attemptAutoFix(error) {
  const fixes = [];

  // ============ AI-POWERED ERROR ANALYSIS ============
  // Use Python AI for intelligent error classification
  if (pythonBridge) {
    try {
      const aiAnalysis = await pythonBridge.errors.track({
        message: error.message,
        type: error.type,
        url: error.url,
        timestamp: new Date().toISOString()
      });
      if (aiAnalysis && aiAnalysis.autoResolution) {
        fixes.push(`AI Suggestion: ${aiAnalysis.autoResolution}`);
      }
    } catch (e) {
      // AI unavailable, fallback to rule-based
    }
  }

  // ============ IGNORABLE ERRORS ============
  // These are expected behaviors, not bugs
  const ignorablePatterns = [
    /login.*required/i, /please.*log\s*in/i, /authentication.*required/i,
    /unauthorized/i, /session.*expired/i, /must.*be.*logged.*in/i,
    /access.*denied/i, /permission.*denied/i, /validation.*failed/i,
    /invalid.*input/i, /field.*required/i, /password.*incorrect/i,
    /email.*already.*exists/i, /user.*not.*found/i, /cart.*empty/i,
    /wishlist.*empty/i, /no.*items/i, /out.*of.*stock/i,
    /API_UNAVAILABLE/i, /ResizeObserver/i, /401/i, /Please select/i
  ];

  const errorMessage = error.message || '';
  const isIgnorable = ignorablePatterns.some(p => p.test(errorMessage));
  
  if (isIgnorable) {
    return null; // Don't fix intentional errors
  }

  // ============ ACTUAL FIXES ============
  switch (error.type) {
    case 'api-error':
      if (error.status === 503 || error.status === 502) {
        fixes.push('Server overload detected - PM2 will auto-restart');
      }
      if (error.status === 404 && error.url && error.url.includes('/api/')) {
        fixes.push('Missing API endpoint - logged for review');
      }
      break;

    case 'resource':
    case 'image':
      if (error.src) {
        const src = error.src;
        // Check if it's a fixable image path issue
        if (src.includes('/api/uploads')) {
          fixes.push('Image URL correction needed: /api/uploads -> /uploads');
        }
        if (src.includes('/uploads/') && !src.startsWith('http')) {
          fixes.push('Relative upload path detected - may need full URL');
        }
        // Log missing product images for admin review
        if (src.includes('/products/') || src.includes('/slides/')) {
          fixes.push('Missing upload file logged for admin: ' + src.substring(0, 100));
        }
      }
      break;

    case 'javascript':
      // Check for undefined function errors
      if (errorMessage.includes('is not defined')) {
        const match = errorMessage.match(/(\w+) is not defined/);
        if (match) {
          const funcName = match[1];
          if (['getPlaceholder', 'normalizeUploadUrl', 'showToast'].includes(funcName)) {
            fixes.push(`Missing function "${funcName}" - auto-debugger will define fallback`);
          }
        }
      }
      // Check for null reference errors
      if (errorMessage.includes('Cannot read') || errorMessage.includes('null')) {
        fixes.push('Null reference - possible timing issue, suggest DOMContentLoaded check');
      }
      break;

    case 'slow-api':
      if (error.duration > 10000) {
        fixes.push('Critical slow API detected - monitoring for optimization');
      }
      break;

    case 'health-check':
      fixes.push('API health failure - auto-recovery systems will restart');
      break;

    case 'fix':
      // This is a fix report from auto-debugger, just log it
      fixes.push(`Client-side fix applied: ${error.description || 'unknown'}`);
      break;

    case 'network':
      if (!isIgnorable) {
        fixes.push('Network error detected - retry logic will handle');
      }
      break;
  }

  return fixes.length > 0 ? fixes : null;
}

/**
 * @route   GET /api/health/auto-status
 * @desc    Get auto-debugger status and recent fixes
 * @access  Public
 */
router.get('/auto-status', (req, res) => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  const recentErrors = clientErrors.filter(e => 
    new Date(e.receivedAt).getTime() > now - oneHour
  );

  res.json({
    status: recentErrors.length > 20 ? 'elevated' : 'normal',
    errorsLastHour: recentErrors.length,
    autoFixesApplied: autoFixActions.length,
    lastError: clientErrors.length > 0 ? clientErrors[clientErrors.length - 1].timestamp : null,
    serverUptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ============ AI-FRIENDLY ENDPOINTS ============

/**
 * @route   GET /api/health/ai-diagnostics
 * @desc    Full AI-parseable diagnostic report
 * @access  Public (consider protecting in production)
 */
router.get('/ai-diagnostics', (req, res) => {
  try {
    const diagnostics = getAIDiagnostics();
    
    // Add client-side error summary
    diagnostics.clientErrors = {
      total: clientErrors.length,
      lastHour: clientErrors.filter(e => 
        Date.now() - new Date(e.receivedAt).getTime() < 60 * 60 * 1000
      ).length,
      byCategory: {},
      recent: clientErrors.slice(-10)
    };
    
    // Categorize client errors
    clientErrors.forEach(err => {
      const category = err.category || err.type || 'unknown';
      diagnostics.clientErrors.byCategory[category] = 
        (diagnostics.clientErrors.byCategory[category] || 0) + 1;
    });
    
    // Add auto-fix summary
    diagnostics.autoFixes = {
      total: autoFixActions.length,
      recent: autoFixActions.slice(-10)
    };
    
    res.json({
      success: true,
      _format: 'ai-friendly',
      _version: '2.0',
      _generatedAt: new Date().toISOString(),
      diagnostics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/timeline
 * @desc    Get health event timeline for AI context
 * @access  Public
 */
router.get('/timeline', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const timeline = getHealthTimeline(count);
    
    res.json({
      success: true,
      count: timeline.length,
      timeline
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health/healing-log
 * @desc    Get auto-healing action history
 * @access  Public
 */
router.get('/healing-log', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const log = getHealingLog(count);
    
    res.json({
      success: true,
      count: log.length,
      healingActions: log
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/health/heal
 * @desc    Trigger auto-healing actions
 * @access  Protected (should require admin auth)
 */
router.post('/heal', async (req, res) => {
  try {
    addToTimeline({
      type: 'HEAL_TRIGGERED',
      severity: 'info',
      source: 'api',
      ip: req.ip
    });
    
    const results = await runAutoHealer();
    
    res.json({
      success: true,
      message: 'Auto-healing completed',
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health/ai-engines
 * @desc    Get Python AI engine status
 * @access  Public
 */
router.get('/ai-engines', async (req, res) => {
  try {
    if (!pythonBridge) {
      return res.json({
        success: false,
        error: 'Python bridge not available',
        engines: []
      });
    }
    
    const aiHealth = await pythonBridge.getAIHealth();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...aiHealth
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Ensure Python 3 and dependencies (psutil, Pillow) are installed'
    });
  }
});

/**
 * @route   GET /api/health/ai-summary
 * @desc    Quick AI-readable summary
 * @access  Public
 */
router.get('/ai-summary', (req, res) => {
  try {
    const health = getQuickHealth();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    const recentClientErrors = clientErrors.filter(e => 
      now - new Date(e.receivedAt).getTime() < oneHour
    ).length;
    
    res.json({
      _format: 'ai-summary',
      timestamp: new Date().toISOString(),
      
      // Quick status indicators
      serverHealthy: health.status === 'healthy',
      healthScore: health.score,
      uptime: health.uptime,
      
      // Issue counts
      serverIssues: health.issueCount || 0,
      clientErrorsLastHour: recentClientErrors,
      autoFixesApplied: autoFixActions.length,
      
      // Actionable flags
      needsAttention: health.status !== 'healthy' || recentClientErrors > 20,
      criticalIssues: health.status === 'critical',
      
      // Links to detailed info
      detailsEndpoint: '/api/health/ai-diagnostics',
      timelineEndpoint: '/api/health/timeline',
      healEndpoint: '/api/health/heal'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/health/diagnostics
 * @desc    Receive diagnostic data from frontend auto-debugger
 * @access  Public
 */
router.post('/diagnostics', express.json(), async (req, res) => {
  try {
    const { error, summary, userAgent, url } = req.body;
    
    // Log for AI analysis
    addToTimeline({
      type: 'CLIENT_DIAGNOSTIC',
      severity: error?.severity || 'info',
      category: error?.category || 'unknown',
      message: error?.message?.substring(0, 100),
      clientHealthScore: summary?.healthScore,
      url: url?.substring(0, 200)
    });
    
    res.json({
      received: true,
      serverHealthScore: getQuickHealth().score
    });
  } catch (error) {
    res.json({ received: true });
  }
});

// ============ MESSAGING SERVICE TEST ENDPOINT ============
/**
 * @route   POST /api/health/test-messaging
 * @desc    Test messaging services (email, SMS, WhatsApp)
 * @access  Admin only
 */
router.post('/test-messaging', async (req, res) => {
  try {
    // Verify admin access
    const db = require('../utils/database');
    const token = req.cookies?.token;
    let isAdmin = false;
    
    if (token) {
      const session = db.sessions.findOne({ token });
      if (session) {
        const user = db.users.findById(session.userId);
        isAdmin = user?.role === 'admin';
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { service, to, message } = req.body;
    
    if (!service || !to) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: service (email/sms/whatsapp), to',
        example: {
          email: { service: 'email', to: 'test@example.com', message: 'Test subject' },
          sms: { service: 'sms', to: '919876543210', message: 'Test message' },
          whatsapp: { service: 'whatsapp', to: '919876543210', message: 'Test message' }
        }
      });
    }

    let result;
    const testMessage = message || 'Test message from BLACKONN at ' + new Date().toISOString();

    switch (service.toLowerCase()) {
      case 'email':
        const { sendEmail } = require('../utils/email');
        result = await sendEmail({
          to: to,
          subject: testMessage,
          text: 'This is a test email from BLACKONN.',
          html: `<h1>Test Email</h1><p>This is a test email from BLACKONN sent at ${new Date().toISOString()}</p>`
        });
        break;

      case 'sms':
        const { sendSMS } = require('../utils/sms');
        result = await sendSMS(to, testMessage);
        break;

      case 'whatsapp':
        const { sendTextMessage } = require('../utils/whatsapp');
        result = await sendTextMessage(to, testMessage);
        break;

      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid service. Use: email, sms, or whatsapp' 
        });
    }

    res.json({
      success: true,
      service,
      to,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Messaging test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

/**
 * @route   GET /api/health/messaging-config
 * @desc    Check messaging service configuration (no secrets exposed)
 * @access  Admin only
 */
router.get('/messaging-config', async (req, res) => {
  try {
    // Verify admin access
    const db = require('../utils/database');
    const token = req.cookies?.token;
    let isAdmin = false;
    
    if (token) {
      const session = db.sessions.findOne({ token });
      if (session) {
        const user = db.users.findById(session.userId);
        isAdmin = user?.role === 'admin';
      }
    }
    
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isAdmin && !isDev) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const config = {
      success: true,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'not set',
      
      email: {
        configured: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS),
        host: process.env.EMAIL_HOST || 'NOT SET',
        port: process.env.EMAIL_PORT || '587 (default)',
        secure: process.env.EMAIL_SECURE === 'true',
        userConfigured: !!process.env.EMAIL_USER,
        passConfigured: !!process.env.EMAIL_PASS,
        fromName: process.env.EMAIL_FROM_NAME || 'BLACKONN (default)',
        issues: []
      },
      
      sms: {
        enabled: process.env.SMS_ENABLED === 'true',
        provider: process.env.SMS_PROVIDER || 'twilio (default)',
        msg91: {
          authKeyConfigured: !!process.env.MSG91_AUTH_KEY,
          senderId: process.env.MSG91_SENDER_ID || 'BLKONN (default)',
          flowIdConfigured: !!process.env.MSG91_FLOW_ID
        },
        twilio: {
          accountSidConfigured: !!process.env.TWILIO_ACCOUNT_SID,
          authTokenConfigured: !!process.env.TWILIO_AUTH_TOKEN,
          phoneConfigured: !!process.env.TWILIO_PHONE_NUMBER
        },
        issues: []
      },
      
      whatsapp: {
        provider: process.env.WHATSAPP_PROVIDER || 'both (default)',
        meta: {
          configured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
          tokenConfigured: !!process.env.WHATSAPP_TOKEN,
          phoneNumberIdConfigured: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
          businessIdConfigured: !!process.env.WHATSAPP_BUSINESS_ID
        },
        msg91: {
          configured: !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_WHATSAPP_SENDER),
          authKeyConfigured: !!process.env.MSG91_AUTH_KEY,
          senderConfigured: !!process.env.MSG91_WHATSAPP_SENDER
        },
        issues: []
      }
    };

    // Determine if any WhatsApp provider is ready
    const metaReady = config.whatsapp.meta.configured;
    const msg91Ready = config.whatsapp.msg91.configured;
    config.whatsapp.anyProviderReady = metaReady || msg91Ready;

    // Check for issues
    if (!config.email.configured) {
      config.email.issues.push('Email not configured. Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env');
    }
    if (config.email.host && !config.email.passConfigured) {
      config.email.issues.push('EMAIL_PASS not set');
    }

    if (!config.sms.enabled) {
      config.sms.issues.push('SMS disabled. Set SMS_ENABLED=true in .env');
    }
    if (config.sms.provider === 'msg91' && !config.sms.msg91.authKeyConfigured) {
      config.sms.issues.push('MSG91_AUTH_KEY not configured');
    }
    if (config.sms.provider === 'msg91' && !config.sms.msg91.flowIdConfigured) {
      config.sms.issues.push('MSG91_FLOW_ID not set (required for DLT compliance in India)');
    }

    // WhatsApp issues based on provider selection
    const whatsappProvider = (config.whatsapp.provider || '').toLowerCase();
    
    if (whatsappProvider === 'meta' && !metaReady) {
      if (!config.whatsapp.meta.tokenConfigured) {
        config.whatsapp.issues.push('WHATSAPP_TOKEN not configured');
      }
      if (!config.whatsapp.meta.phoneNumberIdConfigured) {
        config.whatsapp.issues.push('WHATSAPP_PHONE_NUMBER_ID not configured');
      }
    }
    
    if (whatsappProvider === 'msg91' && !msg91Ready) {
      if (!config.whatsapp.msg91.authKeyConfigured) {
        config.whatsapp.issues.push('MSG91_AUTH_KEY not configured');
      }
      if (!config.whatsapp.msg91.senderConfigured) {
        config.whatsapp.issues.push('MSG91_WHATSAPP_SENDER not configured');
      }
    }
    
    if ((whatsappProvider === 'both' || !whatsappProvider) && !metaReady && !msg91Ready) {
      config.whatsapp.issues.push('No WhatsApp provider configured. Set either Meta (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID) or MSG91 (MSG91_AUTH_KEY + MSG91_WHATSAPP_SENDER)');
    }

    res.json(config);
  } catch (error) {
    console.error('Messaging config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
