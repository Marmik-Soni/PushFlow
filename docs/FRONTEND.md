# Frontend Implementation Guide

## What is the Frontend?

The **frontend** is the part of PushFlow that users directly see and interact with in their web browser. It's the visual interface—the buttons you click to subscribe to notifications, the text box where you type messages, the list of connected devices, and the theme toggle for dark/light mode. While "frontend" often refers to just the HTML and CSS that create the visual design, in PushFlow it also includes all the JavaScript code that makes the interface interactive and connects it to the backend server.

PushFlow's frontend is intentionally built as a **Single Page Application (SPA)** using vanilla JavaScript without any frameworks like React or Vue. This design decision prioritizes simplicity, performance, and minimal file size—the entire application loads as one HTML file with embedded CSS and JavaScript, eliminating the need for complex build processes or large framework downloads. Everything happens in the browser: when you click "Subscribe," JavaScript code requests notification permission, generates a unique device ID, sends subscription data to the server, and updates the UI to show your connection status. The frontend manages all of this state locally using JavaScript variables and localStorage, creating a responsive experience that feels instant.

## Application Architecture

The frontend (`public/app.js`) is built with vanilla JavaScript and follows a state-driven architecture where all application data is stored in a central `state` object.

### State Management

```javascript
const state = {
  registration: null, // ServiceWorkerRegistration
  subscription: null, // PushSubscription
  deviceId: null, // UUID for this device
  autoTimer: null, // setTimeout handle for auto-unsubscribe
  pollTimer: null, // setInterval handle for device polling
  vapidPublicKey: null, // VAPID public key from server
  devices: [], // List of all subscribed devices
};
```

**State Object Fields:**

- `registration` - Service Worker registration object
- `subscription` - Push subscription object (contains endpoint and keys)
- `deviceId` - Unique UUID stored in localStorage
- `autoTimer` - Handle for 24-hour auto-unsubscribe timer
- `pollTimer` - Handle for device list polling interval
- `vapidPublicKey` - Server's VAPID public key (fetched once)
- `devices` - Array of device objects from `/devices` endpoint

**Why state-driven?**

- Single source of truth
- Easy debugging (inspect `state` in console)
- Predictable updates (all changes flow through state)
- No DOM as state (common anti-pattern)

### Initialization Flow

```javascript
// DOM loaded → Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadStoredDeviceId(); // Get or create device ID
  checkServiceWorker(); // Register SW if supported
  attachEventListeners(); // Wire up UI interactions
  loadTheme(); // Apply saved theme preference
});
```

**Startup Sequence:**

1. **Load Device ID** - Check localStorage for existing UUID or generate new one
2. **Check Service Worker** - Register `sw.js` if browser supports it
3. **Attach Event Listeners** - Connect UI buttons to handler functions
4. **Load Theme** - Apply light/dark mode from localStorage

## Core Functions

### Device ID Management

```javascript
function loadStoredDeviceId() {
  const stored = localStorage.getItem('pushflow-device-id');
  if (stored) {
    state.deviceId = stored;
  } else {
    state.deviceId = generateUUID();
    localStorage.setItem('pushflow-device-id', state.deviceId);
  }
  console.log('Device ID:', state.deviceId);
}
```

**Purpose:** Persistent device identification

**How it works:**

1. Check localStorage for existing ID
2. If found, use it; if not, generate new UUID v4
3. Store in state and localStorage
4. Log for debugging

**UUID Format:**

```
550e8400-e29b-41d4-a716-446655440000
```

**Why UUIDs?**

- Globally unique (collision probability ≈ 0)
- No server round-trip needed
- Privacy-friendly (not tied to personal info)
- Works offline

### Service Worker Registration

```javascript
async function checkServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    updateStatus('Service Workers not supported. Push notifications unavailable.', 'error');
    return;
  }

  try {
    // Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    state.registration = registration;
    updateStatus('Service Worker registered.', 'success');

    // Wait for activation
    await navigator.serviceWorker.ready;
    updateStatus('Service Worker ready.', 'success');

    // Fetch VAPID key
    await fetchVAPIDKey();

    // Check existing subscription
    await checkExistingSubscription();
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    updateStatus('Service Worker registration failed.', 'error');
  }
}
```

**Registration Options:**

- `scope: '/'` - Controls all pages under root
- `updateViaCache: 'none'` - Always fetch fresh SW file

**Flow:**

1. Check browser support (`'serviceWorker' in navigator`)
2. Register `/sw.js` with options
3. Store registration in state
4. Wait for SW to activate (`navigator.serviceWorker.ready`)
5. Fetch VAPID public key from server
6. Check if already subscribed (restore state)

