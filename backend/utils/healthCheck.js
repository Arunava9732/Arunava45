/**
 * AI-Powered Health Check & Auto-Healing Utility (v2.0)
 * ======================================================
 * 
 * This module provides intelligent server health monitoring and self-healing:
 * 
 * AI-FRIENDLY FEATURES:
 * - Structured JSON diagnostics for AI parsing
 * - Categorized health metrics with severity levels
 * - Automatic issue detection and resolution
 * - Event timeline for debugging context
 * - Predictive health scoring
 * - Self-healing actions with logging
 * 
 * AI Integration Points:
 * - getAIDiagnostics(): Full diagnostic report for AI analysis
 * - runAutoHealer(): Trigger automatic fixes
 * - getHealthTimeline(): Chronological events for context
 * 
 * Console Tags for AI Parsing:
 * - [AI-HEALTH]: Health status updates
 * - [AI-HEAL]: Auto-healing actions
 * - [AI-METRIC]: Performance metrics
 * - [AI-ALERT]: Critical issues requiring attention
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Python AI Bridge for intelligent diagnostics
let pythonBridge = null;
try {
  pythonBridge = require('./python_bridge');
} catch (e) {
  console.warn('[AI-HEALTH] Python bridge not available, using JS-only mode');
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Store server start time
const serverStartTime = Date.now();

// AI-friendly health timeline
const healthTimeline = [];
const MAX_TIMELINE_ENTRIES = 200;

// Auto-healing action log
const healingLog = [];

// Health thresholds for AI decision making
const THRESHOLDS = {
  memory: {
    warning: 70, // % heap usage
    critical: 85
  },
  disk: {
    warning: 80, // % usage
    critical: 90
  },
  responseTime: {
    warning: 500, // ms
    critical: 2000
  },
  errorRate: {
    warning: 5, // % of requests
    critical: 15
  }
};

/**
 * Add event to health timeline
 */
function addToTimeline(event) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    timestampMs: Date.now(),
    uptime: Date.now() - serverStartTime,
    ...event
  };
  
  healthTimeline.unshift(entry);
  if (healthTimeline.length > MAX_TIMELINE_ENTRIES) {
    healthTimeline.pop();
  }
  
  // Log with AI-parseable tag
  const severity = event.severity || 'info';
  if (severity === 'critical' || severity === 'high') {
    console.log(`[AI-ALERT] ${event.type}:`, JSON.stringify(entry));
  } else {
    console.log(`[AI-HEALTH] ${event.type}:`, JSON.stringify(entry));
  }
  
  return entry;
}

/**
 * Log healing action
 */
