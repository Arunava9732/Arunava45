#!/bin/bash

#===============================================================================
# BLACKONN - Complete One-Click VPS Deployment Script
# Domain: blackonn.com | VPS IP: 88.222.245.92
# Run this with: curl -sL https://raw.githubusercontent.com/Arunava9732/Arunava45/main/deploy/one-click-deploy.sh | bash
#===============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   BLACKONN - Complete VPS Deployment${NC}"
echo -e "${BLUE}   Domain: blackonn.com${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

#-------------------------------------------------------------------------------
# Step 1: System Update & Dependencies
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[1/10] Updating system and installing dependencies...${NC}"

# Fix broken apt sources by removing bad mirrors
echo -e "${YELLOW}Fixing apt sources...${NC}"
sed -i '/mirror.cse.iitk.ac.in/d' /etc/apt/sources.list 2>/dev/null || true
sed -i '/mirror.cse.iitk.ac.in/d' /etc/apt/sources.list.d/*.list 2>/dev/null || true
rm -f /etc/apt/sources.list.d/*.list 2>/dev/null || true

# Update package lists (ignore errors from mirrors)
apt update --fix-missing || apt update || true
apt install -y curl wget git nginx certbot python3-certbot-nginx ufw python3-pip python3-venv || true

# Install Python requirements for AI Engine
echo -e "${YELLOW}Installing Python AI dependencies...${NC}"
pip3 install psutil Pillow --break-system-packages || pip3 install psutil Pillow || true

# Install Node.js 22.x LTS (latest LTS version)
echo -e "${YELLOW}Installing Node.js 22.x LTS...${NC}"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Verify Node.js installation
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js installation failed. Trying alternative method...${NC}"
    apt install -y nodejs npm
fi

# Verify npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm not found. Installing manually...${NC}"
    apt install -y npm
fi

echo -e "${GREEN}Node.js version: $(node -v)${NC}"
echo -e "${GREEN}npm version: $(npm -v)${NC}"

# Install PM2
npm install -g pm2
echo -e "${GREEN}✓ Dependencies installed${NC}"

#-------------------------------------------------------------------------------
# Step 2: Configure Firewall
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[2/10] Configuring firewall...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo -e "${GREEN}✓ Firewall configured${NC}"

#-------------------------------------------------------------------------------
# Step 3: Clone Repository
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[3/10] Cloning repository...${NC}"
mkdir -p /var/www
rm -rf /var/www/blackonn
git clone https://github.com/Arunava9732/Arunava45.git /var/www/blackonn
cd /var/www/blackonn
echo -e "${GREEN}✓ Repository cloned${NC}"

#-------------------------------------------------------------------------------
# Step 4: Create Environment File (REQUIRED - Must create before deploying)
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[4/10] Environment configuration...${NC}"
if [ -f /var/www/blackonn/.env ]; then
    echo -e "${GREEN}✓ .env file already exists${NC}"
    # Validate that .env has real values, not placeholders
    if grep -q "your_jwt_secret_here\|your_google_client_id\|your_email_password" /var/www/blackonn/.env; then
        echo -e "${RED}!! .env file contains placeholder values !!${NC}"
        echo -e "${YELLOW}Please edit /var/www/blackonn/.env with your actual credentials${NC}"
        echo -e "Run: ${BLUE}nano /var/www/blackonn/.env${NC}"
        echo ""
        read -p "Press Enter after you have edited the .env file..."
    fi
else
    echo -e "${YELLOW}! .env file not found. Creating template...${NC}"
    cat > /var/www/blackonn/.env << 'ENVEOF'
# BLACKONN Production Environment
# IMPORTANT: Fill in all values below before starting the app!

NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# OAuth - Get from Google/Facebook Developer Console
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# SMTP - Your email provider settings
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_USER=your_email@blackonn.com
SMTP_PASS=your_email_password
EMAIL_FROM=your_email@blackonn.com

# URLs - Update with your domain
FRONTEND_URL=https://blackonn.com,https://www.blackonn.com,http://88.222.245.92

# Secrets - Generate secure random strings (use: openssl rand -hex 32)
JWT_SECRET=your_jwt_secret_here
COOKIE_SECRET=your_cookie_secret_here
SESSION_SECRET=your_session_secret_here

# Admin Account
ADMIN_EMAIL=admin@blackonn.com
ADMIN_PASSWORD=your_secure_password
ADMIN_NAME=Admin User

ALLOW_LOCALHOST_IN_PRODUCTION=false
ENVEOF
    chmod 600 /var/www/blackonn/.env
    echo -e "${RED}!! IMPORTANT: Edit /var/www/blackonn/.env with your actual credentials !!${NC}"
    echo -e "${YELLOW}   Run: nano /var/www/blackonn/.env${NC}"
    echo ""
    read -p "Press Enter after you have edited the .env file..."
fi

#-------------------------------------------------------------------------------
# Step 5: Install Node Dependencies
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[5/10] Installing Node.js dependencies...${NC}"
cd /var/www/blackonn
npm install --production 2>/dev/null || true
cd backend
npm install --production
cd ..
echo -e "${GREEN}✓ Dependencies installed${NC}"

#-------------------------------------------------------------------------------
# Step 6: Create Directories & Set Permissions
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[6/10] Setting up directories and permissions...${NC}"
mkdir -p backend/uploads/{products,slides,users,contact,misc}
mkdir -p backend/logs backend/pids backend/data
chown -R www-data:www-data /var/www/blackonn
chmod -R 755 /var/www/blackonn
chmod -R 775 backend/uploads backend/data backend/logs
chmod +x backend/ml/*.py
echo -e "${GREEN}✓ Directories configured (AI scripts made executable)${NC}"

#-------------------------------------------------------------------------------
# Step 7: Configure Nginx
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[7/10] Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/blackonn.conf << 'NGINXEOF'
server {
    listen 80;
    listen [::]:80;
    server_name blackonn.com www.blackonn.com 88.222.245.92;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    root /var/www/blackonn/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location ^~ /uploads/ {
        alias /var/www/blackonn/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|mp4|webm)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;
    gzip_comp_level 6;

    client_max_body_size 100M;
    error_page 404 /index.html;
}
NGINXEOF

rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/blackonn.conf
ln -sf /etc/nginx/sites-available/blackonn.conf /etc/nginx/sites-enabled/blackonn.conf
nginx -t
systemctl reload nginx
systemctl enable nginx
echo -e "${GREEN}✓ Nginx configured${NC}"

#-------------------------------------------------------------------------------
# Step 8: Start Application with PM2
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[8/11] Starting application with PM2...${NC}"
cd /var/www/blackonn
npm install compression --save 2>/dev/null || true
pm2 delete blackonn 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u root --hp /root
echo -e "${GREEN}✓ Application started${NC}"

#-------------------------------------------------------------------------------
# Step 9: Setup Auto-Restart & Watchdog System
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[9/11] Setting up auto-restart system...${NC}"

# Make scripts executable
chmod +x /var/www/blackonn/deploy/health-monitor.sh
chmod +x /var/www/blackonn/deploy/auto-restart-watchdog.sh
chmod +x /var/www/blackonn/deploy/setup-auto-restart.sh 2>/dev/null || true

# Install systemd service for auto-start on boot
if [ -f /var/www/blackonn/deploy/blackonn.service ]; then
    cp /var/www/blackonn/deploy/blackonn.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable blackonn
    echo -e "${GREEN}✓ Systemd service installed (auto-start on boot)${NC}"
fi

# Install watchdog timer (checks every minute)
if [ -f /var/www/blackonn/deploy/blackonn-watchdog.service ] && [ -f /var/www/blackonn/deploy/blackonn-watchdog.timer ]; then
    cp /var/www/blackonn/deploy/blackonn-watchdog.service /etc/systemd/system/
    cp /var/www/blackonn/deploy/blackonn-watchdog.timer /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable blackonn-watchdog.timer
    systemctl start blackonn-watchdog.timer
    echo -e "${GREEN}✓ Watchdog timer installed (checks every minute)${NC}"
fi

# Setup health monitor cron job for full health check every 5 minutes
if ! crontab -l 2>/dev/null | grep -q "health-monitor.sh"; then
    (crontab -l 2>/dev/null; echo "*/5 * * * * /var/www/blackonn/deploy/health-monitor.sh >> /var/log/blackonn-monitor.log 2>&1") | crontab -
    echo -e "${GREEN}✓ Health monitor cron job added (every 5 minutes)${NC}"