**Error Handling:**

- Shows user-friendly error message
- Logs technical details to console
- Continues running (app still works without SW)

### Push Subscription

```javascript
async function subscribeDevice() {
  if (!state.registration || !state.vapidPublicKey) {
    updateStatus('Service Worker not ready or VAPID key missing.', 'error');
    return;
  }

  try {
    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      updateStatus('Notification permission denied.', 'error');
      return;
    }

    // Subscribe to push
    const subscription = await state.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey),
    });

    state.subscription = subscription;

    // Get device name
    const deviceName = getDeviceName();

    // Send to server
    const response = await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: state.deviceId,
        subscription: subscription.toJSON(),
        deviceName,
      }),
    });

    if (!response.ok) throw new Error('Subscription failed');

    updateStatus('Subscribed successfully!', 'success');
    showSubscribedUI();
    startPolling();
    startAutoTimer();
  } catch (error) {
    console.error('Subscription error:', error);
    updateStatus('Subscription failed: ' + error.message, 'error');
  }
}
```

**Subscribe Options:**

- `userVisibleOnly: true` - Required (ensures all pushes show notification)
- `applicationServerKey` - VAPID public key (converted to Uint8Array)

**Permission States:**

- `granted` - User allowed notifications
- `denied` - User blocked notifications (can't ask again)
- `default` - User hasn't decided yet

**Subscription Flow:**

```
Request Permission → Subscribe to Push → Get Device Name → POST to /subscribe → Update UI → Start Polling → Start Auto-Unsubscribe Timer
```

### Device Name Detection

```javascript
function getDeviceName() {
  const ua = navigator.userAgent;
  let os = 'Unknown OS';
  let browser = 'Unknown Browser';

  // Detect OS
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  // Detect Browser
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';

  return `${os} (${browser})`;
}
```

**Example Output:**

```
"Windows (Chrome)"
"macOS (Safari)"
"Android (Firefox)"
"iOS (Safari)"
```

**Why detect device name?**

- Helps users identify which device to send notifications to
- Useful for debugging (see which browsers are subscribed)
- Better UX than showing endpoints or UUIDs

### Unsubscription

```javascript
async function unsubscribeDevice() {
  if (!state.subscription) {
    updateStatus('No active subscription.', 'warning');
    return;
  }

  try {
    // Unsubscribe from push
    await state.subscription.unsubscribe();

    // Notify server
    await fetch('/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: state.deviceId }),
    });

    // Clear state
    state.subscription = null;
    stopPolling();
    stopAutoTimer();

    updateStatus('Unsubscribed successfully.', 'success');
    showUnsubscribedUI();
  } catch (error) {
    console.error('Unsubscription error:', error);
    updateStatus('Unsubscription failed: ' + error.message, 'error');
  }
}
```

**Flow:**

1. Unsubscribe from browser's push service
2. Notify server to delete from database
3. Clear local state
4. Stop device polling
5. Stop auto-unsubscribe timer
6. Update UI

**Error Handling:**

- Attempts both browser and server unsubscription
- Continues even if one fails
- Shows user-friendly error message

### Device Polling

```javascript
function startPolling() {
  if (state.pollTimer) return; // Already polling

  // Poll immediately
  updateDeviceList();

  // Poll every 30 seconds
  state.pollTimer = setInterval(() => {
    updateDeviceList();
  }, 30000);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}
```

**Polling Strategy:**

- **Interval:** 30 seconds
- **Immediate:** Polls once on start (don't wait 30s)
- **Conditional:** Only when subscribed

**Why polling?**

- Real-time device list updates
- See when other devices subscribe/unsubscribe
- Detect stale subscriptions (removed by server)

**Optimization:**

```javascript
// Only poll when tab is visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else if (state.subscription) {
    startPolling();
  }
});
```

**Data Saver Detection:**

```javascript
if (navigator.connection && navigator.connection.saveData) {
  console.log('Data saver enabled, reducing poll frequency');
  // Could increase interval to 60s or stop polling
}
```

### Sending Notifications

```javascript
async function sendNotification() {
  const message = document.getElementById('message').value.trim();
  if (!message) {
    updateStatus('Please enter a message.', 'warning');
    return;
  }

  if (!state.subscription) {
    updateStatus('You must be subscribed to send notifications.', 'error');
    return;
  }

  try {
    const response = await fetch('/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: state.deviceId,
        message,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send');
    }

    const data = await response.json();
    updateStatus(`Notification sent to ${data.sent} device(s)!`, 'success');
    document.getElementById('message').value = '';
  } catch (error) {
    console.error('Send error:', error);
    updateStatus('Failed to send: ' + error.message, 'error');
  }
}
```

**Validation:**

- Message not empty
- User is subscribed (403 error if not)

**Response:**

```json
{
  "ok": true,
  "sent": 3
}
```

**UI Updates:**

- Shows success message with device count
- Clears message input
- Updates status indicator

### Auto-Unsubscribe Timer

```javascript
function startAutoTimer() {
  stopAutoTimer(); // Clear existing timer

  // 24 hours = 86400000ms
  state.autoTimer = setTimeout(() => {
    unsubscribeDevice();
    updateStatus('Auto-unsubscribed after 24 hours.', 'info');
  }, 86400000);

  console.log('Auto-unsubscribe timer started (24 hours)');
}

function stopAutoTimer() {
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }
}
```

**Purpose:** Prevent stale subscriptions from accumulating

**Duration:** 24 hours (86,400,000 milliseconds)

**Trigger:** Automatically unsubscribes after 24 hours

**Why 24 hours?**

- Reasonable demo duration
- Prevents database bloat
- Encourages fresh subscriptions

**Production Alternative:**

- Remove auto-unsubscribe
- Or increase to 30 days
- Or add "extend subscription" button

### Theme Management

```javascript
function loadTheme() {
  const savedTheme = localStorage.getItem('pushflow-theme') || 'dark';
  applyTheme(savedTheme);
}

function toggleTheme() {
  const current = document.body.classList.contains('light-theme') ? 'light' : 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  localStorage.setItem('pushflow-theme', newTheme);
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('theme-toggle').textContent = '🌙';
  } else {
    document.body.classList.remove('light-theme');
    document.getElementById('theme-toggle').textContent = '☀️';
  }
}
```

**Themes:**

- `dark` - Default (GitHub-style dark mode)
- `light` - Light mode with dark text

**Persistence:**

- Saved to localStorage
- Restored on page load
- Syncs across tabs (same origin)

**CSS Variables:**

```css
:root {
  --bg: #0d1117;
  --text: #c9d1d9;
  --primary: #1f6feb;
}

body.light-theme {
  --bg: #ffffff;
  --text: #24292f;
  --primary: #0969da;
}
```

## User Interactions

### Subscribe Button

```javascript
document.getElementById('subscribe-btn').addEventListener('click', async () => {
  await subscribeDevice();
});
```

**Flow:**

1. Request notification permission
2. Subscribe to push service
3. POST to `/subscribe`
4. Update UI to show subscribed state
5. Start device polling
6. Start auto-unsubscribe timer

**UI Changes:**

- Subscribe button becomes disabled
- Unsubscribe button becomes enabled
- Send notification UI becomes visible
- Device list starts polling

### Unsubscribe Button

```javascript
document.getElementById('unsubscribe-btn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to unsubscribe?')) {
    await unsubscribeDevice();
  }
});
```

**Confirmation:** Prevents accidental unsubscription

**Flow:**

1. Confirm with user
2. Unsubscribe from push service
3. POST to `/unsubscribe`
4. Update UI to show unsubscribed state
5. Stop device polling
6. Stop auto-unsubscribe timer

### Send Notification Button

```javascript
document.getElementById('send-btn').addEventListener('click', async () => {
  await sendNotification();
});
```

**Validation:**

- Message not empty
- User is subscribed

**Flow:**

1. Get message from input
2. POST to `/send-notification`
3. Show success message with device count
4. Clear input

### Theme Toggle Button

```javascript
document.getElementById('theme-toggle').addEventListener('click', () => {
  toggleTheme();
});
```

**Behavior:**

- Cycles between light and dark themes
- Updates button emoji (☀️ ↔ 🌙)
- Saves preference to localStorage

## iOS-Specific Handling

### Detection

```javascript
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
}
```

### Limitations

```javascript
if (isIOS()) {
  // Show iOS warning
  updateStatus('iOS has limited push notification support. Install as PWA first.', 'warning');
}
```

**iOS Issues:**

- Push notifications only work in installed PWA (not browser)
- Must use Safari (Chrome/Firefox on iOS don't support)
- Requires iOS 16.4+ for any push support
- Subscription may fail silently

**Workarounds:**

1. Detect iOS early
2. Show install prompt
3. Guide user to "Add to Home Screen"
4. Test subscription after install

## Performance Optimizations

### Debounced Device Updates

```javascript
let updateDebounce = null;

function updateDeviceList() {
  if (updateDebounce) clearTimeout(updateDebounce);

  updateDebounce = setTimeout(async () => {
    try {
      const response = await fetch('/devices');
      const data = await response.json();
      state.devices = data.devices || [];
      renderDeviceList();
    } catch (error) {
      console.error('Failed to fetch devices:', error);
    }
  }, 200); // 200ms debounce
}
```

**Why debounce?**

- Prevents rapid-fire API calls
- Batches multiple calls into one
- Reduces server load

**How it works:**

1. Clear existing timeout
2. Set new timeout
3. Only executes if not called again within 200ms

### Visibility-Aware Polling

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling(); // Tab hidden, stop polling
  } else if (state.subscription) {
    startPolling(); // Tab visible, resume polling
  }
});
```

**Benefits:**

- Saves bandwidth when tab is hidden
- Reduces server load
- Improves battery life on mobile

### Data Saver Detection

```javascript
if (navigator.connection) {
  const connection = navigator.connection;

  if (connection.saveData) {
    console.log('Data saver enabled');
    // Reduce polling frequency or disable
  }

  if (connection.effectiveType === '2g') {
    console.log('Slow connection detected');
    // Increase poll interval or disable
  }
}
```

**Network Information API:**

- `saveData` - User enabled data saver
- `effectiveType` - Connection speed (4g, 3g, 2g, slow-2g)
- `downlink` - Bandwidth estimate (Mbps)

### Lazy Device Name Detection

```javascript
// Only detect when subscribing (not on page load)
function subscribeDevice() {
  // ... subscription logic
  const deviceName = getDeviceName(); // Called here, not at startup
  // ... send to server
}
```

**Why lazy?**

- User agent parsing is expensive
- Only needed once during subscription
- Doesn't block page load

## Error Handling

### Network Errors

```javascript
async function sendNotification() {
  try {
    const response = await fetch('/send-notification', {
      /* ... */
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    // Handle success
  } catch (error) {
    if (error.message === 'Failed to fetch') {
      updateStatus('Network error. Check connection.', 'error');
    } else {
      updateStatus('Error: ' + error.message, 'error');
    }
  }
}
```

**Error Types:**

- `Failed to fetch` - Network offline
- `404`, `500` - Server errors
- Custom error messages from server

### Permission Denied

```javascript
const permission = await Notification.requestPermission();

if (permission === 'denied') {
  updateStatus('Notifications blocked. Enable in browser settings.', 'error');
  // Show instructions for enabling
}
```

**Handling:**

- Show clear error message
- Provide instructions for enabling
- Can't programmatically re-request (browser security)

### Service Worker Errors

```javascript
try {
  const registration = await navigator.serviceWorker.register('/sw.js');
} catch (error) {
  console.error('SW registration failed:', error);

  if (error.name === 'SecurityError') {
    updateStatus('HTTPS required for Service Workers.', 'error');
  } else {
    updateStatus('SW registration failed: ' + error.message, 'error');
  }
}
```

**Common Errors:**

- `SecurityError` - Not served over HTTPS
- `TypeError` - SW file not found (404)
- `InvalidStateError` - SW already registering

## Debugging Tips

### Console Logging

```javascript
console.log('Device ID:', state.deviceId);
console.log('Subscription:', state.subscription);
console.log('VAPID Key:', state.vapidPublicKey);
```

**Inspect State:**

```javascript
// In browser console
window.state = state; // Expose state for debugging
```

### Service Worker Debugging

1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers**
4. See registration status, scope, and version
5. Click "Unregister" to reset
6. Click "Update" to force update

### Push Subscription Debugging

```javascript
console.log('Subscription Endpoint:', subscription.endpoint);
console.log('Keys:', subscription.keys);
console.log('JSON:', subscription.toJSON());
```

**Example Output:**

```javascript
{
  endpoint: "https://fcm.googleapis.com/fcm/send/...",
  keys: {
    p256dh: "BGYiP8CxH...",
    auth: "dKEw3RCM..."
  }
}
```

### Network Debugging

```javascript
// Add to all fetch calls
fetch('/devices')
  .then((response) => {
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    return response.json();
  })
  .then((data) => console.log('Response data:', data));
```

## Best Practices

1. **Always check browser support** - Service Workers not universal
2. **Handle permission denied gracefully** - Show instructions
3. **Use state for all data** - Single source of truth
4. **Debounce API calls** - Prevent rapid-fire requests
5. **Stop polling when hidden** - Save bandwidth
6. **Clear timers on unsubscribe** - Prevent memory leaks
7. **Show user-friendly errors** - Not technical details
8. **Log technical details** - For developer debugging
9. **Validate inputs** - Message not empty, user subscribed
10. **Test on multiple browsers** - Chrome, Firefox, Safari, Edge

## References

- [Push API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Service Worker API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Notification API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- [Web Push Notifications - web.dev](https://web.dev/push-notifications-overview/)
