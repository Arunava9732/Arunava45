#!/bin/bash

#===============================================================================
# BLACKONN - One-Click Auto-Restart Setup Script
# 
# This script sets up everything needed for automatic server recovery:
# 1. PM2 startup configuration (restart on reboot)
# 2. Systemd service (restart on VPS shutdown/crash)
# 3. Watchdog timer (check every minute, restart if down)
# 4. Health monitor cron job (full health check every 5 minutes)
#
# RUN AS ROOT:
#   sudo bash /var/www/blackonn/deploy/setup-auto-restart.sh
#===============================================================================

set -e

echo "========================================"
echo "BLACKONN - Auto-Restart Setup"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (sudo)"
    exit 1
fi

DEPLOY_DIR="/var/www/blackonn/deploy"
PROJECT_DIR="/var/www/blackonn"

# Ensure scripts are executable
echo "📁 Setting permissions..."
chmod +x "$DEPLOY_DIR/health-monitor.sh"
chmod +x "$DEPLOY_DIR/auto-restart-watchdog.sh"
chmod +x "$DEPLOY_DIR/one-click-deploy.sh" 2>/dev/null || true

# 1. Setup PM2 Startup
echo ""
echo "1️⃣ Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root
cd "$PROJECT_DIR"
pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart blackonn
pm2 save
echo "✅ PM2 startup configured"

# 2. Install Systemd Service
echo ""
echo "2️⃣ Installing systemd service..."
cp "$DEPLOY_DIR/blackonn.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable blackonn
echo "✅ Systemd service installed"

# 3. Install Watchdog Timer
echo ""
echo "3️⃣ Installing watchdog timer..."
cp "$DEPLOY_DIR/blackonn-watchdog.service" /etc/systemd/system/
cp "$DEPLOY_DIR/blackonn-watchdog.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable blackonn-watchdog.timer
systemctl start blackonn-watchdog.timer
echo "✅ Watchdog timer installed (runs every minute)"

# 4. Setup Health Monitor Cron
echo ""
echo "4️⃣ Setting up health monitor cron..."
# Remove old cron entries
crontab -l 2>/dev/null | grep -v "health-monitor.sh" | grep -v "blackonn" > /tmp/crontab.tmp || true
# Add health monitor (every 5 minutes)
echo "*/5 * * * * $DEPLOY_DIR/health-monitor.sh >> /var/log/blackonn-monitor.log 2>&1" >> /tmp/crontab.tmp
crontab /tmp/crontab.tmp
rm /tmp/crontab.tmp
echo "✅ Health monitor cron installed (runs every 5 minutes)"

# 5. Create log files
echo ""
echo "5️⃣ Setting up log files..."
touch /var/log/blackonn-monitor.log
touch /var/log/blackonn-watchdog.log
chmod 644 /var/log/blackonn-monitor.log
chmod 644 /var/log/blackonn-watchdog.log
echo "✅ Log files created"

# 6. Verify everything is running
echo ""
echo "========================================"
echo "VERIFICATION"
echo "========================================"

echo ""
echo "PM2 Status:"
pm2 status

echo ""
echo "Systemd Services:"
systemctl status blackonn --no-pager -l || echo "Service will start on next boot"
systemctl status blackonn-watchdog.timer --no-pager -l

echo ""
echo "Cron Jobs:"
crontab -l | grep blackonn

echo ""
echo "========================================"
echo "✅ AUTO-RESTART SETUP COMPLETE!"
echo "========================================"
echo ""
echo "Your server will now automatically restart if:"
echo "  • VPS is rebooted or shutdown"
echo "  • Server crashes or stops responding"
echo "  • Memory usage is critical"
echo "  • API health check fails"
echo ""
echo "Monitoring:"
echo "  • Watchdog checks every 1 minute"
echo "  • Full health check every 5 minutes"
echo "  • Logs at /var/log/blackonn-*.log"
echo ""
echo "Commands:"
echo "  • Check status: pm2 status && systemctl status blackonn-watchdog.timer"
echo "  • View logs: tail -f /var/log/blackonn-watchdog.log"
echo "  • Disable: systemctl disable blackonn blackonn-watchdog.timer"
echo ""
