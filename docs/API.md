# API Implementation Deep Dive

## What is the API?

An **API (Application Programming Interface)** is a set of rules and endpoints that allow different software applications to communicate with each other. In PushFlow, the API is the bridge between the frontend (running in users' browsers) and the backend (running on a server). When you click "Subscribe" in the PushFlow interface, your browser doesn't directly save your subscription to the database—instead, it sends an HTTP request to the API endpoint `/subscribe`, which then handles the database operations and returns a response confirming success or failure.

PushFlow's API is built using **Express.js**, a minimal and flexible Node.js web application framework that simplifies creating web servers and handling HTTP requests. The API implements a **RESTful design**, meaning it uses standard HTTP methods (GET for retrieving data, POST for creating/updating data) and organized URL paths (like `/devices` for device operations, `/send-notification` for sending notifications) that make the API predictable and easy to understand. Each endpoint is protected by middleware—layers of code that run before the main handler—implementing security headers, rate limiting to prevent abuse, request logging for debugging, and JSON body parsing to handle incoming data.

## Express Server Architecture

**Express.js** is the web framework that powers PushFlow's backend server. It provides a lightweight structure for handling HTTP requests, organizing routes, and applying middleware—reusable functions that process requests before they reach your endpoint handlers.

### Middleware Stack

```javascript
// server.mjs
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

const app = express();

// 1. Trust proxy (for rate limiting behind Vercel/nginx)
app.set('trust proxy', 1);

// 2. Manual CORS (dev/prod compatibility)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});

// 3. Helmet security headers
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

// 4. Morgan HTTP request logging
app.use(morgan(LOG_FORMAT));

// 5. Rate limiting on specific routes
const apiLimiter = rateLimit({
  windowMs: Number(RATE_LIMIT_WINDOW_MS),
  limit: Number(RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/subscribe', '/unsubscribe', '/send-notification', '/devices'], apiLimiter);

// 6. JSON body parser (1MB limit)
app.use(express.json({ limit: '1mb' }));

// 7. Static file server with caching
app.use(
  express.static('public', {
    maxAge: NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true,
  })
);
```

### Middleware Order Importance

```
trust proxy → CORS → Helmet → Morgan → Rate Limit → Body Parser → Static → Routes
    ↓           ↓       ↓        ↓          ↓           ↓            ↓        ↓
  For rate   Allow   Security  Logging   Throttle   Parse JSON   Serve    Handle
  limiting   all     headers   requests  requests   body         PWA      API calls
  behind     origins
  proxies
```

**Why this order?**

1. **Trust proxy first** - Rate limiter needs real IPs
2. **CORS early** - Allow preflight OPTIONS requests
3. **Helmet before routes** - Apply security to all responses
4. **Morgan after Helmet** - Log security headers
5. **Rate limit before body parse** - Throttle before parsing (saves CPU)
6. **Body parser before routes** - Routes need parsed JSON
7. **Static before API routes** - Serve PWA files first
8. **Routes last** - Handle API endpoints

## API Endpoints

### GET /health

```javascript
app.get('/health', (req, res) => {
  res.json({ ok: true });
});
```

**Purpose:** Health check for monitoring/load balancers

**Response:**

```json
{
  "ok": true
}
```

**Use Cases:**

- Uptime monitoring (Pingdom, UptimeRobot)
- Load balancer health checks
- Docker healthcheck
- Kubernetes liveness probe

### GET /vapid-public-key

```javascript
const CACHED_VAPID_KEY = VAPID_PUBLIC_KEY;

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: CACHED_VAPID_KEY });
});
```

**Purpose:** Provide VAPID public key to clients for push subscriptions

**Response:**

```json
{
  "key": "BKxGH7g6j..."
}
```

**Why cache?**

- Avoid repeated environment variable access
- Immutable during runtime
- Slight performance gain

**Security:**

- Public key is safe to expose
- Private key NEVER sent to client

### POST /subscribe

```javascript
app.post('/subscribe', async (req, res) => {
  const { deviceId, subscription, deviceName } = req.body || {};

  // Validation
  if (!deviceId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'deviceId and valid subscription are required.' });
  }

  try {
    const { devices } = await getCollections();

    await devices.updateOne(
      { deviceId },
      {
        $set: {
          subscription,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          deviceName: deviceName || req.headers['user-agent'] || 'Unknown device',
          lastSeen: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('/subscribe failed', error);
    return res.status(500).json({ error: 'Failed to store subscription.' });
  }
});
```

**Request:**

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "BGYiP8CxH...",
      "auth": "dKEw3RCM..."
    }
  },
  "deviceName": "Windows Desktop (Chrome)"
}
```

**Response:**

```json
{
  "ok": true
}
```

**Error Responses:**

- 400: Missing or invalid fields
- 500: Database error

**Upsert Strategy:**

- `$set`: Update subscription + lastSeen on every call
- `$setOnInsert`: Set createdAt only on first insert
- Idempotent: Safe to call multiple times

### POST /unsubscribe

```javascript
app.post('/unsubscribe', async (req, res) => {
  const { deviceId } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required.' });
  }

  try {
    const { devices } = await getCollections();
    await devices.deleteOne({ deviceId });
    return res.json({ ok: true });
  } catch (error) {
    console.error('/unsubscribe failed', error);
    return res.status(500).json({ error: 'Failed to remove subscription.' });
  }
});
```

**Request:**

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**

```json
{
  "ok": true
}
```

**Idempotent:**

- Succeeds even if device doesn't exist
- `deleteOne()` returns success if 0 documents deleted

### GET /devices

```javascript
app.get('/devices', async (req, res) => {
  try {
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
      .limit(100)
      .toArray();

    return res.json({ devices: results, count: results.length });
  } catch (error) {
    console.error('/devices failed', error);
    return res.status(500).json({ error: 'Failed to fetch devices.' });
  }
});
```

**Response:**

```json
{
  "devices": [
    {
      "deviceId": "550e8400-e29b-41d4-a716-446655440000",
      "deviceName": "Windows Desktop (Chrome)",
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "lastSeen": "2026-01-28T15:30:00.000Z",
      "createdAt": "2026-01-20T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Optimizations:**

- **Projection** - Exclude `_id`, `subscription`, `keys` (saves bandwidth)
- **Sort** - Uses `lastSeen` index (fast)
- **Limit** - Max 100 devices (prevents huge responses)

**Why exclude subscription?**

- Large object (~500 bytes)
- Not needed for device list UI
- Privacy: Don't expose other devices' endpoints

### POST /send-notification

```javascript
app.post('/send-notification', async (req, res) => {
  const { deviceId, message } = req.body || {};

  // Validation
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required.' });
  }

  if (!message) {
    return res.status(400).json({ error: 'message is required.' });
  }

  try {
    const { devices, messages } = await getCollections();

    // Verify sender is subscribed
    const sender = await devices.findOne({ deviceId });
    if (!sender) {
      return res.status(403).json({ error: 'Sender is not subscribed.' });
    }

    // Get all devices
    const allDevices = await devices.find({}).toArray();

    // Construct payload
    const payload = JSON.stringify({
      title: 'PushFlow',
      body: message,
      data: { sender: deviceId || 'unknown' },
      tag: 'pushflow-message',
    });

    // Send to all devices
    const sendResults = await Promise.all(
      allDevices.map(async (device) => {
        try {
          await webpush.sendNotification(device.subscription, payload);
          return { deviceId: device.deviceId, ok: true };
        } catch (error) {
          const isGone = error?.statusCode === 404 || error?.statusCode === 410;
          if (isGone) {
            await devices.deleteOne({ deviceId: device.deviceId });
            console.warn('Removed stale subscription', device.deviceId);
          } else {
            console.error('Notification failed', device.deviceId, error);
          }
          return { deviceId: device.deviceId, ok: false };
        }
      })
    );

    // Store message
    await messages.insertOne({
      deviceId: deviceId || 'unknown',
      message,
      createdAt: new Date(),
    });

    return res.json({ ok: true, sent: sendResults.filter((r) => r.ok).length });
  } catch (error) {
    console.error('/send-notification failed', error);
    return res.status(500).json({ error: 'Failed to send notifications.' });
  }
});
```

**Request:**

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Hello from Device A!"
}
```

**Response:**

```json
{
  "ok": true,
  "sent": 3
}
```

**Flow:**

1. Validate sender is subscribed (403 if not)
2. Fetch all devices
3. Construct notification payload
4. Send to all devices in parallel (`Promise.all`)
5. Handle stale subscriptions (410/404 → delete)
6. Store message history
7. Return success count

**Error Handling:**

- 400: Missing fields
- 403: Sender not subscribed
- 500: Database or push service error

**Stale Subscription Cleanup:**

```javascript
const isGone = error?.statusCode === 404 || error?.statusCode === 410;
if (isGone) {
  await devices.deleteOne({ deviceId: device.deviceId });
}
```

**Why parallel sending?**

- Faster than sequential (100 devices = 100 parallel requests)
- `Promise.all` waits for all to complete
- Individual failures don't block others

### POST /admin/unsubscribe-all

```javascript
app.post('/admin/unsubscribe-all', async (req, res) => {
  try {
    const { devices } = await getCollections();
    const result = await devices.deleteMany({});
    return res.json({ ok: true, removed: result.deletedCount || 0 });
  } catch (error) {
    console.error('/admin/unsubscribe-all failed', error);
    return res.status(500).json({ error: 'Failed to unsubscribe all devices.' });
  }
});
```

**Purpose:** Hidden admin endpoint for resetting system

**Request:** Empty or any body

**Response:**

```json
{
  "ok": true,
  "removed": 5
}
```

**Access:** No authentication (should add in production)

**Trigger:** Client sends `::RESET::` message

## Error Handling

### Input Validation

```javascript
const { deviceId, subscription, deviceName } = req.body || {};

if (!deviceId || !subscription || !subscription.endpoint) {
  return res.status(400).json({ error: 'deviceId and valid subscription are required.' });
}
```

**Strategy:**

- Check required fields
- Return 400 with descriptive error
- Early return (don't process invalid data)

### Try-Catch Pattern

```javascript
try {
  // Database/push operations
  const result = await someAsyncOperation();
  return res.json({ ok: true, result });
} catch (error) {
  console.error('/endpoint failed', error);
  return res.status(500).json({ error: 'Operation failed.' });
}
```

**Benefits:**

- Catches async errors
- Logs for debugging
- Returns user-friendly error
- Always includes status code

### Global Error Handler

```javascript
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('Unhandled error', error);
  res.status(500).json({ error: 'Internal server error' });
});
```

**Catches:**

- Uncaught errors in middleware
- Errors passed to `next(error)`
- JSON parsing errors

**Note:** `no-unused-vars` eslint disable for `next` parameter

### 404 Handler

```javascript
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});
```

**Placed last** - Catches all unmatched routes

## Security Implementation

### Helmet.js Configuration

```javascript
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Allows embedding
    contentSecurityPolicy: false, // Disabled for simplicity
  })
);
```

**Headers Set:**

- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking (disabled with crossOriginEmbedderPolicy: false)
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Strict-Transport-Security: max-age=31536000` - HTTPS enforcement

