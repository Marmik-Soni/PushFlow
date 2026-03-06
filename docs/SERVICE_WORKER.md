# Service Worker Documentation

## What is a Service Worker?

A Service Worker is a special type of web worker that acts as a programmable network proxy between your web application and the network. It runs in the background, separate from your main browser thread, enabling powerful features like offline functionality, background sync, and push notifications. Unlike regular web pages, service workers persist even when the web app is closed, allowing them to handle push events and update caches without user interaction. In PushFlow, the service worker is the critical component that receives push notifications, manages the application cache for offline support, and implements a network-first caching strategy to ensure optimal performance. Service workers operate on a specific lifecycle (install, activate, fetch) and can intercept all network requests from the page, making them essential for Progressive Web App functionality.

---

## Table of Contents

1. [Service Worker Lifecycle](#service-worker-lifecycle)
2. [Cache Strategy](#cache-strategy)
3. [Fetch Event Handling](#fetch-event-handling)
4. [Push Event Handling](#push-event-handling)
5. [Notification Click Handling](#notification-click-handling)
6. [Registration & Updates](#registration--updates)
7. [Debugging Service Workers](#debugging-service-workers)
8. [Performance Optimization](#performance-optimization)
9. [Best Practices](#best-practices)

---

## Service Worker Lifecycle

### Overview

The service worker lifecycle consists of several distinct phases:

```
Registration → Install → Activate → Idle → Fetch/Message/Push → Terminated
                  ↓          ↓
              Waiting    Controlling
```

### 1. Registration Phase

**Location**: `app.js`

The main application registers the service worker:

```javascript
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    statusText.textContent = 'Service workers not supported.';
    return null;
  }

  // Register service worker with update check
  const registration = await navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none', // Always check for updates
  });

  // Check for updates periodically
  if (registration.waiting) {
    // New service worker is waiting, prompt update
    console.warn('New service worker waiting, will activate on next visit');
  }

  return registration;
}

// Call during app initialization
const registration = await registerServiceWorker();
state.registration = registration;
```

**Registration Options**:

- `updateViaCache: 'none'` - Always fetch the latest service worker from network
- `updateViaCache: 'imports'` - Cache SW but not imported scripts
- `updateViaCache: 'all'` - Cache everything (default)

### 2. Install Phase

**Location**: `sw.js`

The install event fires when the service worker is first registered or when a new version is detected:

```javascript
const CACHE_NAME = 'pushflow-v2';
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => {
        console.log('[SW] Skip waiting to activate immediately');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed', error);
        throw error;
      })
  );
});
```

**Key Concepts**:

- `event.waitUntil()` - Extends the event lifetime until the promise resolves
- `cache.addAll()` - Fetches and caches all listed resources atomically
- `self.skipWaiting()` - Activates the new service worker immediately without waiting

**Important**: If any file in `STATIC_CACHE` fails to cache, the entire installation fails.

### 3. Activate Phase

**Location**: `sw.js`

The activate event fires when the service worker becomes active:

```javascript
// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');

  event.waitUntil(
    (async () => {
      // Enable navigation preload for faster page loads
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
        console.log('[SW] Navigation preload enabled');
      }

      // Delete old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );

      // Take control of all clients immediately
      await self.clients.claim();
      console.log('[SW] Service worker activated and claimed clients');
    })()
  );
});
```

**Key Concepts**:

- `navigationPreload.enable()` - Starts fetching navigation requests in parallel with SW boot
- `caches.keys()` - Returns all cache names
- `caches.delete()` - Removes old cache versions
- `clients.claim()` - Takes control of all pages immediately (without refresh)

### Lifecycle State Diagram

```
┌────────────────┐
│  Parsed        │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  Installing    │ ← Install event fires
└───────┬────────┘   Cache static assets
        │            skipWaiting()
        ▼
┌────────────────┐
│  Installed     │
│  (Waiting)     │ ← Waiting for old SW to stop
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  Activating    │ ← Activate event fires
└───────┬────────┘   Clean old caches
        │            clients.claim()
        ▼
┌────────────────┐
│  Activated     │ ← Ready to handle events
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  Redundant     │ ← Replaced by newer SW
└────────────────┘
```

---

## Cache Strategy

PushFlow implements a **network-first with cache fallback** strategy, optimized for dynamic content while maintaining offline support.

### Network-First Strategy

```javascript
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      // 1. Try navigation preload first (if available)
      const preloadResponse = await event.preloadResponse;
      if (preloadResponse) {
        console.log('[SW] Using preloaded response for', event.request.url);
        return preloadResponse;
      }

      try {
        // 2. Try network request
        const networkResponse = await fetch(event.request);

        // Only cache successful responses
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();

          // Update cache in background (don't await)
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }

        return networkResponse;
      } catch (error) {
        // 3. Network failed, try cache
        console.log('[SW] Network failed, trying cache for', event.request.url);
        const cached = await caches.match(event.request);

        if (cached) {
          console.log('[SW] Serving from cache:', event.request.url);
          return cached;
        }

        // 4. No cache either, throw error
        console.error('[SW] No cache available for', event.request.url);
        throw error;
      }
    })()
  );
});
```

### Cache Strategy Comparison

#### Network-First (PushFlow Implementation)

**Pros**:

- Always serves fresh content when online
- Automatically updates cache with latest responses
- Great for dynamic data (device lists, notifications)

**Cons**:

- Slower when online (network latency)
- Requires network for first load

**Best for**: API calls, dynamic pages, frequently updated content

#### Cache-First (Alternative)

```javascript
// Cache-first strategy (not used in PushFlow)
self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
```

**Pros**:

- Instant response from cache
- Minimal network usage

**Cons**:

- May serve stale content
- Requires cache update strategy

**Best for**: Static assets (images, CSS, fonts)

#### Stale-While-Revalidate

```javascript
// Stale-while-revalidate (hybrid approach)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      });

      return cached || fetchPromise;
    })
  );
});
```

**Pros**:

- Instant response from cache
- Background updates keep cache fresh

**Cons**:

- May serve stale content initially
- More complex logic

**Best for**: Semi-static content (avatars, thumbnails)

### Cache Versioning

```javascript
const CACHE_NAME = 'pushflow-v2'; // Increment version to force cache refresh

// During activation, old versions are automatically deleted
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
});
```

**Version Bump Scenarios**:

- Breaking changes to cached files
- Major UI redesigns
- API response format changes
- Bug fixes in cached assets

---

## Fetch Event Handling

### Request Interception

The service worker intercepts **all** network requests from the page:

```javascript
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  console.log('[SW] Fetch event:', event.request.method, url.pathname);

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    console.log('[SW] Ignoring non-GET request');
    return; // Let browser handle POST, PUT, DELETE, etc.
  }

  event.respondWith(handleFetch(event.request));
});
```

### Advanced Fetch Handling

```javascript
async function handleFetch(request) {
  const url = new URL(request.url);

  // Strategy 1: API calls - Network only (no cache)
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/subscribe') ||
    url.pathname.startsWith('/send-notification')
  ) {
    try {
      return await fetch(request);
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Strategy 2: Images - Cache first
  if (request.destination === 'image') {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      return response;
    } catch (error) {
      // Return placeholder image
      return caches.match('/icons/placeholder.png');
    }
  }

  // Strategy 3: Everything else - Network first
  return networkFirstStrategy(request);
}
```

### Navigation Preload

```javascript
// Enable during activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
    })()
  );
});

// Use preloaded response in fetch handler
self.addEventListener('fetch', (event) => {
  event.respondWith(
    (async () => {
      const preloadResponse = await event.preloadResponse;
      if (preloadResponse) {
        return preloadResponse; // Faster!
      }

      return fetch(event.request);
    })()
  );
});
```

**Benefits**:

- Starts navigation request before SW boots up
- Reduces time-to-interactive
- No code changes needed (automatic optimization)

---

## Push Event Handling

### Receiving Push Notifications

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
      data: payload.data || {},
      tag: payload.tag || 'pushflow',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error('[SW] Failed to process push event', error);
  }
});
```

### Notification Options

```javascript
const notificationOptions = {
  // Required
  body: 'Notification message',

  // Visual
  icon: '/icons/icon-192.png', // Large icon (Android)
  badge: '/icons/badge-72x72.png', // Small icon (Android status bar)
  image: '/images/promo.jpg', // Large image below text

  // Behavior
  tag: 'unique-id', // Replace existing notifications with same tag
  requireInteraction: false, // Auto-dismiss after timeout
  silent: false, // Play sound

  // Vibration pattern (ms)
  vibrate: [200, 100, 200], // Vibrate-pause-vibrate

  // Custom data
  data: {
    url: '/messages/123',
    sender: 'device-abc',
  },

  // Actions (Android/Desktop)
  actions: [
    {
      action: 'open',
      title: 'Open',
      icon: '/icons/open.png',
    },
    {
      action: 'dismiss',
      title: 'Dismiss',
      icon: '/icons/dismiss.png',
    },
  ],
};
```

### Push Payload Structure

**Sent from server** (`server.mjs`):

```javascript
const payload = JSON.stringify({
  title: 'PushFlow',
  body: message,
  data: {
    sender: deviceId || 'unknown',
    timestamp: Date.now(),
  },
  tag: 'pushflow-message',
});

await webpush.sendNotification(device.subscription, payload);
```

**Received in service worker**:

```javascript
self.addEventListener('push', (event) => {
  const payload = event.data.json();

  // payload = {
  //   title: 'PushFlow',
  //   body: 'Hello from device-123',
  //   data: { sender: 'device-123', timestamp: 1234567890 },
  //   tag: 'pushflow-message'
  // }
});
```

---

## Notification Click Handling

### Basic Click Handler

**Location**: `sw.js`

```javascript
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);

  // Close the notification
  event.notification.close();

  // Handle the click
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find existing window
      const target = clientList.find((client) => client.url.includes(self.location.origin));

      if (target) {
        // Focus existing window
        console.log('[SW] Focusing existing window');
        return target.focus();
      }

      // Open new window
      console.log('[SW] Opening new window');
      return clients.openWindow('/');
    })
  );
});
```

### Advanced Click Handler with Actions

```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Handle action clicks
  if (event.action === 'open') {
    event.waitUntil(clients.openWindow('/messages/' + event.notification.data.messageId));
    return;
  }

  if (event.action === 'dismiss') {
    // Just close (already closed above)
    return;
  }

  // Default action (click on body)
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window' });

      for (const client of allClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Send message to existing tab
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data,
          });
          return client.focus();
        }
      }

      // No existing window, open new one
      return clients.openWindow('/');
    })()
  );
});
```

### Communicating with the Page

**Service Worker** sends message:

```javascript
self.addEventListener('notificationclick', (event) => {
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({
          type: 'NOTIFICATION_CLICKED',
          payload: event.notification.data,
        });
      });
    })
  );
});
```

**Page** receives message:

```javascript
// In app.js
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data.type === 'NOTIFICATION_CLICKED') {
    console.log('User clicked notification:', event.data.payload);

    // Update UI, navigate, etc.
    showMessage(event.data.payload);
  }
});
```

---

## Registration & Updates

### Initial Registration

**Location**: `app.js`

```javascript
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers not supported');
  }

  const registration = await navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none',
  });

  console.log('Service worker registered:', registration.scope);

  return registration;
}
```

### Update Detection

```javascript
async function checkForUpdates(registration) {
  // Manually check for updates
  await registration.update();

  if (registration.waiting) {
    console.log('New service worker waiting');

    // Prompt user to update
    if (confirm('New version available. Update now?')) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }
}