fi

# Create log files
touch /var/log/blackonn-monitor.log
touch /var/log/blackonn-watchdog.log
chmod 644 /var/log/blackonn-monitor.log
chmod 644 /var/log/blackonn-watchdog.log

echo -e "${GREEN}✓ Auto-restart system configured${NC}"
echo -e "${BLUE}   - Server auto-starts on VPS reboot${NC}"
echo -e "${BLUE}   - Watchdog checks every 1 minute${NC}"
echo -e "${BLUE}   - Full health check every 5 minutes${NC}"

#-------------------------------------------------------------------------------
# Step 10: Wait and Health Check
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[10/11] Performing health checks...${NC}"
sleep 5

# Check PM2 status
if pm2 status blackonn | grep -q "online"; then
    echo -e "${GREEN}✓ PM2: Application is running${NC}"
else
    echo -e "${RED}✗ PM2: Application failed to start${NC}"
    pm2 logs blackonn --lines 20
fi

# Check Nginx
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx: Running${NC}"
else
    echo -e "${RED}✗ Nginx: Not running${NC}"
fi

# Check API
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
    echo -e "${GREEN}✓ API: Health check passed${NC}"
else
    echo -e "${YELLOW}! API: Health endpoint not responding yet${NC}"
fi

#-------------------------------------------------------------------------------
# Step 11: Setup SSL Certificate
#-------------------------------------------------------------------------------
echo -e "${YELLOW}[11/11] Setting up SSL certificate...${NC}"
echo -e "${YELLOW}Checking if domain DNS is configured...${NC}"

