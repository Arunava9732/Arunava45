#!/bin/bash

#===============================================================================
# BLACKONN - VPS Health Monitor & Auto-Recovery Script
# This script monitors the website and automatically recovers from issues
# Run with cron: */5 * * * * /var/www/blackonn/deploy/health-monitor.sh >> /var/log/blackonn-monitor.log 2>&1
#===============================================================================

LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
SITE_URL="https://blackonn.com"
API_URL="https://blackonn.com/api/health"
MAX_RETRIES=3
RETRY_DELAY=5

log() {
    echo "$LOG_PREFIX $1"
}

# Function to check if a service is running
check_service() {
    local service=$1
    if systemctl is-active --quiet "$service"; then
        return 0
    else
        return 1
    fi
}

# Function to restart a service
restart_service() {
    local service=$1
    log "⚠️ Restarting $service..."
    systemctl restart "$service"
    sleep 3
    if check_service "$service"; then
        log "✅ $service restarted successfully"
        return 0
    else
        log "❌ Failed to restart $service"
        return 1
    fi
}

# Function to check website health
check_website() {
    local url=$1
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    if [ "$response" = "200" ] || [ "$response" = "301" ] || [ "$response" = "302" ]; then
        return 0
    else
        return 1
    fi
}

# Function to check API health
check_api() {
    local response
    response=$(curl -s --max-time 10 "$API_URL" 2>/dev/null)
    if echo "$response" | grep -q "ok"; then
        return 0
    else
        return 1
    fi
}

# Function to check PM2 status
check_pm2() {
    if pm2 status blackonn 2>/dev/null | grep -q "online"; then
        return 0
    else
        return 1
    fi
}

# Function to restart PM2 app
restart_pm2() {
    log "⚠️ Restarting PM2 app..."
    cd /var/www/blackonn
    pm2 restart blackonn
    sleep 5
    if check_pm2; then
        log "✅ PM2 app restarted successfully"
        return 0
    else
        log "❌ PM2 restart failed, trying full restart..."
        pm2 delete blackonn 2>/dev/null || true
        pm2 start ecosystem.config.js --env production
        sleep 5
        if check_pm2; then
            log "✅ PM2 full restart successful"
            return 0
        else
            log "❌ PM2 full restart failed"
            return 1
        fi
    fi
}

# Function to check disk space
check_disk_space() {
    local threshold=90
    local usage
    usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$usage" -gt "$threshold" ]; then
        log "🚨 CRITICAL: Disk space usage is ${usage}%!"
        return 1
    fi
    return 0
}

# Function to check for memory leaks (Deep Language feature)
check_memory_leaks() {
    local mem_usage
    # Using awk to parse /proc/meminfo for best precision
    mem_usage=$(free | awk '/Mem:/ {print int($3/$2 * 100)}')
    if [ "$mem_usage" -gt 95 ]; then
        log "🚨 CRITICAL: Memory usage is ${mem_usage}%! Potential memory leak detected."
        # Find offending node processes
        ps aux --sort=-%mem | grep node | head -n 3
        return 1
    fi
    return 0
}

# Function to check load average
check_load_avg() {
    local load
    load=$(uptime | awk -F'load average:' '{ print $2 }' | cut -d, -f1 | sed 's/ //g')
    local cpu_count
    cpu_count=$(nproc)
    
    # If load is 2x CPU count, it's overloaded
    if (( $(echo "$load > $cpu_count * 2" | bc -l) )); then
        log "🚨 WARNING: High load average: $load (CPUs: $cpu_count)"
        return 1
    fi
    return 0
}
check_disk_space() {
    local usage
    usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$usage" -lt 90 ]; then
        return 0
    else
        log "⚠️ Disk usage is at ${usage}%"
        # Clean up old logs
        find /var/www/blackonn/backend/logs -name "*.log" -mtime +7 -delete 2>/dev/null
        pm2 flush 2>/dev/null
        log "Cleaned up old logs"
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    local used_percent
    used_percent=$(free | awk '/Mem:/ {printf("%.0f", $3/$2 * 100)}')
    if [ "$used_percent" -lt 90 ]; then
        return 0
    else
        log "⚠️ Memory usage is at ${used_percent}%"
        # Clear system caches
        sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
        log "Cleared system caches"
        return 1
    fi
}

#===============================================================================
# Main Health Check Loop
#===============================================================================

log "Starting health check..."

# 1. Check Nginx
if ! check_service nginx; then
    log "❌ Nginx is down"
    restart_service nginx
fi

# 2. Check PM2 app
if ! check_pm2; then
    log "❌ PM2 app is not running"
    restart_pm2
fi

# 3. Check API health with retries
api_ok=false
for i in $(seq 1 $MAX_RETRIES); do
    if check_api; then
        api_ok=true
        break
    fi
    log "API check failed (attempt $i/$MAX_RETRIES)"
    sleep $RETRY_DELAY