// Check for updates every hour
setInterval(
  () => {
    if (state.registration) {
      checkForUpdates(state.registration);
    }
  },
  60 * 60 * 1000
);
```

### Automatic Update on Skip Waiting

**Service Worker**:

```javascript
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

**Page**:

```javascript
navigator.serviceWorker.addEventListener('controllerchange', () => {
  console.log('New service worker activated');
  window.location.reload();
});
```

### Unregistration

```javascript
async function unregisterServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration();

  if (registration) {
    await registration.unregister();
    console.log('Service worker unregistered');
  }
}
```

---

## Debugging Service Workers

### Chrome DevTools

1. **Application Tab** → Service Workers
   - View registered service workers
   - Update/Unregister
   - Simulate offline mode
   - Force update on reload

2. **Console Logging**:

```javascript
// Service worker logs appear in DevTools console
console.log('[SW] Installing');
console.warn('[SW] Cache failed');
console.error('[SW] Fatal error');
```

3. **Network Tab**:
   - Look for "(from ServiceWorker)" label
   - Verify caching strategy

4. **Cache Storage**:
   - Application → Cache Storage
   - View cached resources
   - Delete caches manually

### Testing Lifecycle Events

```javascript
// Force install event
self.skipWaiting();

// Force activate event
self.clients.claim();

// Test push notification
self.registration.showNotification('Test', {
  body: 'This is a test notification',
});
```

