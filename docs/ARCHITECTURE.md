# PushFlow Architecture

## What is PushFlow?

PushFlow is a modern Progressive Web Application (PWA) that enables real-time push notifications across multiple devices using Web Push Protocol. It demonstrates a complete implementation of push notification infrastructure, combining browser service workers, backend APIs, and MongoDB persistence to create a seamless cross-device messaging experience. The architecture follows a three-tier pattern with clear separation of concerns: presentation (frontend PWA), application logic (Node.js API server), and data persistence (MongoDB). This design enables scalability, maintainability, and easy deployment to various cloud platforms while maintaining high performance and reliability.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [3-Tier Architecture](#3-tier-architecture)
3. [Component Breakdown](#component-breakdown)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Deployment Architectures](#deployment-architectures)
6. [Security Model](#security-model)
7. [Performance Considerations](#performance-considerations)
8. [Technology Stack](#technology-stack)

---

## System Overview

PushFlow implements a distributed notification system where:

- **Multiple devices** can subscribe to push notifications
- **Any subscribed device** can send messages to all other devices
- **Service Workers** handle push events in the background
- **MongoDB** stores device subscriptions and message history
- **Web Push Protocol** ensures reliable message delivery

### High-Level Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Browser 1  │         │   Express   │         │   MongoDB   │
│   (PWA)     │◄───────►│   Server    │◄───────►│   Atlas     │
│ Service     │  HTTPS  │   (API)     │   TCP   │ (Database)  │
│  Worker     │         │             │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
       ▲                       │
       │                       │
       │    Push Protocol      │
       │                       ▼
       │                ┌─────────────┐
       └────────────────┤  Browser 2  │
         (via Push      │   (PWA)     │
          Service)      │  Service    │
                        │   Worker    │
                        └─────────────┘
```

---

## 3-Tier Architecture

### 1. Presentation Layer (Client)

**Location**: `public/` directory  
**Components**: `index.html`, `app.js`, `sw.js`, `manifest.json`

**Responsibilities**:

- Render user interface
- Register and manage service worker
- Handle user interactions
- Manage local subscription state
- Display notifications
- Implement PWA features (offline support, installability)

**Technologies**: Vanilla JavaScript, HTML5, CSS3, Service Worker API

### 2. Application Layer (Server)

**Location**: `server.mjs`, `api/index.js`  
**Components**: Express routes, middleware, Web Push integration

**Responsibilities**:

- Expose RESTful API endpoints
- Authenticate and authorize requests
- Send push notifications via Web Push Protocol
- Implement rate limiting and security headers
- Handle errors and logging
- Validate incoming data

**Technologies**: Node.js, Express.js, web-push library

### 3. Data Layer (Database)

**Location**: `database/db.js`  
**Components**: MongoDB connection, collections, indexes

**Responsibilities**:

- Store device subscriptions
- Persist message history
- Maintain indexes for performance
- Handle connection pooling
- Ensure data consistency

**Technologies**: MongoDB, MongoDB Node.js Driver

---

## Component Breakdown

### Frontend Components

#### 1. Main Application (`app.js`)

**Purpose**: Manages the entire frontend lifecycle

**Key Functions**:

```javascript
// Initialize the application
async function init() {
  initTheme();
  await checkExistingSubscription();
  await loadDevices();
  startPolling();
}

// Subscribe to push notifications
async function subscribe() {
  const permission = await Notification.requestPermission();
  const registration = await ensureRegistration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: targetKey,
  });
  await fetchJson('/subscribe', {
    method: 'POST',
    body: JSON.stringify({ deviceId, subscription, deviceName }),
  });
}

// Send notification to all devices
async function sendNotification() {
  const message = messageInput.value.trim();
  await fetchJson('/send-notification', {
    method: 'POST',
    body: JSON.stringify({ deviceId: state.deviceId, message }),
  });
}
```

**State Management**:

```javascript
const state = {
  registration: null, // ServiceWorkerRegistration
  subscription: null, // PushSubscription object
  deviceId: null, // Unique device identifier
  autoTimer: null, // Auto-unsubscribe timer
  pollTimer: null, // Device list polling timer
  isLoadingDevices: false, // Prevent duplicate requests
};
```

#### 2. Service Worker (`sw.js`)

**Purpose**: Background script for offline support and push events

**Lifecycle Events**:

```javascript
// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => {
        return Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});
```

**Caching Strategy**: Network-first with cache fallback

```javascript
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
```

#### 3. PWA Manifest (`manifest.json`)

**Purpose**: Define PWA properties for installation

```json
{
  "name": "PushFlow",
  "short_name": "PushFlow",
  "description": "Real-time push notifications across all devices",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#f8fafc",
  "theme_color": "#f8fafc",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

---

### Backend Components

#### 1. Express Server (`server.mjs`)

**Purpose**: Main application server with API routes

**Initialization**:

```javascript
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import webpush from 'web-push';

const app = express();

// VAPID configuration
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Security middleware
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60000,
  limit: 100,
  standardHeaders: true,
});
```

**API Endpoints**:

1. `GET /health` - Health check
2. `GET /vapid-public-key` - Get VAPID public key
3. `POST /subscribe` - Register device subscription
4. `POST /unsubscribe` - Remove device subscription
5. `GET /devices` - List all subscribed devices
6. `POST /send-notification` - Broadcast notification
7. `POST /admin/unsubscribe-all` - Remove all subscriptions (admin)

#### 2. Database Layer (`database/db.js`)

**Purpose**: MongoDB connection and collection management

```javascript
let client;
let indexesEnsured = false;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      appName: 'pushflow',
      retryWrites: true,
    });
    await client.connect();
  }
  return client;
}

async function getCollections() {
  const db = await getDb();
  const devices = db.collection('devices');
  const messages = db.collection('messages');

  // Ensure indexes once per process
  if (!indexesEnsured) {
    await devices.createIndex({ deviceId: 1 }, { unique: true });
    await devices.createIndex({ lastSeen: -1 });
    await devices.createIndex({ createdAt: -1 });
    await messages.createIndex({ createdAt: -1 });
    await messages.createIndex({ deviceId: 1 });
    indexesEnsured = true;
  }

  return { devices, messages };
}
```

---

## Data Flow Diagrams

### Subscription Flow

```
┌─────────┐                                    ┌─────────┐
│ Browser │                                    │ Server  │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ 1. Register Service Worker                  │
     ├─────────────────────────────────────────────┤
     │                                              │
     │ 2. Request Notification Permission          │
     │    (Notification.requestPermission())       │
     │                                              │
     │ 3. Get VAPID Public Key                     │
     ├────────────────────────────────────────────►│
     │◄────────────────────────────────────────────┤
     │           { key: "..." }                    │
     │                                              │
     │ 4. Subscribe to Push Manager                │
     │    (pushManager.subscribe())                │
     │                                              │
     │ 5. POST /subscribe                          │
     │    { deviceId, subscription, deviceName }   │
     ├────────────────────────────────────────────►│
     │                                              │
     │                                        ┌─────┴─────┐
     │                                        │  MongoDB  │
     │                                        │  upsert   │
     │                                        └─────┬─────┘
     │                                              │
     │◄────────────────────────────────────────────┤
     │             { ok: true }                    │
     │                                              │
```

### Notification Sending Flow

```
┌──────────┐              ┌─────────┐              ┌──────────┐              ┌──────────┐
│ Sender   │              │ Server  │              │ Push     │              │ Receiver │
│ Browser  │              │         │              │ Service  │              │ Browser  │
└────┬─────┘              └────┬────┘              └────┬─────┘              └────┬─────┘
     │                         │                        │                         │
     │ POST /send-notification │                        │                         │
     ├────────────────────────►│                        │                         │
     │  { deviceId, message }  │                        │                         │
     │                         │                        │                         │
     │                         │ 1. Validate sender    │                         │
     │                         │    (check subscription)│                         │
     │                         │                        │                         │
     │                         │ 2. Get all devices    │                         │
     │                         │    from MongoDB        │                         │
     │                         │                        │                         │
     │                         │ 3. Send to Push Service                         │
     │                         ├───────────────────────►│                         │
     │                         │   webpush.send()       │                         │
     │                         │                        │                         │
     │                         │                        │ 4. Deliver to browser   │
     │                         │                        ├────────────────────────►│
     │                         │                        │                         │
     │                         │                        │                         │
     │                         │                        │      5. 'push' event    │
     │                         │                        │      (service worker)   │
     │                         │                        │                         │
     │                         │                        │      6. Show notification
     │                         │                        │                         │
     │◄────────────────────────┤                        │                         │
     │   { ok: true, sent: N } │                        │                         │
     │                         │                        │                         │
```

### Cache Strategy Flow

```
Service Worker Fetch Event:

┌─────────────────────────────────┐
│     Network Request Arrives      │
└────────────────┬────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │  Try Network  │
         └───────┬───────┘
                 │
         ┌───────▼───────┐
         │   Success?    │
         └───┬───────┬───┘
             │       │
         YES │       │ NO
             │       │
             ▼       ▼
    ┌────────────┐  ┌────────────┐
    │   Cache    │  │  Try Cache │
    │  Response  │  └──────┬─────┘
    └──────┬─────┘         │
           │               │
           ▼               ▼
    ┌────────────┐  ┌────────────┐
    │   Return   │  │   Return   │
    │  Network   │  │   Cached   │
    │  Response  │  │  Response  │
    └────────────┘  └────────────┘
```

---

## Deployment Architectures

### Vercel Serverless (Recommended)

```
┌──────────────────────────────────────────────────────┐
│                    Vercel Platform                    │
│                                                       │
│  ┌────────────────┐         ┌────────────────┐      │
│  │  Static Assets │         │   Serverless   │      │
│  │   (CDN Edge)   │         │   Functions    │      │
│  │                │         │   (api/*)      │      │
│  │  - index.html  │         │                │      │
│  │  - app.js      │         │  - index.js    │      │
│  │  - sw.js       │         │    (server.mjs)│      │
│  │  - manifest    │         │                │      │
│  └────────────────┘         └────────┬───────┘      │
│                                      │               │
└──────────────────────────────────────┼───────────────┘
                                       │
                                       │ TCP
                                       ▼
                            ┌────────────────────┐
                            │   MongoDB Atlas    │
                            │   (Cloud DB)       │
                            └────────────────────┘
```

**Configuration** (`vercel.json`):

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" },
    { "source": "/(.*)", "destination": "/public/$1" }
  ]
}
```

### Traditional VPS Deployment

```
┌────────────────────────────────────────┐
│          VPS (e.g., DigitalOcean)      │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │         Nginx Reverse Proxy       │ │
│  │  (SSL, Static Files, Caching)     │ │
│  └──────────────┬───────────────────┘ │
│                 │                      │
│  ┌──────────────▼───────────────────┐ │
│  │      Node.js Process (PM2)        │ │
│  │      server.mjs (Express)         │ │
│  └──────────────┬───────────────────┘ │
│                 │                      │
└─────────────────┼──────────────────────┘
                  │
                  │ MongoDB Connection
                  ▼
       ┌────────────────────┐
       │   MongoDB Atlas    │
       │   or Self-hosted   │
       └────────────────────┘