function logHealingAction(action) {
  const entry = {
    id: `heal_${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...action
  };
  
  healingLog.unshift(entry);
  if (healingLog.length > 100) {
    healingLog.pop();
  }
  
  console.log('[AI-HEAL]', JSON.stringify(entry));
  return entry;
}

/**
 * Get formatted uptime
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get memory usage information
 */
function getMemoryInfo() {
  const used = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const heapPercent = (used.heapUsed / used.heapTotal) * 100;
  
  return {
    process: {
      heapUsed: formatBytes(used.heapUsed),
      heapUsedBytes: used.heapUsed,
      heapTotal: formatBytes(used.heapTotal),
      heapTotalBytes: used.heapTotal,
      external: formatBytes(used.external),
      rss: formatBytes(used.rss),
      heapUsedPercent: heapPercent.toFixed(2) + '%',
      heapUsedPercentNum: parseFloat(heapPercent.toFixed(2))
    },
    system: {
      total: formatBytes(totalMem),
      totalBytes: totalMem,
      free: formatBytes(freeMem),
      freeBytes: freeMem,
      used: formatBytes(totalMem - freeMem),
      usedBytes: totalMem - freeMem,
      usedPercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(2) + '%',
      usedPercentNum: parseFloat((((totalMem - freeMem) / totalMem) * 100).toFixed(2))
    },
    status: heapPercent > THRESHOLDS.memory.critical ? 'critical' : 
            heapPercent > THRESHOLDS.memory.warning ? 'warning' : 'healthy'
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get CPU information
 */
function getCPUInfo() {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  const avgUsage = ((1 - totalIdle / totalTick) * 100).toFixed(2);
  
  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    speed: cpus[0]?.speed + ' MHz',
    loadAverage: {
      '1min': loadAvg[0]?.toFixed(2) || 'N/A',
      '5min': loadAvg[1]?.toFixed(2) || 'N/A',
      '15min': loadAvg[2]?.toFixed(2) || 'N/A'
    },
    usagePercent: avgUsage + '%',
    usagePercentNum: parseFloat(avgUsage),
    status: parseFloat(avgUsage) > 90 ? 'critical' : parseFloat(avgUsage) > 70 ? 'warning' : 'healthy'
  };
}

/**
 * Check database files status with AI-friendly output
 */
function checkDatabaseStatus() {
  const dataFiles = [
    'users.json',
    'products.json',
    'orders.json',
    'carts.json',
    'returns.json',
    'contacts.json',
    'sessions.json',
    'passwordResets.json',
    'slides.json',
    'wishlists.json',
    'seoData.json',
    'adminSettings.json',
    'marketing.json',
    'traffic.json'
  ];
  
  const status = {
    healthy: true,
    healthScore: 100,
    files: {},
    totalSize: 0,
    totalSizeBytes: 0,
    errors: [],
    warnings: [],
    corruptedFiles: [],
    missingFiles: []
  };
  
  dataFiles.forEach(file => {
    const filePath = path.join(DATA_DIR, file);
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Validate JSON
        try {
          const parsed = JSON.parse(content);
          const recordCount = Array.isArray(parsed) ? parsed.length : 
                             typeof parsed === 'object' ? Object.keys(parsed).length : 0;
          
          status.files[file] = {
            status: 'ok',
            size: formatBytes(stats.size),
            sizeBytes: stats.size,
            lastModified: stats.mtime.toISOString(),
            recordCount: recordCount,
            valid: true
          };
          status.totalSizeBytes += stats.size;
        } catch (parseError) {
          status.files[file] = {
            status: 'corrupted',
            error: 'Invalid JSON: ' + parseError.message,
            valid: false
          };
          status.corruptedFiles.push(file);
          status.errors.push(`${file}: Invalid JSON`);
          status.healthy = false;
          status.healthScore -= 10;
        }
      } else {
        status.files[file] = {
          status: 'missing',
          size: '0 Bytes',
          valid: false
        };
        status.missingFiles.push(file);
        status.warnings.push(`${file} is missing`);
        status.healthScore -= 5;
      }
    } catch (error) {
      status.files[file] = {
        status: 'error',
        error: error.message,
        valid: false
      };
      status.errors.push(`${file}: ${error.message}`);
      status.healthy = false;
      status.healthScore -= 10;
    }
  });
  
  status.totalSize = formatBytes(status.totalSizeBytes);
  status.healthScore = Math.max(0, status.healthScore);
  return status;
}

/**
 * Check uploads directory status
 */
function checkUploadsStatus() {
  const uploadFolders = ['products', 'slides', 'users', 'misc', 'contact'];
  const status = {
    healthy: true,
    folders: {},
    totalFiles: 0,
    totalSize: 0,
    totalSizeBytes: 0,
    missingFolders: []
  };
  
  uploadFolders.forEach(folder => {
    const folderPath = path.join(UPLOADS_DIR, folder);
    try {
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        let folderSize = 0;
        
        files.forEach(file => {
          const filePath = path.join(folderPath, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              folderSize += stats.size;
            }
          } catch(e) {}
        });
        
        status.folders[folder] = {
          status: 'ok',
          fileCount: files.length,
          size: formatBytes(folderSize),
          sizeBytes: folderSize
        };
        status.totalFiles += files.length;
        status.totalSizeBytes += folderSize;
      } else {
        status.folders[folder] = {
          status: 'missing',
          fileCount: 0
        };
        status.missingFolders.push(folder);
      }
    } catch (error) {
      status.folders[folder] = {
        status: 'error',
        error: error.message
      };
      status.healthy = false;
    }
  });
  
  status.totalSize = formatBytes(status.totalSizeBytes);
  return status;
}

/**
 * Get system information
 */
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    nodeVersion: process.version,
    uptime: formatUptime(os.uptime() * 1000),
    uptimeSeconds: Math.floor(os.uptime()),
    processUptime: formatUptime(Date.now() - serverStartTime),
    processUptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000)
  };
}

/**
 * Calculate overall health score (0-100)
 */
function calculateHealthScore() {
  let score = 100;
  const issues = [];
  
  // Check database health
  const dbStatus = checkDatabaseStatus();
  score = Math.min(score, dbStatus.healthScore);
  if (dbStatus.corruptedFiles.length > 0) {
    issues.push({ type: 'DATABASE', severity: 'critical', message: `Corrupted files: ${dbStatus.corruptedFiles.join(', ')}` });
  }
  if (dbStatus.missingFiles.length > 0) {
    issues.push({ type: 'DATABASE', severity: 'warning', message: `Missing files: ${dbStatus.missingFiles.join(', ')}` });
  }
  
  // Check memory
  const memInfo = getMemoryInfo();
  if (memInfo.status === 'critical') {
    score -= 20;
    issues.push({ type: 'MEMORY', severity: 'critical', message: `Heap usage at ${memInfo.process.heapUsedPercent}` });
  } else if (memInfo.status === 'warning') {
    score -= 10;
    issues.push({ type: 'MEMORY', severity: 'warning', message: `Heap usage at ${memInfo.process.heapUsedPercent}` });
  }
  
  // Check CPU
  const cpuInfo = getCPUInfo();
  if (cpuInfo.status === 'critical') {
    score -= 15;
    issues.push({ type: 'CPU', severity: 'critical', message: `CPU usage at ${cpuInfo.usagePercent}` });
  } else if (cpuInfo.status === 'warning') {
    score -= 5;
    issues.push({ type: 'CPU', severity: 'warning', message: `CPU usage at ${cpuInfo.usagePercent}` });
  }
  
  // Check uploads
  const uploadsStatus = checkUploadsStatus();
  if (uploadsStatus.missingFolders.length > 0) {
    score -= 5;
    issues.push({ type: 'UPLOADS', severity: 'warning', message: `Missing folders: ${uploadsStatus.missingFolders.join(', ')}` });
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    status: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical',
    issues
  };
}

/**
 * Get quick health status
 */
function getQuickHealth() {
  const health = calculateHealthScore();
  
  return {
    status: health.status,
    score: health.score,
    timestamp: new Date().toISOString(),
    uptime: formatUptime(Date.now() - serverStartTime),
    security: 'enabled',
    issueCount: health.issues.length
  };
}

/**
 * Get detailed health status with AI-friendly structure
 */
function getDetailedHealth() {
  const startTime = Date.now();
  const dbStatus = checkDatabaseStatus();
  const uploadsStatus = checkUploadsStatus();
  const health = calculateHealthScore();
  
  const healthReport = {
    // AI-friendly metadata
    _meta: {
      version: '2.0.0',
      generatedAt: new Date().toISOString(),
      responseTimeMs: null,
      format: 'ai-friendly'
    },
    
    // Overall status
    status: health.status,
    healthScore: health.score,
    timestamp: new Date().toISOString(),
    
    // Issues for AI to address
    issues: health.issues,
    
    // Server info
    server: {
      uptime: formatUptime(Date.now() - serverStartTime),
      uptimeMs: Date.now() - serverStartTime,
      startedAt: new Date(serverStartTime).toISOString(),
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      security: 'enabled'
    },
    
    // System resources
    system: getSystemInfo(),
    memory: getMemoryInfo(),
    cpu: getCPUInfo(),
    
    // Data storage
    database: dbStatus,
    uploads: uploadsStatus,
    
    // Recent timeline for context
    recentEvents: healthTimeline.slice(0, 20),
    
    // Healing actions taken
    recentHealingActions: healingLog.slice(0, 10),
    
    // Thresholds for AI decision making
    thresholds: THRESHOLDS,
    
    // Available endpoints (without /api prefix - frontend adds it)
    endpoints: {
      total: 15,
      list: [
        '/auth/me',
        '/products',
        '/orders',
        '/users',
        '/cart',
        '/returns',
        '/contact',
        '/slides',
        '/wishlist',
        '/health',
        '/seo',
        '/security/status',
        '/security/audit',
        '/analytics',
        '/settings'
      ]
    }
  };
  
  healthReport._meta.responseTimeMs = Date.now() - startTime;
  return healthReport;
}

/**
 * AI-friendly diagnostic report with Python AI enhancement
 */
async function getAIDiagnostics() {
  const health = getDetailedHealth();
  
  // Enhance with Python AI diagnostics if available
  let aiEnhanced = null;
  if (pythonBridge) {
    try {
      aiEnhanced = await pythonBridge.health.fullCheck();
    } catch (e) {
      aiEnhanced = { error: e.message, fallback: true };
    }
  }
  
  return {
    // Summary for quick AI parsing
    summary: {
      healthScore: health.healthScore,
      status: health.status,
      criticalIssues: health.issues.filter(i => i.severity === 'critical').length,
      warnings: health.issues.filter(i => i.severity === 'warning').length,
      uptime: health.server.uptime,
      memoryStatus: health.memory.status,
      cpuStatus: health.cpu.status,
      databaseHealthy: health.database.healthy,
      healingActionsCount: healingLog.length,
      aiEnginesAvailable: !!aiEnhanced && !aiEnhanced.error
    },
    
    // Full details
    details: health,
    
    // Python AI engine diagnostics
    aiEngines: aiEnhanced,
    
    // Recommendations for AI
    recommendations: generateRecommendations(health),
    
    // Context timeline
    timeline: healthTimeline.slice(0, 50),
    
    // Healing history
    healingHistory: healingLog
  };
}

/**
 * Generate AI recommendations based on health status
 */
function generateRecommendations(health) {
  const recommendations = [];
  
  // Memory recommendations
  if (health.memory.status === 'critical') {
    recommendations.push({
      priority: 'high',
      type: 'MEMORY',
      action: 'RESTART_SERVER',
      reason: 'Memory usage critically high',
      command: 'pm2 restart blackonn'
    });
  } else if (health.memory.status === 'warning') {
    recommendations.push({
      priority: 'medium',
      type: 'MEMORY',
      action: 'MONITOR',
      reason: 'Memory usage elevated, monitor for increases'
    });
  }
  
  // Database recommendations
  if (health.database.corruptedFiles && health.database.corruptedFiles.length > 0) {
    recommendations.push({
      priority: 'critical',
      type: 'DATABASE',
      action: 'RESTORE_BACKUP',
      reason: 'Corrupted data files detected',
      files: health.database.corruptedFiles
    });
  }
  
  if (health.database.missingFiles && health.database.missingFiles.length > 0) {
    recommendations.push({
      priority: 'medium',
      type: 'DATABASE',
      action: 'CREATE_FILES',
      reason: 'Missing data files',
      files: health.database.missingFiles
    });
  }
  
  // Upload folder recommendations
  if (health.uploads.missingFolders && health.uploads.missingFolders.length > 0) {
    recommendations.push({
      priority: 'low',
      type: 'FILESYSTEM',
      action: 'CREATE_FOLDERS',
      reason: 'Missing upload folders',
      folders: health.uploads.missingFolders
    });
  }
  
  return recommendations;
}

/**
 * Auto-healer: Automatically fix common issues with Python AI assistance
 */
async function runAutoHealer() {
  const results = {
    timestamp: new Date().toISOString(),
    actionsAttempted: 0,
    actionsSucceeded: 0,
    actionsFailed: 0,
    actions: [],
    aiAnalysis: null
  };
  
  // Get AI-powered error analysis if available
  if (pythonBridge) {
    try {
      const errorLogs = healingLog.slice(0, 20);
      results.aiAnalysis = await pythonBridge.errors.analyzeTrends({ errors: errorLogs });
    } catch (e) {
      results.aiAnalysis = { error: e.message };
    }
  }
  
  // 1. Create missing upload folders
  const uploadsStatus = checkUploadsStatus();
  uploadsStatus.missingFolders.forEach(folder => {
    results.actionsAttempted++;
    try {
      const folderPath = path.join(UPLOADS_DIR, folder);
      fs.mkdirSync(folderPath, { recursive: true });
      results.actionsSucceeded++;
      const action = {
        type: 'CREATE_FOLDER',
        target: folder,
        success: true
      };
      results.actions.push(action);
      logHealingAction(action);
    } catch (error) {
      results.actionsFailed++;
      results.actions.push({
        type: 'CREATE_FOLDER',
        target: folder,
        success: false,
        error: error.message
      });
    }
  });
  
  // 2. Create missing data files with empty structure
  const dbStatus = checkDatabaseStatus();
  const defaultStructures = {
    'users.json': [],
    'products.json': [],
    'orders.json': [],
    'carts.json': [],
    'returns.json': [],
    'contacts.json': [],
    'sessions.json': {},
    'passwordResets.json': [],
    'slides.json': [],
    'wishlists.json': [],
    'marketing.json': { campaigns: [], emails: [] },
    'traffic.json': { visits: [], pageViews: [] },
    'adminSettings.json': { siteName: 'BLACKONN', maintenance: false }
  };
  
  dbStatus.missingFiles.forEach(file => {
    results.actionsAttempted++;
    try {
      const filePath = path.join(DATA_DIR, file);
      const defaultData = defaultStructures[file] || {};
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      results.actionsSucceeded++;
      const action = {
        type: 'CREATE_DATA_FILE',
        target: file,
        success: true
      };
      results.actions.push(action);
      logHealingAction(action);
    } catch (error) {
      results.actionsFailed++;
      results.actions.push({
        type: 'CREATE_DATA_FILE',
        target: file,
        success: false,
        error: error.message
      });
    }
  });
  
  // 3. Create logs directory if missing
  if (!fs.existsSync(LOGS_DIR)) {
    results.actionsAttempted++;
    try {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      results.actionsSucceeded++;
      const action = {
        type: 'CREATE_LOGS_DIR',
        target: LOGS_DIR,
        success: true
      };
      results.actions.push(action);
      logHealingAction(action);
    } catch (error) {
      results.actionsFailed++;
      results.actions.push({
        type: 'CREATE_LOGS_DIR',
        target: LOGS_DIR,
        success: false,
        error: error.message
      });
    }
  }
  
  // 4. Attempt to fix corrupted JSON files (backup and reset)
  dbStatus.corruptedFiles.forEach(file => {
    results.actionsAttempted++;
    try {
      const filePath = path.join(DATA_DIR, file);
      const backupPath = path.join(DATA_DIR, `${file}.backup.${Date.now()}`);
      
      // Backup corrupted file
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
      }
      
      // Reset with default structure
      const defaultData = defaultStructures[file] || {};
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      
      results.actionsSucceeded++;
      const action = {
        type: 'REPAIR_DATA_FILE',
        target: file,
        backupCreated: backupPath,
        success: true
      };
      results.actions.push(action);
      logHealingAction(action);
    } catch (error) {
      results.actionsFailed++;
      results.actions.push({
        type: 'REPAIR_DATA_FILE',
        target: file,
        success: false,
        error: error.message
      });
    }
  });
  
  // Log summary
  addToTimeline({
    type: 'AUTO_HEAL_RUN',
    severity: results.actionsFailed > 0 ? 'warning' : 'info',
    attempted: results.actionsAttempted,
    succeeded: results.actionsSucceeded,
    failed: results.actionsFailed
  });
  
  return results;
}

/**
 * Get health metrics for monitoring dashboards (Prometheus-compatible)
 */
function getHealthMetrics() {
  const memUsage = process.memoryUsage();
  const dbStatus = checkDatabaseStatus();
  const health = calculateHealthScore();
  
  return {
    timestamp: Date.now(),
    uptime_seconds: Math.floor((Date.now() - serverStartTime) / 1000),
    health_score: health.score,
    health_status: health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0,
    memory_heap_used_bytes: memUsage.heapUsed,
    memory_heap_total_bytes: memUsage.heapTotal,
    memory_rss_bytes: memUsage.rss,
    memory_external_bytes: memUsage.external,
    system_memory_free_bytes: os.freemem(),
    system_memory_total_bytes: os.totalmem(),
    cpu_cores: os.cpus().length,
    database_healthy: dbStatus.healthy ? 1 : 0,
    database_error_count: dbStatus.errors.length,
    database_warning_count: dbStatus.warnings.length,
    healing_actions_total: healingLog.length,
    active_issues_count: health.issues.length
  };
}

/**
 * Get health timeline for AI context
 */
function getHealthTimeline(count = 50) {
  return healthTimeline.slice(0, count);
}

/**
 * Get healing log
 */
function getHealingLog(count = 50) {
  return healingLog.slice(0, count);
}

/**
 * Clear old timeline entries
 */
function cleanupTimeline() {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();
  
  while (healthTimeline.length > 0 && 
         now - healthTimeline[healthTimeline.length - 1].timestampMs > maxAge) {
    healthTimeline.pop();
  }
}

// Run cleanup every hour
setInterval(cleanupTimeline, 60 * 60 * 1000);

// Initial health check on load
addToTimeline({
  type: 'INIT',
  severity: 'info',
  message: 'Health Check System v2.0 initialized'
});

module.exports = {
  // Quick checks
  getQuickHealth,
  getDetailedHealth,
  getHealthMetrics,
  
  // AI-friendly APIs
  getAIDiagnostics,
  getHealthTimeline,
  getHealingLog,
  
  // Auto-healing
  runAutoHealer,
  
  // Component checks
  checkDatabaseStatus,
  checkUploadsStatus,
  getMemoryInfo,
  getCPUInfo,
  getSystemInfo,
  calculateHealthScore,
  
  // Utilities
  formatUptime,
  formatBytes,
  addToTimeline,
  logHealingAction,
  
  // Constants
  THRESHOLDS
};
