# Deployment Guide

## What is Deployment?

**Deployment** is the process of taking your application from your local development computer and making it available on the internet so other people can use it. While developing PushFlow, you run it locally with `node server.mjs` and access it at `http://localhost:3000`—but that only works on your computer. Deployment means configuring your application to run on a remote server (or serverless platform), setting up a public domain name, enabling HTTPS security, connecting to a production database, and ensuring everything stays running reliably 24/7.

Deployment involves several critical steps beyond just "uploading code." You need to secure sensitive information like database passwords and API keys using environment variables rather than hardcoding them. You must configure HTTPS (required for Service Workers and push notifications to work). You need to set up process management so your application automatically restarts if it crashes. You should implement monitoring to detect errors and performance issues. And ideally, you want automated deployments where pushing code to GitHub automatically updates the live site. PushFlow is designed to be flexible—it can deploy to simple serverless platforms like Vercel with zero configuration, or to traditional VPS servers where you have complete control over the infrastructure.

## Deployment Options Overview

PushFlow's architecture is **deployment-agnostic**, meaning it can run on virtually any Node.js hosting platform. The choice depends on your priorities—ease of setup vs. fine-grained control, cost considerations, and scaling requirements.

PushFlow can be deployed to:

- **Vercel** (Serverless) - Zero-config, recommended
- **Traditional VPS** (Node.js) - Full control
- **Docker** - Containerized
- **Cloud Platforms** - AWS, GCP, Azure

All deployments require:

- MongoDB Atlas (or self-hosted MongoDB)
- VAPID keys (generated once, reused)
- Environment variables configured

## Prerequisites

### 1. MongoDB Atlas Setup

```bash
# 1. Create free account at https://www.mongodb.com/cloud/atlas
# 2. Create new cluster (M0 Free Tier)
# 3. Create database user (admin permissions)
# 4. Whitelist IP addresses (0.0.0.0/0 for all, or specific IPs)
# 5. Get connection string
```

**Connection String Format:**

```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/pushflow?retryWrites=true&w=majority
```

**Security Tips:**

- Use strong password (no special characters like `@`, `:`, `/` in password)
- Create separate user for each environment (dev, prod)
- Enable IP whitelisting in production
- Use environment variables (never hardcode)

### 2. Generate VAPID Keys

```bash
# Install web-push globally
npm install -g web-push

# Generate keys (run once, save both keys)
web-push generate-vapid-keys

# Output:
# Public Key: BKxGH7g6j...
# Private Key: LqE3z2R9...
```

**Important:**

- Generate once, use everywhere
- Never commit to Git
- Store in environment variables
- Regenerating invalidates all existing subscriptions

### 3. Environment Variables

Create `.env` file:

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/pushflow

# VAPID Keys
VAPID_PUBLIC_KEY=BKxGH7g6j...
VAPID_PRIVATE_KEY=LqE3z2R9...
VAPID_EMAIL=mailto:admin@example.com

# Server
NODE_ENV=production
PORT=3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Logging
LOG_FORMAT=combined
```

## Deployment Methods

### 1. Vercel (Serverless) - Recommended

#### Why Vercel?

- ✅ Zero-config deployment
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Auto-scaling
- ✅ Free tier (100GB/month)
- ✅ Built-in CI/CD
- ❌ Cold starts (serverless)
- ❌ 10-second function timeout

#### Setup Steps

**A. Install Vercel CLI**

```bash
npm install -g vercel

# Login
vercel login
```

**B. Configure Project**

`vercel.json` (already included):

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

**C. Deploy**

```bash
# First deployment (interactive)
vercel

# Follow prompts:
# - Set up and deploy: Y
# - Scope: your-username
# - Link to existing project: N
# - Project name: pushflow
# - Directory: ./
# - Override settings: N

# Production deployment
vercel --prod

# Output:
# ✔  Production: https://pushflow.vercel.app
```

**D. Set Environment Variables**

```bash
# Via CLI
vercel env add MONGODB_URI production
vercel env add VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production
vercel env add VAPID_EMAIL production

# Or via Dashboard:
# 1. Go to https://vercel.com/dashboard
# 2. Select project
# 3. Settings → Environment Variables
# 4. Add each variable
# 5. Redeploy (vercel --prod)
```

**E. Custom Domain (Optional)**

```bash
# Add domain
vercel domains add pushflow.com

# Configure DNS (add CNAME record):
# Host: @
# Value: cname.vercel-dns.com

# Verify
vercel domains verify pushflow.com
```

#### Vercel Deployment Flow

```
Local Changes → Git Push → Vercel Build → Deploy → Live
     ↓              ↓          ↓            ↓        ↓
  git add .    Auto-detected  npm install  Serverless  Global CDN
  git commit   by Vercel      npm build    Functions   with HTTPS
  git push                    api/index.js