```

### Docker Container Deployment

```
┌────────────────────────────────────────┐
│         Docker Host / Kubernetes       │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │      PushFlow Container           │ │
│  │                                   │ │
│  │  ┌────────────────────────────┐  │ │
│  │  │   Node.js + Express        │  │ │
│  │  │   Port 3000                │  │ │
│  │  └────────────┬───────────────┘  │ │
│  │               │                  │ │
│  │  ┌────────────▼───────────────┐  │ │
│  │  │   Static Files (public/)   │  │ │
│  │  └────────────────────────────┘  │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
            │
            │ External MongoDB
            ▼
 ┌────────────────────┐
 │  MongoDB Atlas     │
 └────────────────────┘
```

**Dockerfile** (example):

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.mjs"]
```

---

## Security Model

### Authentication & Authorization

**VAPID (Voluntary Application Server Identification)**:

```javascript
// Server generates VAPID keys
const vapidKeys = webpush.generateVAPIDKeys();

// Configure web-push
webpush.setVapidDetails('mailto:admin@pushflow.com', vapidKeys.publicKey, vapidKeys.privateKey);

// Client receives public key
const response = await fetch('/vapid-public-key');
const { key } = await response.json();
```

**Device Identification**:

```javascript
// Generate unique device ID (stored in localStorage)
function getDeviceId() {
  const cached = localStorage.getItem('pushflow-device-id');
  if (cached) return cached;

  const id = crypto.randomUUID();
  localStorage.setItem('pushflow-device-id', id);
  return id;
}
```