done

if [ "$api_ok" = false ]; then
    log "❌ API is not responding after $MAX_RETRIES attempts"
    restart_pm2
    sleep 5
    if ! check_api; then
        # Last resort: restart nginx too
        restart_service nginx
    fi
fi

# 4. Check website accessibility
if ! check_website "$SITE_URL"; then
    log "❌ Website is not accessible"
    # Check if it's an nginx issue or app issue
    if check_api; then
        restart_service nginx
    else
        restart_pm2
    fi
fi

# 5. Check disk space
check_disk_space

# 6. Check memory usage
check_memory

# 7. Verify SSL certificate
if ! check_website "https://blackonn.com"; then
    # Try HTTP to see if it's an SSL issue
    if check_website "http://blackonn.com"; then
        log "⚠️ Possible SSL issue - certificate may need renewal"
        certbot renew --quiet 2>/dev/null
    fi
fi

log "Health check completed"

#===============================================================================
# Auto-Debug & Fix Section
#===============================================================================

# Function to check and fix common issues
auto_debug_and_fix() {
    log "Running auto-debug diagnostics..."
    
    # Check for high error rate in client errors
    local error_count
    error_count=$(curl -s "http://localhost:3000/api/health/auto-status" 2>/dev/null | grep -o '"errorsLastHour":[0-9]*' | cut -d: -f2)
    
    if [ -n "$error_count" ] && [ "$error_count" -gt 50 ]; then
        log "⚠️ High client error rate detected: $error_count errors in last hour"
        # Trigger app restart if errors are high
        restart_pm2
    fi
    
    # Check for zombie processes
    local zombie_count
    zombie_count=$(ps aux | awk '$8 ~ /Z/ { count++ } END { print count+0 }')
    if [ "$zombie_count" -gt 5 ]; then
        log "⚠️ Found $zombie_count zombie processes - cleaning up"
        # Kill zombie parents
        ps aux | awk '$8 ~ /Z/ { print $3 }' | xargs -r kill -9 2>/dev/null
    fi
    
    # Check for connection timeouts in nginx logs
    if [ -f /var/log/nginx/error.log ]; then
        local timeout_errors
        timeout_errors=$(tail -100 /var/log/nginx/error.log 2>/dev/null | grep -c "timed out")
        if [ "$timeout_errors" -gt 10 ]; then
            log "⚠️ Multiple nginx timeout errors detected - restarting PM2"
            restart_pm2
        fi
    fi
    
    # Check if node processes are stuck
    local stuck_processes
    stuck_processes=$(ps aux | grep "node.*blackonn" | grep -v grep | awk '$3 > 80 || $4 > 80' | wc -l)
    if [ "$stuck_processes" -gt 0 ]; then
        log "⚠️ Found $stuck_processes stuck node processes (high CPU/memory) - restarting"
        pm2 restart blackonn
    fi
    
    # Check for open file descriptor issues
    local max_fds
    max_fds=$(ulimit -n 2>/dev/null || echo 1024)
    local current_fds
    current_fds=$(ls /proc/$(pgrep -f "node.*blackonn" | head -1)/fd 2>/dev/null | wc -l || echo 0)
    if [ "$current_fds" -gt 0 ] && [ "$current_fds" -gt $((max_fds * 80 / 100)) ]; then
        log "⚠️ High file descriptor usage: $current_fds/$max_fds - restarting"
        restart_pm2
    fi
    
    # Check for database lock issues
    if [ -f /var/www/blackonn/backend/data/sessions.sqlite3 ]; then
        local lock_check
        lock_check=$(lsof /var/www/blackonn/backend/data/*.sqlite3 2>/dev/null | wc -l)
        if [ "$lock_check" -gt 20 ]; then
            log "⚠️ Possible database lock issue - many processes accessing SQLite"
        fi
    fi
    
    log "Auto-debug diagnostics completed"
}

# Run auto-debug on every health check
auto_debug_and_fix

#===============================================================================
# Log Rotation
#===============================================================================

# Rotate logs if too large
rotate_logs() {
    local log_dir="/var/www/blackonn/backend/logs"
    
    if [ -d "$log_dir" ]; then
        find "$log_dir" -name "*.log" -size +10M -exec sh -c '
            mv "$1" "${1}.old"
            touch "$1"
        ' _ {} \;
    fi
    
    # Rotate monitor log
    if [ -f /var/log/blackonn-monitor.log ] && [ $(stat -f%z /var/log/blackonn-monitor.log 2>/dev/null || stat -c%s /var/log/blackonn-monitor.log 2>/dev/null) -gt 10485760 ]; then
        mv /var/log/blackonn-monitor.log /var/log/blackonn-monitor.log.old
        touch /var/log/blackonn-monitor.log
    fi
}

rotate_logs
