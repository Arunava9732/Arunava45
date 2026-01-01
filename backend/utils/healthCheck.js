/**
 * Health Check Utility
 * Monitors server health, database status, and system resources
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Store server start time
const serverStartTime = Date.now();

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
  
  return {
    process: {
      heapUsed: formatBytes(used.heapUsed),
      heapTotal: formatBytes(used.heapTotal),
      external: formatBytes(used.external),
      rss: formatBytes(used.rss),
      heapUsedPercent: ((used.heapUsed / used.heapTotal) * 100).toFixed(2) + '%'
    },
    system: {
      total: formatBytes(totalMem),
      free: formatBytes(freeMem),
      used: formatBytes(totalMem - freeMem),
      usedPercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(2) + '%'
    }
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
  
  // Calculate average CPU usage
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
    usagePercent: avgUsage + '%'
  };
}

/**
 * Check database files status
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
    'wishlists.json'
  ];
  
  const status = {
    healthy: true,
    files: {},
    totalSize: 0,
    errors: []
  };
  
  dataFiles.forEach(file => {
    const filePath = path.join(DATA_DIR, file);
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        JSON.parse(content); // Validate JSON
        
        status.files[file] = {
          status: 'ok',
          size: formatBytes(stats.size),
          lastModified: stats.mtime.toISOString()
        };
        status.totalSize += stats.size;
      } else {
        status.files[file] = {
          status: 'missing',
          size: '0 Bytes'
        };
        status.errors.push(`${file} is missing`);
      }
    } catch (error) {
      status.files[file] = {
        status: 'error',
        error: error.message
      };
      status.errors.push(`${file}: ${error.message}`);
      status.healthy = false;
    }
  });
  
  status.totalSize = formatBytes(status.totalSize);
  return status;
}

/**
 * Check uploads directory status
 */
function checkUploadsStatus() {
  const uploadFolders = ['products', 'slides', 'users', 'misc'];
  const status = {
    healthy: true,
    folders: {},
    totalFiles: 0,
    totalSize: 0
  };
  
  uploadFolders.forEach(folder => {
    const folderPath = path.join(UPLOADS_DIR, folder);
    try {
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        let folderSize = 0;
        
        files.forEach(file => {
          const filePath = path.join(folderPath, file);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            folderSize += stats.size;
          }
        });
        
        status.folders[folder] = {
          status: 'ok',
          fileCount: files.length,
          size: formatBytes(folderSize)
        };
        status.totalFiles += files.length;
        status.totalSize += folderSize;
      } else {
        status.folders[folder] = {
          status: 'missing',
          fileCount: 0
        };
      }
    } catch (error) {
      status.folders[folder] = {
        status: 'error',
        error: error.message
      };
      status.healthy = false;
    }
  });
  
  status.totalSize = formatBytes(status.totalSize);
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
    uptime: formatUptime(os.uptime() * 1000)
  };
}

/**
 * Get quick health status
 */
function getQuickHealth() {
  const dbStatus = checkDatabaseStatus();
  
  return {
    status: dbStatus.healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: formatUptime(Date.now() - serverStartTime),
    security: 'enabled'
  };
}

/**
 * Get detailed health status
 */
function getDetailedHealth() {
  const startTime = Date.now();
  const dbStatus = checkDatabaseStatus();
  const uploadsStatus = checkUploadsStatus();
  
  const health = {
    status: dbStatus.healthy && uploadsStatus.healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    responseTime: null,
    server: {
      uptime: formatUptime(Date.now() - serverStartTime),
      startedAt: new Date(serverStartTime).toISOString(),
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      security: 'enabled'
    },
    system: getSystemInfo(),
    memory: getMemoryInfo(),
    cpu: getCPUInfo(),
    database: dbStatus,
    uploads: uploadsStatus,
    endpoints: {
      total: 10,
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
        '/health'
      ]
    }
  };
  
  health.responseTime = (Date.now() - startTime) + 'ms';
  return health;
}

/**
 * Get health metrics for monitoring dashboards
 */
function getHealthMetrics() {
  const memUsage = process.memoryUsage();
  const dbStatus = checkDatabaseStatus();
  
  return {
    timestamp: Date.now(),
    uptime_seconds: Math.floor((Date.now() - serverStartTime) / 1000),
    memory_heap_used_bytes: memUsage.heapUsed,
    memory_heap_total_bytes: memUsage.heapTotal,
    memory_rss_bytes: memUsage.rss,
    memory_external_bytes: memUsage.external,
    system_memory_free_bytes: os.freemem(),
    system_memory_total_bytes: os.totalmem(),
    cpu_cores: os.cpus().length,
    database_healthy: dbStatus.healthy ? 1 : 0,
    database_error_count: dbStatus.errors.length
  };
}

module.exports = {
  getQuickHealth,
  getDetailedHealth,
  getHealthMetrics,
  formatUptime,
  formatBytes,
  checkDatabaseStatus,
  checkUploadsStatus,
  getMemoryInfo,
  getCPUInfo,
  getSystemInfo
};
