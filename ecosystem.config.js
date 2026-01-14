/**
 * PM2 Ecosystem Configuration (ULTRA HIGH PERFORMANCE)
 * Production-ready configuration for PM2
 * Optimized for maximum uptime, high traffic, and auto-recovery
 */
module.exports = {
  apps: [
    {
      name: 'blackonn',
      script: 'backend/server.js',
      cwd: __dirname,
      instances: 1, // Single instance is MUCH more stable on 1GB-2GB VPS
      exec_mode: 'cluster',
      watch: false,
      autorestart: true,
      max_memory_restart: '768M', // Restart if it hits 768MB to leave room for OS
      
      // ULTRA Crash protection settings - 5 second restart
      min_uptime: '3s',            // Min time app must run to be considered started
      max_restarts: 100,           // High restart tolerance for resilience
      restart_delay: 5000,         // Quick restart (5 seconds as requested)
      exp_backoff_restart_delay: 100, // Exponential backoff for repeated crashes
      
      // Error handling
      kill_timeout: 3000,          // Time to wait before force kill (reduced for faster recovery)
      wait_ready: false,           // Don't wait for process.send('ready') in cluster mode
      listen_timeout: 10000,       // Time to wait for app to listen (reduced)
      shutdown_with_message: true, // Graceful shutdown
      
      // ============ ULTRA HIGH PERFORMANCE Node.js Tuning ============
      // - max-old-space-size: 512MB heap limit (safer for small VPS)
      // - optimize-for-size: Better memory usage
      // - gc-interval: More frequent GC to prevent memory bloat
      // - max-http-header-size: Prevent large header attacks
      // - use-idle-notification: Better GC during idle
      node_args: [
        '--max-old-space-size=512',
        '--optimize-for-size',
        '--gc-interval=100',
        '--max-http-header-size=16384',
        '--use-idle-notification'
      ].join(' '),
      
      // Interpreter args for even better performance
      interpreter_args: '--expose-gc',
      
      env: {
        NODE_ENV: 'production', // Changed to production for better performance
        PORT: 3000,
        // UV_THREADPOOL_SIZE increases async I/O parallelism (DNS, file system)
        UV_THREADPOOL_SIZE: 16
      },
      // Load variables from the project .env when starting with PM2
      // PM2 will inject these into the process environment for the app
      env_file: './.env',
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        // ============ PRODUCTION PERFORMANCE SETTINGS ============
        UV_THREADPOOL_SIZE: 32, // Increased for production I/O
        NODE_OPTIONS: '--max-old-space-size=1536 --optimize-for-size'
      },
      // Logging (placed under backend/ for easier permissions)
      out_file: './backend/logs/out.log',
      error_file: './backend/logs/error.log',
      pid_file: './backend/pids/blackonn.pid',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      
      // Cron restart (restart every day at 4 AM to prevent memory leaks)
      cron_restart: '0 4 * * *'
    },
    {
      name: 'blackonn-agent',
      script: 'backend/ml/blackonn_agent.py',
      interpreter: 'python3',
      args: ['--mode=api', '--port=5050'],
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: '300M',
      out_file: './backend/logs/agent_out.log',
      error_file: './backend/logs/agent_error.log',
      env: {
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8'
      }
    }
  ]
};