```

#### Vercel Limitations

| Limit                | Free Tier      | Pro Tier   |
| -------------------- | -------------- | ---------- |
| Bandwidth            | 100GB/month    | 1TB/month  |
| Function Duration    | 10 seconds     | 60 seconds |
| Builds               | 6000 min/month | Unlimited  |
| Serverless Functions | 12             | 12         |
| Deployments          | Unlimited      | Unlimited  |

**PushFlow Impact:**

- `/send-notification` may timeout if 100+ devices (10s limit)
- Solution: Chunk device sends or upgrade to Pro

### 2. Traditional VPS (DigitalOcean, Linode, AWS EC2)

#### Why VPS?

- ✅ Full control
- ✅ No cold starts
- ✅ Long-running processes
- ✅ Custom infrastructure
- ❌ Manual scaling
- ❌ Manual SSL setup
- ❌ Higher cost

#### Setup Steps

**A. Provision Server**

```bash
# Example: DigitalOcean Droplet
# OS: Ubuntu 22.04 LTS
# Size: Basic ($6/month)
# Datacenter: Nearest to users
# SSH keys: Add your public key
```

**B. Initial Server Setup**

```bash
# SSH into server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install git
apt install -y git

# Create app user
adduser pushflow
usermod -aG sudo pushflow

# Switch to app user
su - pushflow
```

**C. Clone and Setup**

```bash
# Clone repository
git clone https://github.com/your-username/pushflow.git
cd pushflow

# Install dependencies
npm install --production

# Create .env file
nano .env
# Paste environment variables (see Prerequisites)

# Test run
NODE_ENV=production node server.mjs
# Should see: "PushFlow server listening on http://localhost:3000"
```

**D. Process Manager (PM2)**

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start app
pm2 start server.mjs --name pushflow

# Enable startup script (auto-restart on reboot)
pm2 startup systemd
# Copy and run the generated command

# Save process list
pm2 save

# Monitor
pm2 monit

# Logs
pm2 logs pushflow

# Restart
pm2 restart pushflow

# Stop
pm2 stop pushflow
```

**PM2 Ecosystem File (Optional):**

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'pushflow',
      script: 'server.mjs',
      instances: 2, // Cluster mode (2 instances)
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
```

```bash
# Start with config
pm2 start ecosystem.config.js --env production
```

**E. Nginx Reverse Proxy**

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/pushflow

# Paste configuration:
```

```nginx
server {
    listen 80;
    server_name pushflow.com www.pushflow.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/pushflow /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

**F. SSL Certificate (Let's Encrypt)**

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d pushflow.com -d www.pushflow.com

# Test renewal
sudo certbot renew --dry-run

# Auto-renewal is configured via systemd timer
```

**G. Firewall Setup**

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow OpenSSH

# Allow HTTP/HTTPS
sudo ufw allow 'Nginx Full'

# Check status
sudo ufw status
```

#### VPS Deployment Flow

```
Local Changes → Git Push → SSH to Server → Pull & Restart → Live
     ↓              ↓            ↓               ↓              ↓
  git add .    GitHub/Lab   ssh user@ip    git pull          Nginx
  git commit   Repository   cd pushflow    pm2 restart       serves
  git push                                                   over HTTPS
```

### 3. Docker Deployment

#### Why Docker?

- ✅ Consistent environments
- ✅ Easy scaling
- ✅ Portable (dev = prod)
- ✅ Orchestration (Kubernetes)
- ❌ Extra complexity
- ❌ Resource overhead

#### Dockerfile

```dockerfile
# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start application
CMD ["node", "server.mjs"]
```

#### .dockerignore

```
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
docs/
.husky/
```

#### Build and Run

```bash
# Build image
docker build -t pushflow:latest .

# Run container
docker run -d \
  --name pushflow \
  --restart unless-stopped \
  -p 3000:3000 \
  -e MONGODB_URI="mongodb+srv://..." \
  -e VAPID_PUBLIC_KEY="..." \
  -e VAPID_PRIVATE_KEY="..." \
  -e VAPID_EMAIL="mailto:admin@example.com" \
  pushflow:latest

# Check logs
docker logs -f pushflow

# Stop container
docker stop pushflow

# Remove container
docker rm pushflow
```

#### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    container_name: pushflow
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
      - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
      - VAPID_EMAIL=${VAPID_EMAIL}
      - PORT=3000
    env_file:
      - .env
    networks:
      - pushflow-network

networks:
  pushflow-network:
    driver: bridge
```

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 4. AWS Elastic Beanstalk

#### Setup

```bash
# Install EB CLI
pip install awsebcli

# Initialize EB application
eb init

# Create environment
eb create pushflow-prod --instance_type t2.micro --single

# Set environment variables
eb setenv MONGODB_URI="..." VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_EMAIL="..."

# Deploy
eb deploy

# Open in browser
eb open
```

#### .ebextensions/01_node.config

```yaml
option_settings:
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: 'node server.mjs'
    NodeVersion: 20.x
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: production
```

### 5. Google Cloud Run

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash

# Authenticate
gcloud auth login

# Set project
gcloud config set project pushflow-123456

