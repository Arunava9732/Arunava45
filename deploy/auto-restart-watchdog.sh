#!/bin/bash

#===============================================================================
# BLACKONN - Continuous Watchdog Service
# Runs every minute to ensure server is always live
# 
# INSTALLATION (run as root on VPS):
#   chmod +x /var/www/blackonn/deploy/auto-restart-watchdog.sh
#   
# Add to crontab (crontab -e):
#   * * * * * /var/www/blackonn/deploy/auto-restart-watchdog.sh >> /var/log/blackonn-watchdog.log 2>&1
#
# Or run as systemd timer (preferred) - see blackonn-watchdog.service
#===============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/blackonn-watchdog.log"
LOCK_FILE="/tmp/blackonn-watchdog.lock"
MAX_LOG_SIZE=5242880  # 5MB

# Prevent concurrent runs
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Another watchdog instance is running, exiting"
    exit 0
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Rotate log if too large
if [ -f "$LOG_FILE" ]; then
    log_size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$log_size" -gt "$MAX_LOG_SIZE" ]; then
        mv "$LOG_FILE" "${LOG_FILE}.old"
        log "Log rotated"
    fi
fi

#===============================================================================
# Quick Health Check (runs every minute)
#===============================================================================

check_and_restart() {
    local api_url="http://localhost:3000/api/health"
    local max_attempts=3
    local attempt=0
    local healthy=false
    
    # Check if PM2 process exists
    if ! pm2 pid blackonn > /dev/null 2>&1; then
        log "❌ PM2 process not found - starting server"
        cd /var/www/blackonn
        pm2 start ecosystem.config.js --env production
        pm2 save
        sleep 5
    fi
    
    # Check if PM2 app is online
    if ! pm2 status blackonn 2>/dev/null | grep -q "online"; then
        log "❌ PM2 app not online - restarting"
        cd /var/www/blackonn
        pm2 restart blackonn || pm2 start ecosystem.config.js --env production
        pm2 save
        sleep 5
    fi
    
    # Quick API health check with retries
    while [ $attempt -lt $max_attempts ]; do
        response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$api_url" 2>/dev/null || echo "000")
        
        if [ "$response" = "200" ]; then
            healthy=true
            break
        fi
        
        attempt=$((attempt + 1))
        sleep 2
    done
    
    if [ "$healthy" = false ]; then
        log "❌ API not responding (HTTP $response) - restarting server"
        
        # Try graceful restart first
        pm2 restart blackonn
        sleep 5
        
        # Check again
        response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$api_url" 2>/dev/null || echo "000")
        
        if [ "$response" != "200" ]; then
            log "❌ Graceful restart failed - doing full restart"
            pm2 delete blackonn 2>/dev/null || true
            cd /var/www/blackonn
            pm2 start ecosystem.config.js --env production
            pm2 save
            sleep 5
            
            # Final check
            response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$api_url" 2>/dev/null || echo "000")
            if [ "$response" = "200" ]; then
                log "✅ Full restart successful - server is live"
            else
                log "❌ Full restart failed - may need manual intervention"
                # Try restarting nginx as well
                systemctl restart nginx 2>/dev/null || true
            fi
        else
            log "✅ Graceful restart successful - server is live"
        fi
    fi
}

#===============================================================================
# Memory & Process Checks
#===============================================================================

check_system_health() {
    # Check memory - if over 95%, restart to clear memory
    local mem_used
    mem_used=$(free | awk '/Mem:/ {printf("%.0f", $3/$2 * 100)}')
    
    if [ "$mem_used" -gt 95 ]; then
        log "⚠️ Critical memory usage: ${mem_used}% - restarting PM2"
        pm2 restart blackonn
        sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    fi
    
    # Check if node processes are hanging (>90% CPU for extended time)
    local high_cpu_count
    high_cpu_count=$(ps aux | grep "node.*server" | grep -v grep | awk '$3 > 90' | wc -l)
    
    if [ "$high_cpu_count" -gt 2 ]; then
        log "⚠️ Multiple high-CPU node processes detected - restarting"
        pm2 restart blackonn
    fi
}

#===============================================================================
# Main Execution
#===============================================================================

# Run quick health check
check_and_restart

# Run system health check every 5 minutes (when minute ends in 0 or 5)
current_minute=$(date +%M)
if [ $((current_minute % 5)) -eq 0 ]; then
    check_system_health
fi

# Release lock
flock -u 9