# Check if domain resolves to this server
DOMAIN_IP=$(dig +short blackonn.com | head -1)
SERVER_IP="88.222.245.92"

if [ "$DOMAIN_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}✓ DNS is configured correctly${NC}"
    certbot --nginx -d blackonn.com -d www.blackonn.com --non-interactive --agree-tos --email hello@blackonn.com --redirect
    systemctl enable certbot.timer
    systemctl start certbot.timer
    echo -e "${GREEN}✓ SSL certificate installed${NC}"
else
    echo -e "${YELLOW}! DNS not yet pointing to server (found: $DOMAIN_IP, expected: $SERVER_IP)${NC}"
    echo -e "${YELLOW}! Skipping SSL setup. Run this after DNS propagates:${NC}"
    echo -e "  certbot --nginx -d blackonn.com -d www.blackonn.com"
fi

#-------------------------------------------------------------------------------
# Deployment Complete
#-------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "Your website is now live at:"
echo -e "  ${BLUE}http://88.222.245.92${NC}"
if [ "$DOMAIN_IP" = "$SERVER_IP" ]; then
    echo -e "  ${BLUE}https://blackonn.com${NC}"
fi
echo ""
echo -e "Admin Panel: ${BLUE}https://blackonn.com/admin.html${NC}"
echo -e "Admin Login: hello@blackonn.com / 9732@Piku"
echo ""
echo -e "Useful commands:"
echo -e "  pm2 status        - Check app status"
echo -e "  pm2 logs blackonn - View logs"
echo -e "  pm2 restart blackonn - Restart app"
echo ""