# Build container
gcloud builds submit --tag gcr.io/pushflow-123456/pushflow

# Deploy
gcloud run deploy pushflow \
  --image gcr.io/pushflow-123456/pushflow \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars MONGODB_URI="...",VAPID_PUBLIC_KEY="...",VAPID_PRIVATE_KEY="...",VAPID_EMAIL="..."
```

## Post-Deployment Checklist

- ✅ **Environment variables** set correctly
- ✅ **MongoDB connection** working
- ✅ **VAPID keys** configured
- ✅ **HTTPS** enabled (required for PWA)
- ✅ **Service Worker** registers successfully
- ✅ **Push notifications** send/receive
- ✅ **Install prompt** works
- ✅ **Device list** loads
- ✅ **Error logs** monitored
- ✅ **Performance** tested (Lighthouse)
- ✅ **Rate limiting** configured
- ✅ **Security headers** enabled (Helmet)
- ✅ **Backups** configured (MongoDB Atlas automated)
- ✅ **Monitoring** set up (Sentry, Datadog, etc.)

## Monitoring & Maintenance

### Application Monitoring

**Sentry (Error Tracking):**

```bash
npm install @sentry/node

# server.mjs
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

**PM2 Monitoring:**

```bash
pm2 install pm2-logrotate  # Rotate logs
pm2 plus  # Cloud monitoring (paid)
```

### Database Monitoring

**MongoDB Atlas:**

- Metrics → Charts (queries/sec, connections, etc.)
- Alerts → Configure (high CPU, low disk space, etc.)
- Performance Advisor → Review slow queries

### Uptime Monitoring

**Free Services:**

- UptimeRobot - 5-minute checks
- Pingdom - 10-minute checks
- StatusCake - 5-minute checks

```bash
# Monitor /health endpoint
https://pushflow.com/health
```

### Log Aggregation

**Winston + LogDNA:**

```bash
npm install winston winston-logdna

# logger.js
import winston from 'winston';
import LogDNA from 'winston-logdna';

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    new LogDNA({ key: process.env.LOGDNA_KEY }),
  ],
});

export default logger;
```

## Scaling Considerations

### Vertical Scaling (Upgrade Server)

- Increase CPU/RAM on VPS
- Change instance type (AWS, GCP)
- Upgrade Vercel plan (Pro = 60s timeout)

### Horizontal Scaling (Multiple Servers)

- Load balancer (Nginx, AWS ALB, Cloudflare)
- Cluster mode (PM2, Node.js cluster module)
- Stateless design (already done - no session state)

### Database Scaling

- MongoDB Atlas auto-sharding
- Read replicas for device list
- Indexes on frequently queried fields (already done)

### CDN

- Cloudflare (free tier)
- AWS CloudFront
- Cache static assets (`/icons`, `/images`, `/sw.js`)

## Troubleshooting

### MongoDB Connection Fails

```
Error: querySrv ENOTFOUND _mongodb._tcp.cluster0.xxxxx.mongodb.net
```

**Fix:**

1. Check connection string format
2. Verify username/password (no special chars)
3. Whitelist server IP in MongoDB Atlas
4. Check DNS resolution (`nslookup cluster0.xxxxx.mongodb.net`)

### Push Notifications Not Sending

```
Error: Invalid audience. The aud claim must be a valid URL.
```

**Fix:**

1. Verify VAPID_EMAIL format (`mailto:admin@example.com`)
2. Check VAPID keys are correct
3. Ensure HTTPS enabled (required)
4. Test subscription endpoint (must be valid FCM/Mozilla URL)

### Service Worker Not Updating

**Fix:**

1. Increment `CACHE_NAME` version in `sw.js`
2. Clear browser cache (Ctrl+Shift+Delete)
3. Unregister old SW (DevTools → Application → Service Workers → Unregister)
4. Hard refresh (Ctrl+Shift+R)

### High Memory Usage

```
pm2 monit
# Shows high memory (>512MB)
```

**Fix:**

1. Check for memory leaks (use `node --inspect`)
2. Enable clustering (PM2 ecosystem file)
3. Upgrade server RAM
4. Implement connection pooling (MongoDB driver handles)

## Best Practices

1. **Use environment variables** - Never hardcode secrets
2. **Enable HTTPS** - Required for PWA and push notifications
3. **Monitor errors** - Set up Sentry or similar
4. **Automate deployments** - CI/CD with GitHub Actions
5. **Backup database** - MongoDB Atlas automated backups
6. **Rate limit API** - Prevent abuse (already implemented)
7. **Use CDN** - Cache static assets
8. **Enable CORS properly** - Whitelist specific origins in production
9. **Version Service Worker** - Increment cache name on updates
10. **Test on multiple devices** - Desktop, mobile, iOS, Android

## References

- [Vercel Documentation](https://vercel.com/docs)
- [PM2 Guide](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/getting-started/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [MongoDB Atlas Deployment](https://www.mongodb.com/docs/atlas/getting-started/)