### Common Issues

**1. Service Worker Not Updating**

```javascript
// Solution: Hard refresh (Ctrl+Shift+R) or
navigator.serviceWorker.getRegistration().then((reg) => reg.update());
```

**2. Cache Not Clearing**

```javascript
// Manually clear all caches
caches.keys().then((names) => {
  names.forEach((name) => caches.delete(name));
});
```

**3. Push Notifications Not Working**

```javascript
// Check notification permission
if (Notification.permission !== 'granted') {
  await Notification.requestPermission();
}

// Verify subscription
const subscription = await registration.pushManager.getSubscription();
console.log('Subscription:', subscription);
```

---

## Performance Optimization

### 1. Selective Caching

```javascript
// Don't cache everything
const STATIC_CACHE = [
  '/', // Essential
  '/index.html', // Essential
  '/app.js', // Essential
  '/manifest.json', // Essential
  '/icons/icon-192.png', // Essential
  // Don't cache: large images, videos, dynamic API responses
];
```

### 2. Cache Expiration

```javascript
async function cleanupOldCaches() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();

  const now = Date.now();
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const request of requests) {
    const response = await cache.match(request);
    const dateHeader = response.headers.get('date');

    if (dateHeader) {
      const age = now - new Date(dateHeader).getTime();
      if (age > MAX_AGE) {
        await cache.delete(request);
      }
    }
  }
}

// Run during activation
self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupOldCaches());
});
```

