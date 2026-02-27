#!/bin/bash
# Pyfinity - Raspberry Pi Zero 2 W Setup Script
# Run this after flashing Raspberry Pi OS Lite and SSH'ing in:
#   curl -sSL https://raw.githubusercontent.com/.../setup_pi.sh | bash
# Or copy the pyfinity folder to the Pi and run: bash setup_pi.sh

set -e

echo "=== Pyfinity Setup ==="

# Install dependencies
echo "Installing Python packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq python3-pip python3-serial python3-flask

# Create app directory
APP_DIR="/opt/pyfinity"
echo "Setting up $APP_DIR..."
sudo mkdir -p "$APP_DIR"
sudo cp -r carrier_infinity_lib "$APP_DIR/"
sudo cp -r web/dist "$APP_DIR/web/dist"
sudo cp carrier_ctl.py server.py "$APP_DIR/"
sudo chmod +x "$APP_DIR/carrier_ctl.py"
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
ExecStart=/usr/bin/python3 /opt/pyfinity/server.py
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
echo "Enabling service..."
sudo systemctl daemon-reload
sudo systemctl enable pyfinity
sudo systemctl start pyfinity

# Create convenience alias
echo 'alias carrier="/opt/pyfinity/carrier_ctl.py"' | sudo tee /etc/profile.d/pyfinity.sh > /dev/null

echo ""
echo "=== Done! ==="
echo "Control panel: http://$(hostname).local:5050"
echo "CLI:           carrier status"
echo "Logs:          sudo journalctl -u pyfinity -f"
echo "Restart:       sudo systemctl restart pyfinity"
