#!/bin/bash
# Pyfinity - Raspberry Pi Setup Script
# Run from the repo directory: bash setup_pi.sh

set -e

APP_DIR="/opt/pyfinity"

echo "=== Pyfinity Setup ==="

# Stop existing service/processes
echo "Stopping existing processes..."
sudo systemctl stop pyfinity 2>/dev/null || true
sudo pkill -f "python3.*server.py" 2>/dev/null || true
sleep 1

# Install dependencies
echo "Installing Python packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq python3-pip python3-serial python3-flask

# Copy files (force overwrite)
echo "Deploying to $APP_DIR..."
sudo mkdir -p "$APP_DIR/web"
sudo rm -rf "$APP_DIR/carrier_infinity_lib" "$APP_DIR/web/dist"
sudo cp -rf carrier_infinity_lib "$APP_DIR/"
sudo cp -rf web/dist "$APP_DIR/web/dist"
sudo cp -f server.py "$APP_DIR/"
sudo cp -f carrier_ctl.py "$APP_DIR/" 2>/dev/null || true
sudo cp -f ring_setup.py "$APP_DIR/" 2>/dev/null || true
sudo cp -f setup.py "$APP_DIR/" 2>/dev/null || true
# Preserve config files if they exist on the Pi
for f in schedule.json settings.json energy_history.json ring_auth.json .env; do
    if [ -f "$APP_DIR/$f" ]; then
        echo "  Keeping existing $f"
    elif [ -f "$f" ]; then
        sudo cp -f "$f" "$APP_DIR/"
    fi
done
sudo chmod +x "$APP_DIR/server.py"

# Create systemd service
echo "Creating systemd service..."
sudo tee /etc/systemd/system/pyfinity.service > /dev/null << 'EOF'
[Unit]
Description=Pyfinity - Carrier Infinity Touch Control Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pyfinity
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /opt/pyfinity/server.py
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
echo "Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable pyfinity
sudo systemctl start pyfinity

# Create convenience alias
echo 'alias carrier="/opt/pyfinity/carrier_ctl.py"' | sudo tee /etc/profile.d/pyfinity.sh > /dev/null

echo ""
echo "=== Done! ==="
echo "Control panel: http://$(hostname).local:5050"
echo "Logs:          sudo journalctl -u pyfinity -f"
echo "Restart:       sudo systemctl restart pyfinity"