### 3. Background Sync (Future Enhancement)

```javascript
// Register sync
registration.sync.register('send-messages');

// Handle sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'send-messages') {
    event.waitUntil(sendPendingMessages());
  }
});
```

---

## Best Practices

### 1. Always Use HTTPS

Service workers only work on HTTPS (or localhost for development).

### 2. Keep Service Worker Small

- Minimize dependencies
- Avoid large libraries
- Use efficient algorithms

### 3. Handle Errors Gracefully

```javascript
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch((error) => {
      console.error('[SW] Fetch failed:', error);
      return caches.match(event.request);
    })
  );
});
```

### 4. Version Your Caches

```javascript
const CACHE_VERSION = 'v2';
const CACHE_NAME = `pushflow-${CACHE_VERSION}`;
```

### 5. Test Offline Functionality

- Use Chrome DevTools offline mode
- Test with throttled network (Slow 3G)
- Verify cache fallbacks work

### 6. Monitor Service Worker Health

```javascript
// Report errors to analytics
self.addEventListener('error', (event) => {
  console.error('[SW] Error:', event.error);
  // Send to error tracking service
});
```

---

## Conclusion

Service workers are the backbone of Progressive Web Apps, enabling offline functionality, background sync, and push notifications. PushFlow's service worker implements a robust network-first caching strategy, handles push events efficiently, and manages the complete lifecycle from installation to updates. Understanding the service worker lifecycle, debugging techniques, and performance optimizations is essential for building reliable PWAs that work seamlessly across all network conditions.
