# PushFlow

[![CI](https://github.com/Marmik-Soni/PushFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Marmik-Soni/PushFlow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A clean, minimal Progressive Web App demonstrating real-time Web Push Notifications across all devices.

**Demo:** Open on multiple devices. One device sends a message, others receive push notifications instantly—even when the app is closed.

---

## ✨ Features

- **Cross-Platform** - iPhone (iOS 16.4+), Android, Desktop browsers
- **Real-Time Push** - Instant notifications to all subscribed devices
- **PWA Ready** - Installable on home screen
- **Self-Hosted** - No Firebase, no third-party services
- **MongoDB Backed** - Persistent cloud storage
- **Secure** - VAPID authentication, Helmet security headers, rate limiting
- **Clean UI** - Minimal, responsive design
- **Open Source** - MIT licensed

---

## 🛠️ Tech Stack

**Frontend:** Vanilla JS, Service Worker API, Web Push API, PWA Manifest
**Backend:** Node.js, Express, MongoDB, web-push
**DevOps:** Helmet, Morgan, Express Rate Limit, Husky, ESLint, Prettier

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and pnpm
- MongoDB Atlas account (free tier works)

### Installation

```bash
git clone https://github.com/Marmik-Soni/PushFlow.git
cd PushFlow
pnpm install
```

### Configuration

1. **MongoDB Atlas:**
   - Create free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Get connection string

2. **Generate VAPID Keys:**

   ```bash
   pnpm exec web-push generate-vapid-keys
   ```

3. **Setup Environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI and VAPID keys
   ```

### Development

```bash
pnpm dev          # Start with auto-reload
pnpm lint         # Check code quality
pnpm format       # Format code
```

Visit `http://localhost:3000`

---

## 📋 Browser Support

| Platform    | Browser                       | Support      | Notes                     |
| ----------- | ----------------------------- | ------------ | ------------------------- |
| **iPhone**  | Safari, Chrome, Firefox, Edge | ✅ iOS 16.4+ | Requires PWA installation |
| **Android** | Chrome, Firefox, Edge         | ✅           | Works in browser          |
| **Desktop** | Chrome, Firefox, Edge         | ✅           | Works in browser          |
| **macOS**   | Safari                        | ✅ Ventura+  | Works in browser          |

---

## 📱 Usage

### Desktop / Android

1. Open `http://localhost:3000` in your browser
2. Click "Enable Notifications"
3. Allow notifications when prompted

### iPhone (PWA Required)

1. Open `http://localhost:3000` in Safari
2. Tap Share button → "Add to Home Screen"
3. Open PushFlow from home screen
4. Click "Enable Notifications"

### Send Notification

```bash
curl -X POST http://localhost:3000/send-notification \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello!","body":"Test notification","icon":"/icons/icon-192.png"}'
```

---

## 🌐 API Endpoints

| Method | Endpoint             | Description                    |
| ------ | -------------------- | ------------------------------ |
| `POST` | `/subscribe`         | Register new push subscription |
| `POST` | `/unsubscribe`       | Remove push subscription       |
| `POST` | `/send-notification` | Broadcast push notification    |
| `GET`  | `/devices`           | List all subscribed devices    |
| `GET`  | `/vapid-public-key`  | Get VAPID public key           |
| `GET`  | `/health`            | Health check                   |

---

## 🔧 Configuration

### Environment Variables

| Variable                  | Description                        | Required |
| ------------------------- | ---------------------------------- | -------- |
| `MONGODB_URI`             | MongoDB connection string          | ✅       |
| `MONGODB_DB_NAME`         | Database name                      | ✅       |
| `VAPID_PUBLIC_KEY`        | VAPID public key                   | ✅       |
| `VAPID_PRIVATE_KEY`       | VAPID private key                  | ✅       |
| `VAPID_SUBJECT`           | mailto: or https:// URL            | ✅       |
| `PORT`                    | Server port (default: 3000)        | ❌       |
| `LOG_FORMAT`              | Morgan log format (default: dev)   | ❌       |
| `RATE_LIMIT_WINDOW_MS`    | Rate limit window (default: 60000) | ❌       |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests (default: 100)        | ❌       |

### Security Features

- **Helmet.js** - Security headers (XSS, HSTS, etc.)
- **Rate Limiting** - Protects API endpoints
- **Morgan** - HTTP request logging

---

## 📦 Deployment

### Vercel (Recommended)

1. **Push to GitHub** (already done ✅)

2. **Import to Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Vercel will auto-detect the configuration

3. **Add Environment Variables:**

   ```
   MONGODB_URI=your_mongodb_connection_string
   MONGODB_DB_NAME=pushflow
   VAPID_PUBLIC_KEY=your_public_key
   VAPID_PRIVATE_KEY=your_private_key
   VAPID_SUBJECT=mailto:your-email@example.com
   ```

4. **Deploy** - Click "Deploy" and you're live! 🚀

### Other Platforms

- **Netlify / Render** - Connect GitHub, add env vars, deploy
- **Railway / Fly.io** - One-click deploy with MongoDB Atlas
- **VPS / Docker** - Standard Node.js deployment

---

## ⚙️ Development

```bash
pnpm dev           # Start with auto-reload
pnpm lint          # Check code quality
pnpm format        # Format code
pnpm format:check  # Check formatting
```

**Pre-commit hooks** (Husky):

- ESLint check
- Prettier format check
- Conventional commits validation

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
