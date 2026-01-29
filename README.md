<div align="center">

# 🚀 PushFlow

### Real-Time Web Push Notifications Across All Your Devices

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/Marmik-Soni/PushFlow/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**A modern, self-hosted Progressive Web App for instant cross-device push notifications**

[Features](#-features) • [Quick Start](#-quick-start) • [API](#-api-reference) • [Deploy](#-deployment) • [Contributing](#-contributing)

</div>

---

## 📖 Overview

PushFlow is a production-ready Progressive Web App that demonstrates real-time Web Push Notifications without third-party services. Open the app on multiple devices, send a message from one, and watch all others receive instant push notifications—even when the app is closed.

**Perfect for:**

- Testing push notification implementations
- Learning PWA and Web Push APIs
- Building your own notification infrastructure
- Self-hosted, privacy-first notification systems

---

## ✨ Features

### Core Capabilities

- 🌐 **Cross-Platform Support** - Works on iPhone (iOS 16.4+), Android, and all major desktop browsers
- ⚡ **Real-Time Push** - Instant notifications to all subscribed devices simultaneously
- 📱 **Full PWA** - Installable on home screen with offline support
- 🔒 **Self-Hosted** - No Firebase, FCM, or third-party dependencies
- 🗄️ **MongoDB Backed** - Scalable cloud database with indexed queries

### Performance & UX

- 🎨 **Modern UI** - Clean, responsive design with smooth light/dark theme toggle
- 🚄 **Network-First Caching** - Service Worker v2 with navigation preload for speed
- 📡 **Smart Polling** - Device list updates pause when tab is hidden to save bandwidth
- 💾 **Offline Ready** - Static assets cached for offline access
- 🎭 **No Layout Shifts** - Fonts and assets load consistently without flash

### Security & Reliability

- 🔐 **VAPID Authentication** - Industry-standard push security
- 🛡️ **Helmet.js Protection** - XSS, HSTS, and security headers
- 🚦 **Rate Limiting** - API endpoint protection with configurable limits
- 📊 **Request Logging** - Morgan HTTP logger for monitoring
- 🔄 **Auto Cleanup** - Stale subscriptions removed automatically

---

## 🛠️ Technology Stack

| Layer        | Technology                                                         |
| ------------ | ------------------------------------------------------------------ |
| **Frontend** | Vanilla JavaScript, Service Worker API, Web Push API, PWA Manifest |
| **Backend**  | Node.js, Express.js, MongoDB Driver, web-push                      |
| **Database** | MongoDB Atlas (with indexed collections)                           |
| **Security** | Helmet.js, VAPID keys, Express Rate Limit                          |
| **DevOps**   | Husky, ESLint, Prettier, Commitlint, Morgan Logger                 |
| **Deploy**   | Vercel-ready (serverless), works on any Node.js host               |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** and **pnpm** (or npm/yarn)
- **MongoDB Atlas** account ([free tier available](https://www.mongodb.com/cloud/atlas))

### 1. Clone & Install

```bash
git clone https://github.com/Marmik-Soni/PushFlow.git
cd PushFlow
pnpm install
```

### 2. Generate VAPID Keys

```bash
pnpm exec web-push generate-vapid-keys
```

Copy the output—you'll need both keys for the next step.

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/pushflow
MONGODB_DB_NAME=pushflow

# VAPID keys from step 2
VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE
VAPID_SUBJECT=mailto:your-email@example.com

# Optional
PORT=3000
LOG_FORMAT=dev
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

### 4. Run Development Server

```bash
pnpm dev
```

Visit **http://localhost:3000** and start testing!

---

## 📱 Usage Guide

### Desktop / Android

1. Open the app in your browser
2. Click **"Enable Notifications"**
3. Allow notifications when prompted ✅

### iPhone (PWA Installation Required)

iOS requires push notifications to be enabled through an installed PWA:

1. Open **http://localhost:3000** in Safari
2. Tap the **Share** button (square with arrow)
3. Select **"Add to Home Screen"**
4. Open **PushFlow** from your home screen
5. Click **"Enable Notifications"**

> **Note:** Safari browser mode does not support push on iOS—PWA installation is mandatory.

### Sending Notifications

**From the UI:**

1. Subscribe on one or more devices
2. Type a message in the "Broadcast Message" field
3. Click **"Send Notification"** or press `Ctrl/Cmd + Enter`
4. All subscribed devices receive the push instantly! 📨

**Via API:**

```bash
curl -X POST http://localhost:3000/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "YOUR_DEVICE_ID",
    "message": "Hello from the API!"
  }'
```

### Theme Toggle

- Use the floating **sun/moon** button (bottom-right) to switch between light and dark themes
- Your preference is saved and persists even if your OS theme changes

### Offline & Caching

- **Network-first strategy** with navigation preload: fresh data when online, cached when offline
- Core assets (HTML, JS, manifest, icons) are pre-cached for offline access
- Device polling automatically pauses when the tab is hidden to conserve bandwidth

---

## 📋 Browser Support

| Platform          | Browser                     | Status | Notes                                 |
| ----------------- | --------------------------- | ------ | ------------------------------------- |
| **iOS (iPhone)**  | Safari (in PWA mode)        | ✅     | Requires "Add to Home Screen" install |
| **iOS (iPhone)**  | Chrome, Firefox, Edge       | ✅     | Requires "Add to Home Screen" install |
| **Android**       | Chrome, Firefox, Edge       | ✅     | Works directly in browser             |
| **Windows/Linux** | Chrome, Firefox, Edge       | ✅     | Works directly in browser             |
| **macOS**         | Safari 16+, Chrome, Firefox | ✅     | Works directly in browser             |

> **iOS Limitation:** Safari browser mode does not support Web Push. Users must install the PWA to their home screen first.

---

## 🌐 API Reference

### Core Endpoints

| Method | Endpoint                 | Description                            | Auth Required |
| ------ | ------------------------ | -------------------------------------- | ------------- |
| `GET`  | `/`                      | Serve PWA frontend                     | No            |
| `GET`  | `/health`                | Health check endpoint                  | No            |
| `GET`  | `/vapid-public-key`      | Get VAPID public key for subscriptions | No            |
| `GET`  | `/devices`               | List all subscribed devices            | No            |
| `POST` | `/subscribe`             | Register new push subscription         | No            |
| `POST` | `/unsubscribe`           | Remove device subscription             | No            |
| `POST` | `/send-notification`     | Broadcast notification to all devices  | No            |
| `POST` | `/admin/unsubscribe-all` | Remove all subscriptions (admin only)  | No            |

### Request/Response Examples

#### Subscribe a Device

**Request:**

```bash
POST /subscribe
Content-Type: application/json

{
  "deviceId": "unique-device-uuid",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  },
  "deviceName": "iPhone 15 Pro"
}
```

**Response:**

```json
{
  "ok": true
}
```

#### Send Notification

**Request:**

```bash
POST /send-notification
Content-Type: application/json

{
  "deviceId": "sender-device-uuid",
  "message": "Hello from PushFlow!"
}
```

**Response:**

```json
{
  "ok": true,
  "sent": 3
}
```

#### Get Devices

**Request:**

```bash
GET /devices
```

**Response:**

```json
{
  "devices": [
    {
      "deviceId": "abc-123",
      "deviceName": "iPhone 15 Pro",
      "endpoint": "https://...",
      "lastSeen": "2026-01-28T12:34:56.789Z",
      "createdAt": "2026-01-28T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|---------|------------|----------|---------|
| `MONGODB_URI` | MongoDB connection string | ✅ | — |
| `MONGODB_DB_NAME` | Database name | ✅ | — |
| `VAPID_PUBLIC_KEY` | VAPID public key | ✅ | — |
| `VAPID_PRIVATE_KEY` | VAPID private key | ✅ | — |
| `VAPID_SUBJECT` | mailto: or https URL | ✅ | — |
| `PORT` | Server port | ❌ | `3000` |
| `LOG_FORMAT` | Morgan log format | ❌ | `dev` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | ❌ | `60000` |
| `RATE_LIMIT_MAX` | Max requests per window | ❌ | `100` |
| `NODE_ENV` | Environment (`development` / `production`) | ❌ | `dev` |

### Security Features

PushFlow includes multiple layers of security:

- **VAPID Authentication** - Industry-standard Web Push protocol with public/private key pairs
- **Helmet.js** - Sets secure HTTP headers (XSS, HSTS, noSniff, frameguard, etc.)
- **Rate Limiting** - Configurable per-endpoint throttling to prevent abuse
- **MongoDB Indexes** - Optimized queries with unique constraints on deviceId
- **Input Validation** - Request body validation for all POST endpoints
- **Auto Cleanup** - Stale push subscriptions (410/404 errors) are automatically removed

### Performance Optimizations

- **Service Worker v2** with navigation preload and network-first caching
- **MongoDB indexes** created once per process (not per request)
- **Smart polling** pauses when tab is hidden and respects data-saver settings
- **Debounced device list** prevents duplicate concurrent requests
- **Static asset caching** for instant offline access
- **Font blocking** prevents layout shifts on first load

---

## 📦 Deployment

### Vercel (Recommended - Zero Config)

1. **Push to GitHub** ✅ (already done)

2. **Deploy to Vercel:**

   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Deploy
   vercel
   ```

   Or use the [Vercel Dashboard](https://vercel.com/new):
   - Import your GitHub repo
   - Vercel auto-detects the configuration
   - Add environment variables (see below)
   - Click "Deploy"

3. **Add Environment Variables in Vercel Dashboard:**

   ```
   MONGODB_URI=mongodb+srv://...
   MONGODB_DB_NAME=pushflow
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:you@example.com
   NODE_ENV=production
   ```

4. **Done!** Your PWA is live at `https://your-project.vercel.app` 🚀

### Other Platforms

#### Netlify

```bash
npm i -g netlify-cli
netlify deploy --prod
```

Add env vars in Netlify dashboard → Site Settings → Environment Variables.

#### Railway / Render

1. Connect GitHub repository
2. Add environment variables
3. Deploy automatically on push

#### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.mjs"]
```

```bash
docker build -t pushflow .
docker run -p 3000:3000 --env-file .env pushflow
```

#### VPS / Traditional Server

```bash
# Clone and setup
git clone https://github.com/Marmik-Soni/PushFlow.git
cd PushFlow
pnpm install
cp .env.example .env
# Edit .env

# Run with PM2
pnpm install -g pm2
pm2 start server.mjs --name pushflow
pm2 save
```

---

## 🧪 Development

### Available Scripts

```bash
pnpm dev           # Start dev server with auto-reload (nodemon)
pnpm start         # Start production server
pnpm lint          # Run ESLint checks
pnpm lint:fix      # Fix ESLint issues automatically
pnpm format        # Format code with Prettier
pnpm format:check  # Check formatting without changes
```

### Pre-commit Hooks

Husky runs automatically before each commit:

1. **ESLint** - Ensures code quality (zero warnings allowed)
2. **Prettier** - Validates formatting
3. **Commitlint** - Enforces [Conventional Commits](https://www.conventionalcommits.org/)

### Project Structure

```
PushFlow/
├── api/
│   └── index.js              # Vercel serverless entry point
├── database/
│   └── db.js                 # MongoDB connection and collections
├── public/
│   ├── app.js                # Frontend logic (vanilla JS)
│   ├── index.html            # PWA UI
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service Worker v2
│   ├── icons/                # PWA icons and favicons
│   └── images/               # Static images
├── server.mjs                # Express server entry point
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
├── vercel.json               # Vercel deployment config
├── eslint.config.mjs         # ESLint configuration
├── .prettierrc               # Prettier configuration
├── commitlint.config.mjs     # Commitlint rules
└── README.md                 # This file
```

---

## 🎯 Release Notes

### v1.0.0 — First Official Release (January 2026)

**What's New:**

- ✨ Service Worker v2 with navigation preload and network-first caching
- 🚀 Smart device polling that pauses when tab is hidden
- 🎨 Explicit light/dark theme overrides with persistent user choice
- 💾 MongoDB indexes created once per process for faster startup
- 🧹 Hidden scrollbars for cleaner UI
- 📡 Static asset caching (HTML, JS, icons, manifest) for offline access
- ⚡ Broader cache coverage including all favicon assets

**Performance:**

- Network-first responses with reliable offline fallback
- Debounced device list updates prevent duplicate requests
- Data-saver awareness reduces bandwidth on metered connections
- Font blocking strategy eliminates layout shifts on first load

**Developer Experience:**

- Full Husky pre-commit hooks (ESLint, Prettier, Commitlint)
- Conventional commit enforcement
- Zero-config Vercel deployment
- Comprehensive API documentation

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit: `git commit -m "feat: add amazing feature"`
4. Push: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

---

## 👤 Author

**Marmik Soni**

- Email: marmiksoni777@gmail.com

---

## ⭐ Show Your Support

Give a ⭐️ if this project helped you!

**Questions or feedback?** Open an issue on GitHub!

**Happy Pushing! 🚀**
