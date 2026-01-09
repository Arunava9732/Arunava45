/**
 * Lightweight logger wrapper for consistent timestamps and levels
 * Optimized for production - minimal output to reduce overhead
 * Features: Log Rotation, File Persistence, AI-Friendly Structured Logging
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';
const LOG_DIR = path.join(__dirname, '..', 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Helper to write to rotating log file
function writeToFile(level, message) {
  try {
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `${level.toLowerCase()}-${dateStr}.log`;
    const filePath = path.join(LOG_DIR, fileName);
    const logLine = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    
    fs.appendFileSync(filePath, logLine);
  } catch (e) {
    console.error('Logger write failed:', e);
  }
}

// Throttle repeated log messages to prevent log flooding
const logThrottle = {};
const THROTTLE_MS = 10000; // 10 seconds between repeated messages

function ts() { return new Date().toISOString(); }

function formatArgs(level, args) {
  return [`[${level}]`, ts(), ...args];
}

function shouldLog(key) {
  const now = Date.now();
  if (logThrottle[key] && now - logThrottle[key] < THROTTLE_MS) {
    return false;
  }
  logThrottle[key] = now;
  return true;
}

/**
 * Log admin activity for audit trail
 * @param {string} adminId - Admin user ID
 * @param {string} action - Action performed
 * @param {object} details - Additional details (optional)
 */
function logAdminActivity(adminId, action, details = {}) {
  const logLine = `[${ts()}] [ADMIN] [${adminId}] [${action}] ${JSON.stringify(details)}\n`;
  const filePath = path.join(LOG_DIR, 'admin-activity.log');
  fs.appendFileSync(filePath, logLine);
  
  // AI-friendly console log
  console.log(`[AI-ADMIN-ACTIVITY]`, JSON.stringify({
    timestamp: ts(),
    adminId,
    action,
    details,
    logId: crypto.randomBytes(8).toString('hex')
  }));
}

/**
 * AI-Structured Logger - Outputs machine-readable JSON logs
 * @param {string} category - Log category
 * @param {object} data - Structured data to log
 */
function aiLog(category, data) {
  const structuredLog = {
    timestamp: new Date().toISOString(),
    category,
    logId: crypto.randomBytes(8).toString('hex'),
    ...data,
    _aiReadable: true,
    _structured: true
  };
  
  console.log(`[AI-LOG]`, JSON.stringify(structuredLog));
  
  // Also write to AI log file
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `ai-logs-${dateStr}.json`;
  const filePath = path.join(LOG_DIR, fileName);
  
  try {
    // Append as JSONL (JSON Lines format)
    fs.appendFileSync(filePath, JSON.stringify(structuredLog) + '\n');
  } catch (e) {
    console.error('AI log write failed:', e);
  }
}

module.exports = {
  info: (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    writeToFile('INFO', msg);

    // In production, only log important info (skip routine messages)
    if (isProduction) {
      // Only log startup/shutdown/error-related info in production
      if (typeof msg === 'string' && (msg.includes('Started') || msg.includes('Shutdown') || msg.includes('Error'))) {
        console.log(...formatArgs('INFO', args));
      }
    } else {
      console.log(...formatArgs('INFO', args));
    }
  },
  warn: (...args) => {
    const key = 'warn:' + (args[0] || '').substring(0, 50);
    if (shouldLog(key)) {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
      writeToFile('WARN', msg);
      console.warn(...formatArgs('WARN', args));
    }
  },
  error: (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    writeToFile('ERROR', msg);
    console.error(...formatArgs('ERROR', args));
  },
  debug: (...args) => {
    if (process.env.DEBUG) {
      console.debug(...formatArgs('DEBUG', args));
    }
  },
  logAdminActivity,
  aiLog,
};
