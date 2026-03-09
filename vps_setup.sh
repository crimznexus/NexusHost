#!/bin/bash
# NexusHost - VPS Hub Production Setup Script

echo "🚀 Starting NexusHost Hub Setup..."

# 1. Update and install dependencies
echo "📦 Updating system and installing Node.js..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg ufw
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
NODE_MAJOR=20
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt-get update
sudo apt-get install nodejs -y

# 2. Configure Firewall
echo "🛡️ Configuring Firewall (UFW)..."
sudo ufw allow 22/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 25565/tcp
sudo ufw --force enable

# 3. Create Project Directory
echo "📁 Setting up project directory..."
mkdir -p ~/nexushost
cd ~/nexushost

# Note to user: You must upload the 'nexushost' folder to ~/nexushost/ before running this.
# Or clone it: git clone <your-repo-url> .

# 4. Install Hub Dependencies & Build
if [ -d "nexushost/hub" ]; then
    echo "🏗️ Installing Hub dependencies..."
    cd nexushost/hub
    npm install
    echo "⚒️ Building Hub..."
    npm run build
else
    echo "⚠️ Hub directory not found! Please make sure you uploaded the 'nexushost' folder to ~/nexushost/"
    exit 1
fi

# 5. Create Systemd Service for Hub
echo "⚙️ Creating systemd service..."
# We use 'npm start' which runs the compiled JS in dist/
sudo tee /etc/systemd/system/nexushost-hub.service <<EOF
[Unit]
Description=NexusHost Hub Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 6. Start the service
echo "🔥 Starting NexusHost Hub..."
sudo systemctl daemon-reload
sudo systemctl enable nexushost-hub
sudo systemctl start nexushost-hub

echo "✅ Setup Complete!"
echo "📡 Your Hub is now running on port 3001."
echo "🎮 Minecraft Relay is active on port 25565."
echo "👉 Use this VPS IP address in your Engine's .env and Minecraft client!"
