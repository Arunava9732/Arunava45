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
      instances: 'max', // Use all available CPU cores for high traffic
      exec_mode: 'cluster', // Cluster mode for load balancing
      watch: false,
      autorestart: true,
      max_memory_restart: '512M', // Restart if memory exceeds 512MB per instance
      
      // ULTRA Crash protection settings - 5 second restart
      min_uptime: '3s',            // Min time app must run to be considered started
      max_restarts: 100,           // High restart tolerance for resilience
      restart_delay: 5000,         // Quick restart (5 seconds as requested)
      
      // Error handling
      kill_timeout: 3000,          // Time to wait before force kill (reduced for faster recovery)
      wait_ready: false,           // Don't wait for process.send('ready') in cluster mode
      listen_timeout: 10000,       // Time to wait for app to listen (reduced)
      shutdown_with_message: true, // Graceful shutdown
      
      // HIGH PERFORMANCE Node.js tuning
      node_args: '--max-old-space-size=512 --optimize-for-size --gc-interval=100',
      
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      // Load variables from the project .env when starting with PM2
      // PM2 will inject these into the process environment for the app
      env_file: './.env',
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000
      },
      // Logging (placed under backend/ for easier permissions)
      out_file: './backend/logs/out.log',
      error_file: './backend/logs/error.log',
      pid_file: './backend/pids/blackonn.pid',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      
      // Cron restart (restart every day at 4 AM to prevent memory leaks)
      cron_restart: '0 4 * * *'
    }
  ]
};