**Production CSP (Future):**

```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
    fontSrc: ["'self'", "fonts.gstatic.com"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
  },
}
```

### Rate Limiting

```javascript
const apiLimiter = rateLimit({
  windowMs: Number(RATE_LIMIT_WINDOW_MS), // 60000ms = 1 minute
  limit: Number(RATE_LIMIT_MAX), // 100 requests
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false, // Don't return X-RateLimit-* headers
});

app.use(['/subscribe', '/unsubscribe', '/send-notification', '/devices'], apiLimiter);
```

**Mechanism:**

- Stores request count per IP in memory
- Resets after window expires
- Returns 429 Too Many Requests when exceeded

**Headers:**

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1706400000
```

**Limitations:**

- Memory-based (resets on server restart)
- Per-instance (not shared across multiple servers)
- Use Redis for production multi-instance setups

### CORS Configuration

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});
```

**Why manual CORS?**

- Simple and flexible
- Works in both dev and prod
- No dependency on `cors` package

**Production Security:**

```javascript
const allowedOrigins = ['https://pushflow.app', 'https://www.pushflow.app'];
const origin = req.headers.origin;

if (allowedOrigins.includes(origin)) {
  res.header('Access-Control-Allow-Origin', origin);
}
```

### Input Sanitization

```javascript
// Escape HTML in user-generated content
import escapeHtml from 'escape-html';

const payload = JSON.stringify({
  title: 'PushFlow',
  body: escapeHtml(message), // Prevent XSS in notifications
  data: { sender: deviceId },
});
```