### Security Headers (Helmet.js)

```javascript
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
);
```

### Rate Limiting

```javascript
const apiLimiter = rateLimit({
  windowMs: 60000, // 1 minute window
  limit: 100, // Max 100 requests per window
  standardHeaders: true, // Return RateLimit headers
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later.',
    });
  },
});

app.use(['/subscribe', '/unsubscribe', '/send-notification', '/devices'], apiLimiter);
```

### CORS Configuration

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});
```

### Input Validation

```javascript
app.post('/subscribe', async (req, res) => {
  const { deviceId, subscription, deviceName } = req.body || {};

  // Validate required fields
  if (!deviceId || !subscription || !subscription.endpoint) {
    return res.status(400).json({
      error: 'deviceId and valid subscription are required.',
    });
  }

  // Validate subscription structure
  if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({
      error: 'Invalid subscription format.',
    });
  }

  // Continue with subscription...
});
```

### Subscription Cleanup

```javascript
// Remove stale subscriptions automatically
const sendResults = await Promise.all(
  allDevices.map(async (device) => {
    try {
      await webpush.sendNotification(device.subscription, payload);
      return { deviceId: device.deviceId, ok: true };
    } catch (error) {
      const isGone = error?.statusCode === 404 || error?.statusCode === 410;
      if (isGone) {
        // Subscription no longer valid, remove from DB
        await devices.deleteOne({ deviceId: device.deviceId });
        console.warn('Removed stale subscription', device.deviceId);
      }
      return { deviceId: device.deviceId, ok: false };
    }
  })
);
```

---

## Performance Considerations

### Frontend Optimizations

**1. Debouncing & Throttling**:

```javascript
// Debounce device list refresh
const debouncedLoadDevices = debounce(loadDevices, 500);

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
```

**2. Request Deduplication**:

```javascript
const state = {
  isLoadingDevices: false,
};

