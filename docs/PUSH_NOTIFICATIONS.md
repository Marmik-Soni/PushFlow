# Push Notifications Documentation

## What are Push Notifications?

Push Notifications are messages that are "pushed" from a server to a user's device, even when the web application is not actively running in the browser. They work through a combination of the Web Push Protocol (based on HTTP/2), service workers that run in the background, and platform-specific push services (like Firebase Cloud Messaging for Android or Apple Push Notification service for iOS). In PushFlow, push notifications enable real-time messaging across multiple devices without requiring the app to be open. The system uses VAPID (Voluntary Application Server Identification) for secure authentication, ensuring that only authorized servers can send notifications to subscribed devices. Push notifications are the key feature that transforms a regular web app into a truly engaging, app-like experience with the ability to re-engage users even when they're not actively using the application.

---

## Table of Contents

1. [Web Push Protocol](#web-push-protocol)
2. [VAPID Authentication](#vapid-authentication)
3. [Subscription Flow](#subscription-flow)
4. [Sending Notifications](#sending-notifications)
5. [Receiving & Displaying Notifications](#receiving--displaying-notifications)
6. [iOS Handling](#ios-handling)
7. [Error Handling](#error-handling)
8. [Testing Push Notifications](#testing-push-notifications)
9. [Best Practices](#best-practices)

---

## Web Push Protocol

### Overview

The Web Push Protocol (RFC 8030) defines how application servers send messages to user agents (browsers) via push services.

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ Application │          │    Push     │          │   Browser   │
│   Server    │─────────►│   Service   │─────────►│  (Service   │
│  (Express)  │  HTTPS   │  (FCM/APN)  │  WebSock │   Worker)   │
└─────────────┘          └─────────────┘          └─────────────┘
      │                         │                         │
      │ 1. Send notification    │                         │
      │    with subscription    │                         │
      │                         │ 2. Route to device      │
      │                         │                         │
      │                         │                         │ 3. 'push' event
      │                         │                         │    fires in SW
      │                         │                         │
      │                         │                         │ 4. Show notification
```

### Push Service Endpoints

Different browsers use different push services:

| Browser     | Push Service                   | Endpoint Pattern                                |
| ----------- | ------------------------------ | ----------------------------------------------- |
| Chrome/Edge | Firebase Cloud Messaging (FCM) | `https://fcm.googleapis.com/fcm/send/...`       |
| Firefox     | Mozilla Push Service           | `https://updates.push.services.mozilla.com/...` |
| Safari      | Apple Push Notification (APNs) | `https://web.push.apple.com/...`                |
| Opera       | Opera Push Service             | `https://push.opera.com/...`                    |

### Push Message Format

**Standard Web Push Protocol** (RFC 8030):

```http
POST /push-endpoint HTTP/2
Host: push.service.mozilla.org
TTL: 86400
Content-Length: 145
Content-Type: application/octet-stream
Content-Encoding: aes128gcm

[Encrypted payload data]
```

**Headers**:

- `TTL` (Time-To-Live): How long (seconds) the push service should queue the message
- `Urgency`: Priority level (`very-low`, `low`, `normal`, `high`)
- `Topic`: Replace pending messages with the same topic

---

## VAPID Authentication

### What is VAPID?

**VAPID** (Voluntary Application Server Identification) allows push services to:

1. Verify the identity of the application server
2. Contact the server operator if needed
3. Prevent unauthorized notifications

### Generating VAPID Keys

**One-time setup** using the `web-push` library:

```javascript
const webpush = require('web-push');

// Generate VAPID keys
const vapidKeys = webpush.generateVAPIDKeys();

console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

// Save these in .env file:
// VAPID_PUBLIC_KEY=your-public-key
// VAPID_PRIVATE_KEY=your-private-key
```

**Environment Variables** (`.env`):

```env
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U
VAPID_PRIVATE_KEY=UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls
VAPID_SUBJECT=mailto:admin@pushflow.com
```

### Server Configuration

**Location**: `server.mjs`

```javascript
import webpush from 'web-push';
import dotenv from 'dotenv';

dotenv.config();

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:example@example.com',
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('VAPID keys are required in the environment.');
}

// Configure web-push with VAPID details
webpush.setVapidDetails(
  VAPID_SUBJECT, // Email or URL to contact server operator
  VAPID_PUBLIC_KEY, // Public key for subscription
  VAPID_PRIVATE_KEY // Private key for signing (kept secret)
);

// Cache public key for fast access
const CACHED_VAPID_KEY = VAPID_PUBLIC_KEY;

// Expose public key to clients
app.get('/vapid-public-key', (req, res) => {
  res.json({ key: CACHED_VAPID_KEY });
});
```

### How VAPID Works

1. **Server generates** a JWT (JSON Web Token) signed with private key
2. **JWT contains**:
   - `aud` (audience): Push service URL
   - `exp` (expiration): Token expiry (max 24 hours)
   - `sub` (subject): Contact information (email/URL)

3. **Push service verifies** JWT using public key
4. **If valid**, push service accepts the message

**Example JWT Header**:

```json
{
  "typ": "JWT",
  "alg": "ES256"
}
```

**Example JWT Payload**:

```json
{
  "aud": "https://fcm.googleapis.com",
  "exp": 1234567890,
  "sub": "mailto:admin@pushflow.com"
}
```

---

## Subscription Flow

### Client-Side Subscription

**Location**: `app.js`

#### Step 1: Request Notification Permission

```javascript
async function subscribe() {
  // Request permission from user
  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    statusText.textContent = 'Notifications blocked.';
    showToast('Enable notifications to subscribe', 'error');
    return;
  }

  console.log('Notification permission granted');
}
```

**Permission States**:

- `granted` - User allowed notifications
- `denied` - User blocked notifications
- `default` - User hasn't decided yet

#### Step 2: Get VAPID Public Key

```javascript
async function getVapidKey() {
  const response = await fetch('/vapid-public-key');
  const { key } = await response.json();
  return key;
}

// Convert base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
```

#### Step 3: Subscribe via Push Manager

```javascript
async function subscribe() {
  const registration = await ensureRegistration();
  const vapidKey = await getVapidKey();
  const applicationServerKey = urlBase64ToUint8Array(vapidKey);

  // Check if already subscribed
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    console.log('Already subscribed:', existing);

    // Verify key matches
    const match = keysMatch(existing.options.applicationServerKey, applicationServerKey);

    if (match) {
      state.subscription = existing;
      // Continue to step 4...
      return;
    }

    // Key mismatch, unsubscribe and resubscribe
    await existing.unsubscribe();
  }

  // Create new subscription
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // Required: show notification to user
    applicationServerKey, // VAPID public key
  });

  console.log('Push subscription created:', subscription);
  state.subscription = subscription;
}
```

**Subscription Object Structure**:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/abc123...",
  "expirationTime": null,
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=",
    "auth": "tBHItJI5svbpez7KI4CCXg=="
  }
}
```

- `endpoint`: Push service URL (unique per subscription)
- `keys.p256dh`: Public key for encryption
- `keys.auth`: Authentication secret

#### Step 4: Send Subscription to Server

```javascript
async function subscribe() {
  // ... previous steps ...

  const deviceId = getDeviceId();
  const deviceName = getDeviceName();

  // Send subscription to server
  await fetchJson('/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      subscription,
      deviceName,
    }),
  });

  statusText.textContent = 'Subscribed and ready.';
  showToast('Device subscribed successfully!');
  updateUI(true);
}
```

### Server-Side Subscription Storage

**Location**: `server.mjs`

```javascript
app.post('/subscribe', async (req, res) => {
  const { deviceId, subscription, deviceName } = req.body || {};

  // Validate input
  if (!deviceId || !subscription || !subscription.endpoint) {
    return res.status(400).json({
      error: 'deviceId and valid subscription are required.',
    });
  }

  try {
    const { devices } = await getCollections();

    // Upsert device document
    await devices.updateOne(
      { deviceId },
      {
        $set: {
          subscription,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          deviceName: deviceName || 'Unknown device',
          lastSeen: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('/subscribe failed', error);
    return res.status(500).json({
      error: 'Failed to store subscription.',
    });
  }
});
```

**MongoDB Document Structure**:

```json
{
  "_id": ObjectId("..."),
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceName": "Windows Desktop (Chrome)",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc123...",
    "keys": {
      "p256dh": "BNcRd...",
      "auth": "tBHIt..."
    }
  },
  "endpoint": "https://fcm.googleapis.com/fcm/send/abc123...",
  "keys": {
    "p256dh": "BNcRd...",
    "auth": "tBHIt..."
  },
  "createdAt": ISODate("2026-01-30T10:00:00.000Z"),
  "lastSeen": ISODate("2026-01-30T15:30:00.000Z")
}
```

---

## Sending Notifications

### Client Triggers Notification

**Location**: `app.js`

```javascript
async function sendNotification() {
  const message = messageInput.value.trim();

  if (!message) {
    showToast('Please enter a message', 'error');
    return;
  }

  if (!state.deviceId) {
    showToast('Please subscribe first', 'error');
    return;
  }

  sendBtn.classList.add('loading');
  sendBtn.disabled = true;

  try {
    const response = await fetchJson('/send-notification', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: state.deviceId,
        message,
      }),
    });

    showToast(`Sent to ${response.sent} device(s)`);
    messageInput.value = '';
    updateCharCounter();
  } catch (error) {
    showToast('Failed to send notification', 'error');
    console.error(error);
  } finally {
    sendBtn.classList.remove('loading');
    sendBtn.disabled = false;
  }
}
```

### Server Broadcasts Notification

**Location**: `server.mjs`

```javascript
app.post('/send-notification', async (req, res) => {
  const { deviceId, message } = req.body || {};

  // Validate sender
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
      return res.status(403).json({
        error: 'Sender is not subscribed.',
      });
    }

    // Get all subscribed devices
    const allDevices = await devices.find({}).toArray();

    // Prepare notification payload
    const payload = JSON.stringify({
      title: 'PushFlow',
      body: message,
      data: {
        sender: deviceId || 'unknown',
        timestamp: Date.now(),
      },
      tag: 'pushflow-message',
    });

    // Send to all devices
    const sendResults = await Promise.all(
      allDevices.map(async (device) => {
        try {
          await webpush.sendNotification(device.subscription, payload);
          return { deviceId: device.deviceId, ok: true };
        } catch (error) {
          // Handle subscription errors
          const isGone = error?.statusCode === 404 || error?.statusCode === 410;

          if (isGone) {
            // Subscription expired, remove from database
            await devices.deleteOne({ deviceId: device.deviceId });
            console.warn('Removed stale subscription', device.deviceId);
          } else {
            console.error('Notification failed', device.deviceId, error);
          }

          return { deviceId: device.deviceId, ok: false };
        }
      })
    );

    // Save message to history
    await messages.insertOne({
      deviceId: deviceId || 'unknown',
      message,
      createdAt: new Date(),
    });

    const successCount = sendResults.filter((r) => r.ok).length;

    return res.json({
      ok: true,
      sent: successCount,
      total: allDevices.length,
    });
  } catch (error) {
    console.error('/send-notification failed', error);
    return res.status(500).json({
      error: 'Failed to send notifications.',
    });
  }
});
```

### Web-Push Library API

**Basic Usage**:

```javascript
const webpush = require('web-push');

// Send notification
await webpush.sendNotification(
  subscription, // PushSubscription object
  payload // String or Buffer (JSON)
);
```

**Advanced Options**:

```javascript
await webpush.sendNotification(subscription, payload, {
  TTL: 86400, // Time-to-live (seconds)
  urgency: 'high', // Priority: very-low, low, normal, high
  topic: 'message-update', // Replace previous with same topic
  headers: {
    'Content-Encoding': 'aes128gcm',
  },
});
```

**Error Handling**:

```javascript
try {
  await webpush.sendNotification(subscription, payload);
} catch (error) {
  if (error.statusCode === 404 || error.statusCode === 410) {
    // Subscription expired or deleted
    console.log('Subscription no longer valid');
  } else if (error.statusCode === 429) {
    // Too many requests
    console.log('Rate limited by push service');
  } else if (error.statusCode === 400) {
    // Invalid request
    console.log('Invalid push subscription or payload');
  } else {
    // Other error
    console.error('Push failed:', error);
  }
}
```

---

## Receiving & Displaying Notifications

### Service Worker Receives Push

**Location**: `sw.js`

```javascript
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');

  if (!event.data) {
    console.warn('[SW] Push event has no data');
    return;
  }

  try {
    const payload = event.data.json();
    console.log('[SW] Push payload:', payload);

    const title = payload.title || 'PushFlow';
    const body = payload.body || 'New notification';

    const options = {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data || {},
      tag: payload.tag || 'pushflow',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: [
        {
          action: 'open',
          title: 'Open',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error('[SW] Failed to process push event', error);
  }
});
```

### Notification Options Reference

```javascript
const notificationOptions = {
  // Text content
  body: 'Notification message text', // Main message

  // Visual elements
  icon: '/icons/icon-192.png', // Large icon (Android: left side)
  badge: '/icons/badge-72x72.png', // Small icon (Android: status bar)
  image: '/images/notification-image.jpg', // Large image below text

  // Behavior
  tag: 'unique-notification-id', // Replace existing with same tag
  renotify: true, // Alert again when replaced (requires tag)
  requireInteraction: false, // Auto-dismiss after timeout
  silent: false, // Play sound and vibrate

  // Vibration pattern (ms): vibrate, pause, vibrate, pause...
  vibrate: [200, 100, 200, 100, 200],

  // Timestamp
  timestamp: Date.now(), // Display time (defaults to now)

  // Custom data (accessible in click handler)
  data: {
    url: '/messages/123',
    sender: 'device-abc',
    messageId: 'msg-456',
  },

  // Action buttons (Android/Desktop only)
  actions: [
    {
      action: 'open',
      title: 'Open',
      icon: '/icons/open.png', // Optional
    },
    {
      action: 'dismiss',
      title: 'Dismiss',
      icon: '/icons/dismiss.png',
    },
  ],

  // Direction (for RTL languages)
  dir: 'auto', // 'ltr', 'rtl', or 'auto'

  // Language
  lang: 'en-US',
};
```

### Notification Click Handler

```javascript
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'open') {
    // Open specific URL
    event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
    return;
  }

  if (event.action === 'dismiss') {
    // Just close (already closed above)
    return;
  }

  // Default action (click on body)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const target = clientList.find((client) => client.url.includes(self.location.origin));

      if (target) {
        return target.focus();
      }

      return clients.openWindow('/');
    })
  );
});
```

---

## iOS Handling

### iOS 16.4+ Support

As of iOS 16.4 (March 2023), Safari supports Web Push on iOS with some caveats:

**Requirements**:

1. App must be **added to Home Screen** (installed as PWA)
2. User must **interact** with the app before requesting permission
3. Notifications only work when app is **installed as PWA**

### iOS Detection

**Location**: `app.js`

```javascript
function isIOS() {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isIOSPWA() {
  return isIOS() && window.navigator.standalone === true;
}

// Show iOS-specific instructions
if (isIOS() && !isIOSPWA()) {
  showToast('On iOS, add this app to your Home Screen to enable notifications');
}
```

### iOS Manifest Configuration

**Location**: `manifest.json` & `index.html`

```json
{
  "display": "standalone",
  "orientation": "portrait-primary",
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

**HTML Meta Tags**:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

### iOS Push Behavior

**Differences from Android/Desktop**:

| Feature              | iOS              | Android/Desktop |
| -------------------- | ---------------- | --------------- |
| Push without install | ❌ No            | ✅ Yes          |
| Notification actions | ❌ No            | ✅ Yes          |
| Badge icon           | ❌ No            | ✅ Yes          |
| Custom vibration     | ❌ No            | ✅ Yes          |
| requireInteraction   | ❌ Ignored       | ✅ Works        |
| Notification icon    | ❌ Uses app icon | ✅ Custom icon  |

**iOS Code Example**:

```javascript
// Detect iOS and adjust notification options
const notificationOptions = {
  body: message,
  icon: '/icons/icon-192.png',
  data: payload.data,
};

// Don't add unsupported features on iOS
if (!isIOS()) {
  notificationOptions.badge = '/icons/badge-72x72.png';
  notificationOptions.vibrate = [200, 100, 200];
  notificationOptions.actions = [
    { action: 'open', title: 'Open' },
    { action: 'dismiss', title: 'Dismiss' },
  ];
}

await self.registration.showNotification(title, notificationOptions);
```

---

## Error Handling

### Common Push Errors

**1. Subscription Expired (410 Gone)**:

```javascript
try {
  await webpush.sendNotification(subscription, payload);
} catch (error) {
  if (error.statusCode === 410) {
    console.log('Subscription expired, removing from database');
    await devices.deleteOne({ deviceId: device.deviceId });
  }
}
```

**2. Invalid Subscription (404 Not Found)**:

```javascript
if (error.statusCode === 404) {
  console.log('Subscription not found (user unsubscribed)');
  await devices.deleteOne({ deviceId: device.deviceId });
}
```

**3. Rate Limiting (429 Too Many Requests)**:

```javascript
if (error.statusCode === 429) {
  const retryAfter = error.headers['retry-after'] || 60;
  console.log(`Rate limited, retry after ${retryAfter} seconds`);

  // Implement exponential backoff
  await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  await webpush.sendNotification(subscription, payload);
}
```

**4. Invalid Payload (400 Bad Request)**:

```javascript
if (error.statusCode === 400) {
  console.error('Invalid push payload or subscription');
  console.error('Subscription:', subscription);
  console.error('Payload:', payload);
}
```

### Subscription Validation

```javascript
function isValidSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') {
    return false;
  }

  if (!subscription.endpoint || typeof subscription.endpoint !== 'string') {
    return false;
  }

  if (!subscription.keys || typeof subscription.keys !== 'object') {
    return false;
  }

  if (!subscription.keys.p256dh || !subscription.keys.auth) {
    return false;
  }

  return true;
}

// Use in API endpoint
app.post('/subscribe', async (req, res) => {
  const { subscription } = req.body;

  if (!isValidSubscription(subscription)) {
    return res.status(400).json({
      error: 'Invalid subscription format',
    });
  }

  // Continue with subscription...
});
```

---

## Testing Push Notifications

### Manual Testing

**1. Test Notification Permission**:

```javascript
console.log('Permission:', Notification.permission);

if (Notification.permission === 'default') {
  await Notification.requestPermission();
}
```

**2. Test Local Notification** (without server):

```javascript
if ('Notification' in window && Notification.permission === 'granted') {
  new Notification('Test', {
    body: 'This is a test notification',
    icon: '/icons/icon-192.png',
  });
}
```

**3. Test Service Worker Notification**:

```javascript
navigator.serviceWorker.ready.then((registration) => {
  registration.showNotification('Test from SW', {
    body: 'This notification comes from the service worker',
    icon: '/icons/icon-192.png',
  });
});
```

### Chrome DevTools Testing

**1. Application Tab → Service Workers**:

- Click "Push" button to simulate push event
- Enter JSON payload to test

**2. Console**:

```javascript
// Get current subscription
navigator.serviceWorker.ready.then(async (reg) => {
  const sub = await reg.pushManager.getSubscription();
  console.log('Subscription:', JSON.stringify(sub));
});

// Test push subscription
fetch('/send-notification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deviceId: 'your-device-id',
    message: 'Test notification',
  }),
});
```

### Testing with cURL

```bash
# Get VAPID public key
curl http://localhost:3000/vapid-public-key

# Subscribe (use subscription from browser)
curl -X POST http://localhost:3000/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "test-device-123",
    "deviceName": "Test Device",
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    }
  }'

# Send notification
curl -X POST http://localhost:3000/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "test-device-123",
    "message": "Hello from cURL!"
  }'
```

---

## Best Practices

### 1. Request Permission at the Right Time

❌ **Bad**: Request on page load

```javascript
// Don't do this
window.addEventListener('load', () => {
  Notification.requestPermission();
});
```

✅ **Good**: Request after user interaction

```javascript
// Do this
enableBtn.addEventListener('click', async () => {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await subscribe();
  }
});
```

### 2. Handle Permission States

```javascript
async function checkNotificationPermission() {
  const permission = Notification.permission;

  switch (permission) {
    case 'granted':
      console.log('Notifications allowed');
      await subscribe();
      break;

    case 'denied':
      console.log('Notifications blocked');
      showToast('Please enable notifications in browser settings');
      break;

    case 'default':
      console.log('Notifications not decided');
      // Show explanation before requesting
      showInstructions();
      break;
  }
}
```

### 3. Clean Up Stale Subscriptions

```javascript
// Automatically remove expired subscriptions
const sendResults = await Promise.all(
  allDevices.map(async (device) => {
    try {
      await webpush.sendNotification(device.subscription, payload);
      return { deviceId: device.deviceId, ok: true };
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await devices.deleteOne({ deviceId: device.deviceId });
      }
      return { deviceId: device.deviceId, ok: false };
    }
  })
);
```

### 4. Use Notification Grouping

```javascript
// Group related notifications with same tag
const options = {
  tag: 'message-group', // Replaces previous with same tag
  renotify: true, // Alert user even when replacing
  data: { messageCount: 5 },
};

await self.registration.showNotification('5 New Messages', options);
```

### 5. Implement Retry Logic

```javascript
async function sendWithRetry(subscription, payload, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await webpush.sendNotification(subscription, payload);
      return { ok: true };
    } catch (error) {
      if (error.statusCode === 429 && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
}
```

### 6. Respect User Preferences

```javascript
// Allow users to control notification frequency
const userPreferences = {
  enableNotifications: true,
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '08:00',
  },
};

function shouldSendNotification() {
  if (!userPreferences.enableNotifications) {
    return false;
  }

  if (userPreferences.quietHours.enabled) {
    const now = new Date();
    const hour = now.getHours();
    // Check quiet hours...
  }

  return true;
}
```

---

## Conclusion

Push notifications are a powerful feature of Progressive Web Apps that enable real-time engagement even when the app is closed. PushFlow implements a complete push notification system using the Web Push Protocol, VAPID authentication, and service workers. Understanding the subscription flow, payload structure, error handling, and platform-specific behaviors (especially iOS) is crucial for building reliable push notification systems. Always respect user preferences, handle errors gracefully, and test across multiple browsers and devices to ensure a consistent experience.