**Note:** PushFlow doesn't currently escape (notifications render as plain text)

## Logging

### Morgan Configuration

```javascript
app.use(morgan(LOG_FORMAT));
```

**Formats:**

- `dev` - Colorized, concise (development)
- `combined` - Apache standard (production)
- `common` - Apache common format
- `tiny` - Minimal output

**Example Output (dev):**

```
GET /devices 200 45.123 ms - 1234
POST /subscribe 200 12.456 ms - 23
GET /health 200 1.234 ms - 12
```

**Custom Format:**

```javascript
morgan(':method :url :status :res[content-length] - :response-time ms :date[clf]');
```

### Application Logging

```javascript
console.log('PushFlow server listening on http://localhost:3000');
console.error('/subscribe failed', error);
console.warn('Removed stale subscription', device.deviceId);
```

**Production Logging:**

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

## Server Startup

### Standard Node.js Server

```javascript
async function start() {
  try {
    await getCollections(); // Ensure DB connection
    app.listen(PORT, () => {
      console.warn(`PushFlow server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

if (process.env.VERCEL !== '1') {
  start();
}

export default app;
```

**Flow:**

1. Connect to MongoDB
2. Ensure indexes created
3. Start Express server
4. Log startup message

**Vercel Check:**

- `process.env.VERCEL === '1'` - Serverless environment
- Don't call `app.listen()` in serverless
- Export `app` for Vercel to wrap

### Vercel Serverless Entry

```javascript
// api/index.js
import { getCollections } from '../database/db.js';
import app from '../server.mjs';