async function loadDevices() {
  // Prevent duplicate concurrent requests
  if (state.isLoadingDevices) return;

  state.isLoadingDevices = true;
  try {
    const data = await fetchJson('/devices');
    renderDevices(data.devices);
  } finally {
    state.isLoadingDevices = false;
  }
}
```

**3. Efficient Polling**:

```javascript
const POLL_DEVICES_MS = 15000; // 15 seconds

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (state.subscription) {
      loadDevices();
    }
  }, POLL_DEVICES_MS);
}
```

**4. Service Worker Caching**:

```javascript
// Pre-cache critical assets
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    // Network-first for API calls
    event.respondWith(networkFirst(event.request));
  } else {
    // Cache-first for static assets
    event.respondWith(cacheFirst(event.request));
  }
});
```

### Backend Optimizations

**1. Database Indexing**:

```javascript
// Optimize queries with indexes
await devices.createIndex({ deviceId: 1 }, { unique: true });
await devices.createIndex({ lastSeen: -1 });
await devices.createIndex({ createdAt: -1 });
await messages.createIndex({ createdAt: -1 });
```

**2. Connection Pooling**:

```javascript
// Reuse MongoDB connection
let client;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      appName: 'pushflow',
      retryWrites: true,
      maxPoolSize: 10, // Connection pool size
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
    });
    await client.connect();
  }
  return client;
}
```

**3. Response Compression**:

```javascript
import compression from 'compression';

