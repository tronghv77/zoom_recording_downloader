# Deploy Guide

## Option A: VPS with PM2 (Recommended)

### 1. Setup VPS (Ubuntu 22.04+)

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

### 2. Upload code

```bash
# On VPS
cd /opt
git clone <your-repo-url> zoomdl
cd zoomdl
npm install
npm run build:server
npm run build   # build Vite UI
```

### 3. Configure environment

```bash
cp .env.example .env
nano .env
# Change: ADMIN_PASSWORD, SESSION_SECRET, AGENT_SECRET
```

### 4. Start with PM2

```bash
# Edit ecosystem.config.js with your .env values, then:
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # auto-start on reboot
```

### 5. Setup Nginx + SSL

```nginx
# /etc/nginx/sites-available/zoomdl
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/zoomdl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 6. Access

- Web UI: https://your-domain.com
- Login: admin / (your password)

---

## Option B: Docker

```bash
# On VPS
git clone <your-repo-url> zoomdl
cd zoomdl

# Build locally first
npm install
npm run build:server
npm run build

# Create .env
cp .env.example .env
nano .env

# Run with Docker
docker-compose up -d
```

Nginx + SSL setup same as Option A.

---

## Option C: Railway / Render (Easiest)

### Railway.app

1. Connect GitHub repo
2. Set environment variables in Railway dashboard:
   - `PORT=3000`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=your-password`
   - `SESSION_SECRET=random-string`
   - `AGENT_SECRET=random-string`
3. Build command: `npm run build:server && npm run build`
4. Start command: `node dist/server/server/index.js`
5. Railway auto-provides domain + HTTPS

---

## Agent Setup (on each device)

After server is deployed, run agent on each device:

### Windows
```cmd
cd /d "path\to\zoomdl"
node dist\server\src\agent\AgentClient.js --server wss://your-domain.com/ws --name "PC Office" --path "D:\ZoomRecordings" --secret your-agent-secret
```

### Linux/Mac
```bash
node dist/server/src/agent/AgentClient.js --server wss://your-domain.com/ws --name "NAS Server" --path "/volume1/zoom" --secret your-agent-secret
```

### Notes
- Use `wss://` (not `ws://`) when server has SSL
- Agent auto-reconnects if disconnected
- Multiple agents can connect simultaneously
- Each agent downloads files to its own local path

---

## Security Checklist

- [ ] Change default admin password
- [ ] Set strong SESSION_SECRET (use: `openssl rand -hex 32`)
- [ ] Set strong AGENT_SECRET (use: `openssl rand -hex 16`)
- [ ] Enable HTTPS (required for login security)
- [ ] Restrict server access with firewall if needed
- [ ] Zoom credentials stored in SQLite — keep DB file secure