let isInitialized = false;

export default async function handler(req, res) {
  try {
    // Initialize on first request
    if (!isInitialized) {
      await getCollections();
      isInitialized = true;
    }

    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}
```

**Cold Start Optimization:**

- `isInitialized` flag prevents redundant DB connections
- First request slower (cold start)
- Subsequent requests fast (warm)

## Performance Optimizations

### Static Asset Caching

```javascript
app.use(
  express.static('public', {
    maxAge: NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true,
  })
);
```

**Headers:**

```
Cache-Control: public, max-age=86400  (production)
Cache-Control: no-cache               (development)
ETag: "hash"
Last-Modified: Thu, 28 Jan 2026 10:00:00 GMT
```

### JSON Compression

```javascript
import compression from 'compression';

app.use(compression()); // Gzip responses over 1KB
```

**Savings:** 70-90% for JSON responses

### Connection Pooling

MongoDB driver handles automatically (no code needed)

## Testing the API

### Manual Testing (curl)

```bash
# Health check
curl http://localhost:3000/health

# Get VAPID key
curl http://localhost:3000/vapid-public-key

# Subscribe
curl -X POST http://localhost:3000/subscribe \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test-123","subscription":{...},"deviceName":"Test Device"}'

# Get devices
curl http://localhost:3000/devices

# Send notification
curl -X POST http://localhost:3000/send-notification \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test-123","message":"Hello!"}'

# Unsubscribe
curl -X POST http://localhost:3000/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test-123"}'
```

### Automated Testing (Future)

```javascript
import request from 'supertest';
import app from './server.mjs';

describe('API Endpoints', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /subscribe requires deviceId', async () => {
    const res = await request(app).post('/subscribe').send({});
    expect(res.status).toBe(400);
  });
});
```

## Best Practices

1. **Input Validation** - Always validate before processing
2. **Error Handling** - Try-catch all async operations
3. **Status Codes** - Use appropriate HTTP codes (200, 400, 403, 500)
4. **Logging** - Log errors for debugging
5. **Rate Limiting** - Protect endpoints from abuse
6. **Security Headers** - Use Helmet.js
7. **CORS** - Configure appropriately for prod
8. **Connection Pooling** - Let MongoDB driver handle it
9. **Caching** - Cache static assets in production
10. **Monitoring** - Add APM for production (Sentry, Datadog)