app.use(
  compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Compression level (0-9)
  })
);
```

**4. Static Asset Caching**:

```javascript
app.use(
  express.static('public', {
    maxAge: NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true,
    immutable: true,
  })
);
```

**5. Limiting Query Results**:

```javascript
app.get('/devices', async (req, res) => {
  const { devices } = await getCollections();

  const results = await devices
    .find(
      {},
      {
        projection: {
          _id: 0,
          deviceId: 1,
          deviceName: 1,
          endpoint: 1,
          lastSeen: 1,
          createdAt: 1,
        },
      }
    )
    .sort({ lastSeen: -1 })
    .limit(100) // Prevent huge responses
    .toArray();

  return res.json({ devices: results, count: results.length });
});
```

---

## Technology Stack

### Frontend

| Technology         | Purpose                      | Version |
| ------------------ | ---------------------------- | ------- |
| Vanilla JavaScript | Application logic            | ES2022+ |
| Service Worker API | Background sync, push events | -       |
| Push API           | Subscription management      | -       |
| Notification API   | Display notifications        | -       |
| Cache API          | Offline support              | -       |
| HTML5              | Markup                       | -       |
| CSS3               | Styling with CSS variables   | -       |

### Backend

| Technology         | Purpose                   | Version |
| ------------------ | ------------------------- | ------- |
| Node.js            | Runtime environment       | 20+     |
| Express.js         | Web framework             | 4.x     |
| web-push           | Web Push Protocol library | 3.x     |
| helmet             | Security headers          | 7.x     |
| express-rate-limit | Rate limiting             | 7.x     |
| morgan             | HTTP request logging      | 1.x     |
| dotenv             | Environment configuration | 16.x    |

### Database

| Technology             | Purpose           | Version |
| ---------------------- | ----------------- | ------- |
| MongoDB                | Document database | 6.0+    |
| MongoDB Node.js Driver | Database client   | 6.x     |

### DevOps

| Technology | Purpose               |
| ---------- | --------------------- |
| Vercel     | Serverless deployment |
| Docker     | Containerization      |
| PM2        | Process management    |
| Nginx      | Reverse proxy         |
| Git        | Version control       |

---

## Best Practices

### Code Organization

```
web-push-noti-PWA/
├── public/               # Frontend assets
│   ├── index.html        # Main HTML
│   ├── app.js            # Application logic
│   ├── sw.js             # Service worker
│   ├── manifest.json     # PWA manifest
│   └── icons/            # App icons
├── database/             # Database layer
│   └── db.js             # MongoDB connection
├── api/                  # Serverless functions
│   └── index.js          # Vercel entry point
├── docs/                 # Documentation
├── server.mjs            # Express server
├── vercel.json           # Vercel config
├── package.json          # Dependencies
└── .env                  # Environment variables
```

### Error Handling

```javascript
// Centralized error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error', error);

  // Don't leak error details in production
  const message = NODE_ENV === 'production' ? 'Internal server error' : error.message;

  res.status(500).json({ error: message });
});
```

### Logging

```javascript
// Structured logging
import morgan from 'morgan';

const LOG_FORMAT = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(LOG_FORMAT));

// Custom logging
console.log('INFO', 'Server started', { port: PORT });
console.warn('WARN', 'Removed stale subscription', { deviceId });
console.error('ERROR', 'Failed to send notification', { error });
```

---

## Conclusion

PushFlow's architecture demonstrates a modern, scalable approach to implementing Web Push notifications. The three-tier design ensures clear separation of concerns, making the codebase maintainable and testable. Security is built-in at every layer, from VAPID authentication to rate limiting and input validation. Performance optimizations like caching, connection pooling, and efficient polling ensure the application scales effectively. The architecture supports multiple deployment models, from serverless (Vercel) to traditional VPS and containerized environments, providing flexibility for various production requirements.
